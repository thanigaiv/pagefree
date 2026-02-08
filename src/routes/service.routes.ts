import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';
import { serviceService } from '../services/service.service.js';
import { ServiceStatus } from '@prisma/client';

export const serviceRouter = Router();

// All service routes require authentication
serviceRouter.use(requireAuth);

// GET /api/services - List services with optional filters (SVC-04)
const ListServicesSchema = z.object({
  teamId: z.string().optional(),
  status: z.enum(['ACTIVE', 'DEPRECATED', 'ARCHIVED']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0)
});

serviceRouter.get('/', async (req, res) => {
  try {
    const params = ListServicesSchema.parse(req.query);
    const result = await serviceService.list(params);
    return res.json(result);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
    }
    console.error('Failed to list services:', error);
    return res.status(500).json({ error: 'Failed to list services' });
  }
});

// GET /api/services/:serviceId - Get service details
serviceRouter.get('/:serviceId', async (req, res) => {
  try {
    const service = await serviceService.get(req.params.serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }
    return res.json({ service });
  } catch (error) {
    console.error('Failed to get service:', error);
    return res.status(500).json({ error: 'Failed to get service' });
  }
});

// POST /api/services - Create service (platform admin only for now)
// SVC-01: name, description, routing key, owning team
// SVC-05: teamId is required
const CreateServiceSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  routingKey: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/,
    'Routing key must contain only alphanumeric characters, underscores, and hyphens'),
  teamId: z.string().min(1, 'Owning team is required'),  // SVC-05
  escalationPolicyId: z.string().optional(),
  tags: z.array(z.string().max(50)).max(20).optional()
});

serviceRouter.post('/', requirePlatformAdmin, async (req, res) => {
  try {
    const input = CreateServiceSchema.parse(req.body);
    const service = await serviceService.create(input, (req.user as any).id);
    return res.status(201).json({ service });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid service data', details: error.errors });
    }
    // Handle unique constraint violation (duplicate routing key)
    if (error.code === 'P2002' && error.meta?.target?.includes('routingKey')) {
      return res.status(409).json({ error: 'Routing key already exists' });
    }
    console.error('Failed to create service:', error);
    return res.status(500).json({ error: 'Failed to create service' });
  }
});

// PATCH /api/services/:serviceId - Update service metadata (SVC-02)
// Team admin of owning team or platform admin
const UpdateServiceSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  escalationPolicyId: z.string().nullable().optional()  // null to remove override
});

serviceRouter.patch('/:serviceId', async (req, res) => {
  try {
    // Get service to check team ownership
    const existing = await serviceService.get(req.params.serviceId);
    if (!existing) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Check authorization: platform admin or team admin of owning team
    const user = req.user as any;
    const isPlatformAdmin = user.platformRole === 'PLATFORM_ADMIN';
    const isTeamAdmin = user.teamMembers?.some(
      (m: any) => m.teamId === existing.teamId && m.role === 'TEAM_ADMIN'
    );

    if (!isPlatformAdmin && !isTeamAdmin) {
      return res.status(403).json({ error: 'Not authorized to update this service' });
    }

    const input = UpdateServiceSchema.parse(req.body);
    const service = await serviceService.update(req.params.serviceId, input, user.id);
    return res.json({ service });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid service data', details: error.errors });
    }
    console.error('Failed to update service:', error);
    return res.status(500).json({ error: 'Failed to update service' });
  }
});

// PATCH /api/services/:serviceId/status - Update service status (SVC-03)
// Archive or deprecate a service
const UpdateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DEPRECATED', 'ARCHIVED'])
});

serviceRouter.patch('/:serviceId/status', async (req, res) => {
  try {
    // Get service to check team ownership
    const existing = await serviceService.get(req.params.serviceId);
    if (!existing) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Check authorization: platform admin or team admin of owning team
    const user = req.user as any;
    const isPlatformAdmin = user.platformRole === 'PLATFORM_ADMIN';
    const isTeamAdmin = user.teamMembers?.some(
      (m: any) => m.teamId === existing.teamId && m.role === 'TEAM_ADMIN'
    );

    if (!isPlatformAdmin && !isTeamAdmin) {
      return res.status(403).json({ error: 'Not authorized to update this service' });
    }

    const { status } = UpdateStatusSchema.parse(req.body);
    const service = await serviceService.updateStatus(
      req.params.serviceId,
      status as ServiceStatus,
      user.id
    );
    return res.json({ service });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid status', details: error.errors });
    }
    console.error('Failed to update service status:', error);
    return res.status(500).json({ error: 'Failed to update service status' });
  }
});
