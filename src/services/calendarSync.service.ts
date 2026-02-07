import { prisma } from '../config/database.js';
import { env, isGoogleCalendarConfigured, isMicrosoftCalendarConfigured } from '../config/env.js';
import { google } from 'googleapis';
import { Client } from '@microsoft/microsoft-graph-client';
import { DateTime } from 'luxon';
import { onCallService } from './oncall.service.js';
import type { CalendarSync } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

interface Shift {
  scheduleId: string;
  scheduleName: string;
  shiftStart: Date;
  shiftEnd: Date;
}

interface SyncResult {
  created: number;
  deleted: number;
}

// ============================================================================
// CALENDAR SYNC SERVICE
// ============================================================================

export class CalendarSyncService {
  // ============================================================================
  // GOOGLE OAUTH
  // ============================================================================

  getGoogleAuthUrl(userId: string, redirectUri: string): string {
    if (!isGoogleCalendarConfigured()) {
      throw new Error('Google Calendar not configured - missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    }

    const oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
      state: userId, // Pass userId through OAuth flow
      prompt: 'consent', // Force refresh token
    });
  }

  async handleGoogleCallback(code: string, userId: string, redirectUri: string): Promise<CalendarSync> {
    if (!isGoogleCalendarConfigured()) {
      throw new Error('Google Calendar not configured');
    }

    const oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);

