import { Router, Request, Response, NextFunction } from 'express';
import { preferencesService } from '../services/preferences.service.js';

const router = Router();

// GET /api/preferences - Get all user preferences
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const preferences = await preferencesService.get(userId);
    return res.json({ preferences });
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/preferences - Update user preferences
router.patch('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { dashboard, notifications } = req.body;

    const updated = await preferencesService.update(userId, {
      dashboard,
      notifications,
    });

    return res.json({ preferences: updated });
  } catch (error) {
    return next(error);
  }
});

// GET /api/preferences/dashboard - Get dashboard preferences only
router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const preferences = await preferencesService.getDashboardPreferences(userId);
    return res.json({ preferences });
  } catch (error) {
    return next(error);
  }
});

// PUT /api/preferences/dashboard - Set dashboard preferences
router.put('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    await preferencesService.setDashboardPreferences(userId, req.body);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

export const preferencesRoutes = router;
