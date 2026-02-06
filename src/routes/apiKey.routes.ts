import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';
import { apiKeyService, ApiKeyScope } from '../services/apiKey.service.js';

export const apiKeyRouter = Router();

// All API key management routes require platform admin
apiKeyRouter.use(requireAuth);
apiKeyRouter.use(requirePlatformAdmin);

// POST /api/keys - Create new API key
const CreateKeySchema = z.object({
  name: z.string().min(3).max(100),
  service: z.string().min(1),
  description: z.string().optional(),
  scopes: z.array(z.string()),
  expiresInDays: z.number().min(1).max(365).optional()
});

apiKeyRouter.post('/', async (req, res) => {
  try {
    const parsed = CreateKeySchema.parse(req.body);
    const userId = (req.user as any).id;

    // Calculate expiry if specified
    const expiresAt = parsed.expiresInDays
      ? new Date(Date.now() + parsed.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const { key, record } = await apiKeyService.create({
      name: parsed.name,
      service: parsed.service,
      description: parsed.description,
      scopes: parsed.scopes as ApiKeyScope[],
      expiresAt,
      createdById: userId
    });

    // Return key ONCE (only time user sees plaintext)
    res.status(201).json({
      key, // Plaintext key - save this!
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      service: record.service,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ error: 'Invalid request data' });
      return;
    }
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// GET /api/keys - List API keys
const ListKeysSchema = z.object({
  service: z.string().optional(),
  includeInactive: z.coerce.boolean().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0)
});

apiKeyRouter.get('/', async (req, res) => {
  try {
    const params = ListKeysSchema.parse(req.query);
    const result = await apiKeyService.list(params);
    res.json(result);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ error: 'Invalid query parameters' });
      return;
    }
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// DELETE /api/keys/:id - Revoke API key
apiKeyRouter.delete('/:id', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    await apiKeyService.revoke(req.params.id, userId);
    res.json({ success: true, message: 'API key revoked' });
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// DELETE /api/keys/:id/permanent - Permanently delete API key
apiKeyRouter.delete('/:id/permanent', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    await apiKeyService.delete(req.params.id, userId);
    res.json({ success: true, message: 'API key deleted permanently' });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// Example: Protect webhook endpoint with API key
// import { apiKeyAuth } from './middleware/apiKeyAuth';
//
// app.post('/webhooks/datadog',
//   apiKeyAuth('webhooks:write'),
//   async (req, res) => {
//     // req.apiKey contains validated key info
//     // Handle webhook...
//   }
// );
