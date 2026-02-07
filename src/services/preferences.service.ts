import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';

interface DashboardPreferences {
  defaultFilters?: {
    status?: string[];
    priority?: string[];
    teamId?: string;
  };
  defaultSort?: string;
  pageSize?: number;
  expandedView?: boolean;
}

interface NotificationPreferences {
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

interface UserPreferences {
  dashboard?: DashboardPreferences;
  notifications?: NotificationPreferences;
}

class PreferencesService {
  // Get user preferences
  async get(userId: string): Promise<UserPreferences> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    // Return stored preferences or empty object
    return (user?.preferences as UserPreferences) || {};
  }

  // Update user preferences (merge with existing)
  async update(userId: string, preferences: Partial<UserPreferences>): Promise<UserPreferences> {
    const existing = await this.get(userId);

    // Deep merge preferences
    const merged: UserPreferences = {
      dashboard: {
        ...existing.dashboard,
        ...preferences.dashboard,
      },
      notifications: {
        ...existing.notifications,
        ...preferences.notifications,
      },
    };

    await prisma.user.update({
      where: { id: userId },
      data: { preferences: merged as any },
    });

    logger.debug({ userId }, 'User preferences updated');

    return merged;
  }

  // Set dashboard preferences
  async setDashboardPreferences(
    userId: string,
    dashboard: DashboardPreferences
  ): Promise<void> {
    await this.update(userId, { dashboard });
  }

  // Get dashboard preferences
  async getDashboardPreferences(userId: string): Promise<DashboardPreferences> {
    const prefs = await this.get(userId);
    return prefs.dashboard || {};
  }
}

export const preferencesService = new PreferencesService();
