import { Router, Request, Response, NextFunction } from 'express';
import { statusPageService } from '../services/statusPage.service.js';
import { statusComputationService } from '../services/statusComputation.service.js';
import { statusIncidentService } from '../services/statusIncident.service.js';
import { maintenanceService } from '../services/maintenance.service.js';
import { statusSubscriberService } from '../services/statusSubscriber.service.js';
import type { ComponentStatus, SubscriberChannel } from '../types/statusPage.js';

const router = Router();

// No requireAuth - these are public endpoints

// ============================================================================
// PUBLIC STATUS PAGE VIEWING
// ============================================================================

/**
 * GET /status/:slug - Get status page with computed statuses
 * Query param: token (for private pages)
 */
router.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;
    const { token } = req.query;

    // Get status page (verifies access token if not public)
    const statusPage = await statusPageService.getBySlug(slug, token as string);

    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Compute status for each component
    const componentsWithStatus = await Promise.all(
      statusPage.components.map(async (component: any) => {
        const status = await statusComputationService.getStatus(component.id);
        return {
          id: component.id,
          name: component.name,
          description: component.description,
          status,
          statusUpdatedAt: component.statusUpdatedAt,
          displayOrder: component.displayOrder
        };
      })
    );

    // Compute overall status (worst of all components)
    const componentStatuses = componentsWithStatus.map((c) => c.status as ComponentStatus);
    const overallStatus = statusComputationService.computeOverallStatus(componentStatuses);

    return res.json({
      id: statusPage.id,
      name: statusPage.name,
      description: statusPage.description,
      slug: statusPage.slug,
      overallStatus,
      components: componentsWithStatus,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /status/:slug/history - Recent incidents for status page
 * Query: days (default 7, max 90)
 */
router.get('/:slug/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;
    const { token, days } = req.query;

    // Verify access
    const statusPage = await statusPageService.getBySlug(slug, token as string);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Parse and validate days parameter
    let daysCount = 7;
    if (days) {
      daysCount = Math.min(Math.max(parseInt(days as string, 10) || 7, 1), 90);
    }

    const history = await statusIncidentService.getHistory(statusPage.id, daysCount);

    return res.json({ history });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /status/:slug/maintenance - Upcoming/active maintenance
 */
router.get('/:slug/maintenance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;
    const { token } = req.query;

    // Verify access
    const statusPage = await statusPageService.getBySlug(slug, token as string);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Get scheduled and in-progress maintenance
    const maintenance = await maintenanceService.listByStatusPage(statusPage.id, {
      upcoming: true
    });

    return res.json({ maintenance });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /status/:slug/incidents - Active incidents for status page
 */
router.get('/:slug/incidents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;
    const { token } = req.query;

    // Verify access
    const statusPage = await statusPageService.getBySlug(slug, token as string);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Get active (non-resolved) incidents
    const incidents = await statusIncidentService.listByStatusPage(statusPage.id, {
      includeResolved: false
    });

    return res.json({ incidents });
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// SUBSCRIBER SELF-SERVICE
// ============================================================================

/**
 * POST /status/:slug/subscribe - Subscribe to updates
 * Body: { channel, destination, componentIds?, notifyOn? }
 */
router.post('/:slug/subscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;
    const { token } = req.query;
    const { channel, destination, componentIds, notifyOn } = req.body;

    // Verify access (private pages still need token)
    const statusPage = await statusPageService.getBySlug(slug, token as string);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Validate required fields
    if (!channel || !destination) {
      return res.status(400).json({ error: 'channel and destination are required' });
    }

    // Validate channel type
    const validChannels = ['EMAIL', 'SLACK', 'WEBHOOK'];
    if (!validChannels.includes(channel)) {
      return res.status(400).json({
        error: `Invalid channel. Must be one of: ${validChannels.join(', ')}`
      });
    }

    // Call the subscriber service
    const result = await statusSubscriberService.subscribe(
      statusPage.id,
      channel as SubscriberChannel,
      destination,
      {
        componentIds,
        notifyOn
      }
    );

    return res.status(201).json({
      success: true,
      subscriberId: result.subscriber.id,
      requiresVerification: result.requiresVerification,
      message: result.requiresVerification
        ? 'Please check your email to verify your subscription'
        : 'Subscription created successfully'
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Already subscribed') {
      return res.status(409).json({ error: 'Already subscribed to this status page' });
    }
    return next(error);
  }
});

/**
 * GET /status/subscribe/verify - Verify email subscription
 * Query: token
 */
router.get('/subscribe/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const verified = await statusSubscriberService.verify(token as string);

    if (!verified) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification token'
      });
    }

    return res.json({
      success: true,
      message: 'Email verified successfully. You are now subscribed to status updates.'
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /status/unsubscribe - Unsubscribe link handler
 * Query: statusPageId and destination
 */
router.get('/unsubscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statusPageId, destination } = req.query;

    if (!statusPageId || !destination) {
      return res.status(400).json({ error: 'statusPageId and destination are required' });
    }

    const unsubscribed = await statusSubscriberService.unsubscribeByDestination(
      statusPageId as string,
      destination as string
    );

    if (!unsubscribed) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }

    return res.json({
      success: true,
      message: 'You have been unsubscribed from status updates.'
    });
  } catch (error) {
    return next(error);
  }
});

export const statusPublicRoutes = router;