    // Get calendar list to find primary calendar
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendarList = await calendar.calendarList.list();
    const primaryCalendar = calendarList.data.items?.find(c => c.primary) || calendarList.data.items?.[0];

    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
      throw new Error('Failed to obtain required tokens from Google OAuth');
    }

    // Store in database
    return await prisma.calendarSync.upsert({
      where: { userId_provider: { userId, provider: 'google' } },
      create: {
        userId,
        provider: 'google',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(tokens.expiry_date),
        calendarId: primaryCalendar?.id || 'primary',
        calendarName: primaryCalendar?.summary || 'Primary',
        isActive: true,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined, // Refresh token not always returned
        tokenExpiresAt: new Date(tokens.expiry_date),
        calendarId: primaryCalendar?.id || 'primary',
        calendarName: primaryCalendar?.summary || 'Primary',
        isActive: true,
        lastSyncError: null,
      },
    });
  }

  // ============================================================================
  // MICROSOFT OAUTH
  // ============================================================================

  getMicrosoftAuthUrl(userId: string, redirectUri: string): string {
    if (!isMicrosoftCalendarConfigured()) {
      throw new Error('Microsoft Calendar not configured - missing MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, or MICROSOFT_TENANT_ID');
    }

    const authUrl = new URL(`https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set('client_id', env.MICROSOFT_CLIENT_ID!);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('scope', 'Calendars.ReadWrite offline_access');
    authUrl.searchParams.set('state', userId);

    return authUrl.toString();
  }

  async handleMicrosoftCallback(code: string, userId: string, redirectUri: string): Promise<CalendarSync> {
    if (!isMicrosoftCalendarConfigured()) {
      throw new Error('Microsoft Calendar not configured');
    }

    // Exchange code for tokens
    const tokenUrl = `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID!,
      client_secret: env.MICROSOFT_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange Microsoft auth code: ${error}`);
    }

    const tokens = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    if (!tokens.access_token || !tokens.refresh_token || !tokens.expires_in) {
      throw new Error('Failed to obtain required tokens from Microsoft OAuth');
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Get default calendar
    const client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => tokens.access_token,
      },
    });

    const defaultCalendar = await client.api('/me/calendar').get();

    // Store in database
    return await prisma.calendarSync.upsert({
      where: { userId_provider: { userId, provider: 'microsoft' } },
      create: {
        userId,
        provider: 'microsoft',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: expiresAt,
        calendarId: defaultCalendar.id || 'default',
        calendarName: defaultCalendar.name || 'Calendar',
        isActive: true,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: expiresAt,
        calendarId: defaultCalendar.id || 'default',
        calendarName: defaultCalendar.name || 'Calendar',
        isActive: true,
        lastSyncError: null,
      },
    });
  }

  // ============================================================================
  // TOKEN REFRESH
  // ============================================================================

  private async refreshGoogleToken(sync: CalendarSync): Promise<string> {
    const oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      refresh_token: sync.refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    if (!credentials.access_token || !credentials.expiry_date) {
      throw new Error('Failed to refresh Google access token');
    }

    // Update database with new token
    await prisma.calendarSync.update({
      where: { id: sync.id },
      data: {
        accessToken: credentials.access_token,
        tokenExpiresAt: new Date(credentials.expiry_date),
      },
    });

    return credentials.access_token;
  }

  private async refreshMicrosoftToken(sync: CalendarSync): Promise<string> {
    const tokenUrl = `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID!,
      client_secret: env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: sync.refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh Microsoft token: ${error}`);
    }

    const tokens = await response.json() as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    if (!tokens.access_token || !tokens.expires_in) {
      throw new Error('Failed to obtain refreshed Microsoft access token');
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Update database with new token
    await prisma.calendarSync.update({
      where: { id: sync.id },
      data: {
        accessToken: tokens.access_token,
        tokenExpiresAt: expiresAt,
        refreshToken: tokens.refresh_token || sync.refreshToken, // Update if new refresh token provided
      },
    });

    return tokens.access_token;
  }

  private async getValidAccessToken(sync: CalendarSync): Promise<string> {
    const now = new Date();
    const expiresAt = new Date(sync.tokenExpiresAt);

    // Refresh if token expires in less than 5 minutes
    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      if (sync.provider === 'google') {
        return await this.refreshGoogleToken(sync);
      } else if (sync.provider === 'microsoft') {
        return await this.refreshMicrosoftToken(sync);
      }
    }

    return sync.accessToken;
  }

  // ============================================================================
  // SYNC LOGIC
  // ============================================================================

  async syncUserShifts(userId: string, days: number = 30): Promise<SyncResult> {
    const syncs = await prisma.calendarSync.findMany({
      where: { userId, isActive: true },
    });

    let totalCreated = 0;
    let totalDeleted = 0;

    for (const sync of syncs) {
      try {
        const accessToken = await this.getValidAccessToken(sync);
        const shifts = await onCallService.getUpcomingShifts(userId, days);

        if (sync.provider === 'google') {
          const result = await this.syncToGoogle(sync, accessToken, shifts);
          totalCreated += result.created;
          totalDeleted += result.deleted;
        } else if (sync.provider === 'microsoft') {
          const result = await this.syncToMicrosoft(sync, accessToken, shifts);
          totalCreated += result.created;
          totalDeleted += result.deleted;
        }

        // Update sync state
        await prisma.calendarSync.update({
          where: { id: sync.id },
          data: {
            lastSyncAt: new Date(),
            syncedUntil: DateTime.now().plus({ days }).toJSDate(),
            lastSyncError: null,
          },
        });
      } catch (error: any) {
        await prisma.calendarSync.update({
          where: { id: sync.id },
          data: { lastSyncError: error.message },
        });
        throw error; // Re-throw for API response
      }
    }

    return { created: totalCreated, deleted: totalDeleted };
  }

  private async syncToGoogle(sync: CalendarSync, accessToken: string, shifts: Shift[]): Promise<SyncResult> {
    const oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Get existing events created by this app (use extended property to track)
    const now = DateTime.now();
    const endWindow = now.plus({ days: 30 });

    const existingEvents = await calendar.events.list({
      calendarId: sync.calendarId,
      timeMin: now.toISO()!,
      timeMax: endWindow.toISO()!,
      privateExtendedProperty: ['oncall=true'],
      singleEvents: true,
    });

    // Delete existing on-call events (we'll recreate them)
    let deleted = 0;
    if (existingEvents.data.items) {
      for (const event of existingEvents.data.items) {
        if (event.id) {
          await calendar.events.delete({
            calendarId: sync.calendarId,
            eventId: event.id,
          });
          deleted++;
        }
      }
    }

    // Create new events for shifts
    let created = 0;
    for (const shift of shifts) {
      await calendar.events.insert({
        calendarId: sync.calendarId,
        requestBody: {
          summary: `On-Call: ${shift.scheduleName}`,
          start: {
            dateTime: shift.shiftStart.toISOString(),
          },
          end: {
            dateTime: shift.shiftEnd.toISOString(),
          },
          description: `You are on-call for ${shift.scheduleName}`,
          extendedProperties: {
            private: {
              oncall: 'true',
              scheduleId: shift.scheduleId,
            },
          },
          colorId: '11', // Red color for visibility
        },
      });
      created++;
    }

    return { created, deleted };
  }

  private async syncToMicrosoft(_sync: CalendarSync, accessToken: string, shifts: Shift[]): Promise<SyncResult> {
    const client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => accessToken,
      },
    });

    // Get existing events (filter by subject prefix)
    const now = DateTime.now();
    const endWindow = now.plus({ days: 30 });

    const existingEventsResponse = await client
      .api('/me/calendar/events')
      .filter(`start/dateTime ge '${now.toISO()}' and end/dateTime le '${endWindow.toISO()}' and startsWith(subject, 'On-Call:')`)
      .get();

    // Delete existing on-call events
    let deleted = 0;
    if (existingEventsResponse.value) {
      for (const event of existingEventsResponse.value) {
        await client.api(`/me/calendar/events/${event.id}`).delete();
        deleted++;
      }
    }

    // Create new events for shifts
    let created = 0;
    for (const shift of shifts) {
      await client.api('/me/calendar/events').post({
        subject: `On-Call: ${shift.scheduleName}`,
        start: {
          dateTime: shift.shiftStart.toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: shift.shiftEnd.toISOString(),
          timeZone: 'UTC',
        },
        body: {
          contentType: 'Text',
          content: `You are on-call for ${shift.scheduleName}`,
        },
        isReminderOn: true,
        reminderMinutesBeforeStart: 60,
      });
      created++;
    }

    return { created, deleted };
  }

  // ============================================================================
  // MANAGEMENT
  // ============================================================================

  async getUserConnections(userId: string): Promise<CalendarSync[]> {
    return await prisma.calendarSync.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async disconnectProvider(userId: string, provider: string): Promise<void> {
    await prisma.calendarSync.deleteMany({
      where: { userId, provider },
    });
  }
}

export const calendarSyncService = new CalendarSyncService();
