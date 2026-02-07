import { Router, Request, Response, NextFunction } from 'express';
import { pushService } from '../services/push.service.js';

const router = Router();

// GET /api/push/vapid-public-key - Get VAPID public key for Push API
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  const key = pushService.getVapidPublicKey();

  if (!key) {
    return res.status(503).json({
      error: 'Push notifications not configured',
    });
  }

  return res.json({ publicKey: key });
});

// POST /api/push/subscribe - Store push subscription
router.post('/subscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subscription } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!subscription?.endpoint || !subscription?.keys) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }

    await pushService.subscribe(
      userId,
      subscription,
      req.headers['user-agent']
    );

    return res.status(201).json({ success: true });
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/push/unsubscribe - Remove push subscription
router.delete('/unsubscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { endpoint } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint required' });
    }

    await pushService.unsubscribe(userId, endpoint);

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

// GET /api/push/subscriptions - List user's subscriptions
router.get('/subscriptions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const subscriptions = await pushService.getSubscriptions(userId);

    return res.json({ subscriptions });
  } catch (error) {
    return next(error);
  }
});

export const pushRoutes = router;
