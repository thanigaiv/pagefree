import express from 'express';
import { calendarSyncService } from '../services/calendarSync.service.js';
import { requireAuth } from '../middleware/auth.js';
import { isGoogleCalendarConfigured, isMicrosoftCalendarConfigured, env } from '../config/env.js';

const router = express.Router();

// ============================================================================
// GOOGLE OAUTH
// ============================================================================

// Initiate Google OAuth flow
router.get('/google/connect', requireAuth, (req, res) => {
  try {
    if (!isGoogleCalendarConfigured()) {
      return res.status(503).json({
        error: 'Google Calendar integration not configured',
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set',
      });
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/calendar/google/callback`;
    const authUrl = calendarSyncService.getGoogleAuthUrl(req.user!.id, redirectUri);

    return res.redirect(authUrl);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Handle Google OAuth callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state: userId, error } = req.query;

    if (error) {
      return res.redirect(`${env.FRONTEND_URL || 'http://localhost:3000'}/settings?calendar_error=${error}`);
    }

    if (!code || !userId || typeof code !== 'string' || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/calendar/google/callback`;
    await calendarSyncService.handleGoogleCallback(code, userId, redirectUri);

    return res.redirect(`${env.FRONTEND_URL || 'http://localhost:3000'}/settings?calendar_connected=google`);
  } catch (error: any) {
    return res.redirect(`${env.FRONTEND_URL || 'http://localhost:3000'}/settings?calendar_error=${encodeURIComponent(error.message)}`);
  }
});

// ============================================================================
// MICROSOFT OAUTH
// ============================================================================

// Initiate Microsoft OAuth flow
router.get('/microsoft/connect', requireAuth, (req, res) => {
  try {
    if (!isMicrosoftCalendarConfigured()) {
      return res.status(503).json({
        error: 'Microsoft Calendar integration not configured',
        message: 'MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_TENANT_ID must be set',
      });
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/calendar/microsoft/callback`;
    const authUrl = calendarSyncService.getMicrosoftAuthUrl(req.user!.id, redirectUri);

    return res.redirect(authUrl);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Handle Microsoft OAuth callback
router.get('/microsoft/callback', async (req, res) => {
  try {
    const { code, state: userId, error } = req.query;

    if (error) {
      return res.redirect(`${env.FRONTEND_URL || 'http://localhost:3000'}/settings?calendar_error=${error}`);
    }

    if (!code || !userId || typeof code !== 'string' || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/calendar/microsoft/callback`;
    await calendarSyncService.handleMicrosoftCallback(code, userId, redirectUri);

    return res.redirect(`${env.FRONTEND_URL || 'http://localhost:3000'}/settings?calendar_connected=microsoft`);
  } catch (error: any) {
    return res.redirect(`${env.FRONTEND_URL || 'http://localhost:3000'}/settings?calendar_error=${encodeURIComponent(error.message)}`);
  }
});

// ============================================================================
// MANAGEMENT ROUTES
// ============================================================================

// Get user's calendar connections
router.get('/connections', requireAuth, async (req, res) => {
  try {
    const connections = await calendarSyncService.getUserConnections(req.user!.id);

    // Hide sensitive tokens
    const sanitized = connections.map(conn => ({
      id: conn.id,
      provider: conn.provider,
      calendarId: conn.calendarId,
      calendarName: conn.calendarName,
      isActive: conn.isActive,
      lastSyncAt: conn.lastSyncAt,
      syncedUntil: conn.syncedUntil,
      lastSyncError: conn.lastSyncError,
      createdAt: conn.createdAt,
    }));

    return res.json({ connections: sanitized });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Trigger manual sync
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    if (days < 1 || days > 90) {
      return res.status(400).json({ error: 'Days must be between 1 and 90' });
    }

    const result = await calendarSyncService.syncUserShifts(req.user!.id, days);

    return res.json({
      success: true,
      created: result.created,
      deleted: result.deleted,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Disconnect a calendar provider
router.delete('/:provider', requireAuth, async (req, res) => {
  try {
    const { provider } = req.params;

    if (provider !== 'google' && provider !== 'microsoft') {
      return res.status(400).json({ error: 'Invalid provider. Must be "google" or "microsoft"' });
    }

    await calendarSyncService.disconnectProvider(req.user!.id, provider);

    return res.status(204).send();
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Check which providers are configured (public endpoint)
router.get('/status', (_req, res) => {
  res.json({
    google: isGoogleCalendarConfigured(),
    microsoft: isMicrosoftCalendarConfigured(),
  });
});

export default router;
