/**
 * Status Page Integration Tests
 *
 * Comprehensive tests covering:
 * - Status page CRUD operations
 * - Public/private access control
 * - Status computation service
 * - Maintenance window scheduling
 * - Subscriber service
 *
 * Tests the core STATUS-01 (view status pages) functionality.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { prisma } from '../config/database.js';
import { statusPageService } from '../services/statusPage.service.js';
import { statusComputationService } from '../services/statusComputation.service.js';
import { maintenanceService } from '../services/maintenance.service.js';
import { statusSubscriberService } from '../services/statusSubscriber.service.js';

// Mock Redis for tests
vi.mock('../config/redis.js', () => ({
  getRedisClient: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  })),
}));

// Mock BullMQ queues
vi.mock('../queues/maintenance.queue.js', () => ({
  scheduleMaintenanceJobs: vi.fn().mockResolvedValue(undefined),
  cancelMaintenanceJobs: vi.fn().mockResolvedValue(undefined),
}));

// Mock notification service
vi.mock('../services/statusNotification.service.js', () => ({
  statusNotificationService: {
    notifyStatusChange: vi.fn().mockResolvedValue(undefined),
    notifyMaintenanceStarted: vi.fn().mockResolvedValue(undefined),
    notifyMaintenanceCompleted: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock socket service
vi.mock('../services/socket.service.js', () => ({
  socketService: {
    broadcast: vi.fn(),
  },
}));

// Mock status notification queue for subscriber tests
vi.mock('../queues/statusNotification.queue.js', () => ({
  statusNotificationQueue: {
    add: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
  },
}));

// ============================================================================
// STATUS PAGE SERVICE TESTS
// ============================================================================

describe('Status Page Service', () => {
  let testTeam: Awaited<ReturnType<typeof prisma.team.create>>;
  let testUser: Awaited<ReturnType<typeof prisma.user.create>>;

  beforeAll(async () => {
    // Create test team and user
    testUser = await prisma.user.create({
      data: {
        email: `status-test-${Date.now()}@example.com`,
        firstName: 'Status',
        lastName: 'Test',
        platformRole: 'USER',
      },
    });

    testTeam = await prisma.team.create({
      data: { name: `Status Test Team ${Date.now()}` },
    });
  });

  afterAll(async () => {
    // Cleanup in correct order
    await prisma.statusSubscriber.deleteMany({ where: { statusPage: { teamId: testTeam.id } } });
    await prisma.maintenanceWindow.deleteMany({ where: { statusPage: { teamId: testTeam.id } } });
    await prisma.statusPageComponent.deleteMany({ where: { statusPage: { teamId: testTeam.id } } });
    await prisma.statusPage.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.team.delete({ where: { id: testTeam.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  describe('create', () => {
    it('should create a status page with auto-generated slug', async () => {
      const page = await statusPageService.create({
        name: 'Test Status Page',
        description: 'Test description',
        teamId: testTeam.id,
        createdById: testUser.id,
        isPublic: true,
      });

      expect(page.id).toBeDefined();
      expect(page.name).toBe('Test Status Page');
      expect(page.slug).toContain('test-status-page');
      expect(page.isPublic).toBe(true);
      expect(page.accessToken).toBeNull(); // Public pages don't need token

      // Cleanup
      await prisma.statusPage.delete({ where: { id: page.id } });
    });

    it('should generate access token for private pages', async () => {
      const page = await statusPageService.create({
        name: 'Private Page',
        teamId: testTeam.id,
        createdById: testUser.id,
        isPublic: false,
      });

      expect(page.accessToken).toBeDefined();
      expect(page.accessToken).toHaveLength(64); // 32 bytes hex

      // Cleanup
      await prisma.statusPage.delete({ where: { id: page.id } });
    });
  });

  describe('getBySlug', () => {
    it('should return public page without token', async () => {
      const created = await statusPageService.create({
        name: 'Public Test',
        teamId: testTeam.id,
        createdById: testUser.id,
        isPublic: true,
      });

      const page = await statusPageService.getBySlug(created.slug);
      expect(page).not.toBeNull();
      expect(page?.name).toBe('Public Test');

      // Cleanup
      await prisma.statusPage.delete({ where: { id: created.id } });
    });

    it('should require token for private page', async () => {
      const created = await statusPageService.create({
        name: 'Private Test',
        teamId: testTeam.id,
        createdById: testUser.id,
        isPublic: false,
      });

      const withoutToken = await statusPageService.getBySlug(created.slug);
      expect(withoutToken).toBeNull();

      const withToken = await statusPageService.getBySlug(created.slug, created.accessToken!);
      expect(withToken).not.toBeNull();

      // Cleanup
      await prisma.statusPage.delete({ where: { id: created.id } });
    });
  });

  describe('update', () => {
    it('should update status page fields', async () => {
      const created = await statusPageService.create({
        name: 'Update Test',
        teamId: testTeam.id,
        createdById: testUser.id,
        isPublic: true,
      });

      const updated = await statusPageService.update(created.id, {
        name: 'Updated Name',
        description: 'New description',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('New description');

      // Cleanup
      await prisma.statusPage.delete({ where: { id: created.id } });
    });

    it('should generate token when making page private', async () => {
      const created = await statusPageService.create({
        name: 'Make Private Test',
        teamId: testTeam.id,
        createdById: testUser.id,
        isPublic: true,
      });

      await statusPageService.update(created.id, { isPublic: false });

      // Fetch to check token was generated
      const fetched = await prisma.statusPage.findUnique({
        where: { id: created.id },
        select: { accessToken: true, isPublic: true },
      });

      expect(fetched?.isPublic).toBe(false);
      expect(fetched?.accessToken).toBeDefined();
      expect(fetched?.accessToken).toHaveLength(64);

      // Cleanup
      await prisma.statusPage.delete({ where: { id: created.id } });
    });
  });

  describe('regenerateAccessToken', () => {
    it('should generate new token', async () => {
      const created = await statusPageService.create({
        name: 'Token Regen Test',
        teamId: testTeam.id,
        createdById: testUser.id,
        isPublic: false,
      });

      const originalToken = created.accessToken;
      const newToken = await statusPageService.regenerateAccessToken(created.id);

      expect(newToken).not.toBe(originalToken);
      expect(newToken).toHaveLength(64);

      // Cleanup
      await prisma.statusPage.delete({ where: { id: created.id } });
    });
  });
});

// ============================================================================
// STATUS COMPUTATION SERVICE TESTS
// ============================================================================

describe('Status Computation Service', () => {
  let testTeam: Awaited<ReturnType<typeof prisma.team.create>>;
  let testUser: Awaited<ReturnType<typeof prisma.user.create>>;
  let statusPage: Awaited<ReturnType<typeof prisma.statusPage.create>>;
  let component: Awaited<ReturnType<typeof prisma.statusPageComponent.create>>;

  beforeAll(async () => {
    testUser = await prisma.user.create({
      data: {
        email: `compute-test-${Date.now()}@example.com`,
        firstName: 'Compute',
        lastName: 'Test',
        platformRole: 'USER',
      },
    });

    testTeam = await prisma.team.create({
      data: { name: `Compute Test Team ${Date.now()}` },
    });

    statusPage = await prisma.statusPage.create({
      data: {
        name: 'Compute Test Page',
        slug: `compute-test-${Date.now()}`,
        teamId: testTeam.id,
        createdById: testUser.id,
        isPublic: true,
      },
    });

    component = await prisma.statusPageComponent.create({
      data: {
        statusPageId: statusPage.id,
        name: 'Test Component',
        teamId: testTeam.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.incident.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.escalationPolicy.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.statusPageComponent.deleteMany({ where: { statusPageId: statusPage.id } });
    await prisma.statusPage.delete({ where: { id: statusPage.id } });
    await prisma.team.delete({ where: { id: testTeam.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  describe('computeStatus', () => {
    it('should return OPERATIONAL when no active incidents', async () => {
      const status = await statusComputationService.computeStatus(component.id);
      expect(status).toBe('OPERATIONAL');
    });

    it('should return MAJOR_OUTAGE for CRITICAL incident', async () => {
      // Create escalation policy and incident
      const policy = await prisma.escalationPolicy.create({
        data: {
          teamId: testTeam.id,
          name: 'Test Policy',
          isDefault: true,
        },
      });

      const incident = await prisma.incident.create({
        data: {
          fingerprint: `test-${Date.now()}`,
          teamId: testTeam.id,
          escalationPolicyId: policy.id,
          status: 'OPEN',
          priority: 'CRITICAL',
        },
      });

      const status = await statusComputationService.computeStatus(component.id);
      expect(status).toBe('MAJOR_OUTAGE');

      // Cleanup
      await prisma.incident.delete({ where: { id: incident.id } });
      await prisma.escalationPolicy.delete({ where: { id: policy.id } });
    });

    it('should return DEGRADED_PERFORMANCE for MEDIUM incident', async () => {
      const policy = await prisma.escalationPolicy.create({
        data: {
          teamId: testTeam.id,
          name: 'Test Policy 2',
          isDefault: false,
        },
      });

      const incident = await prisma.incident.create({
        data: {
          fingerprint: `test-medium-${Date.now()}`,
          teamId: testTeam.id,
          escalationPolicyId: policy.id,
          status: 'OPEN',
          priority: 'MEDIUM',
        },
      });

      const status = await statusComputationService.computeStatus(component.id);
      expect(status).toBe('DEGRADED_PERFORMANCE');

      // Cleanup
      await prisma.incident.delete({ where: { id: incident.id } });
      await prisma.escalationPolicy.delete({ where: { id: policy.id } });
    });
  });

  describe('computeOverallStatus', () => {
    it('should return OPERATIONAL for empty array', () => {
      const status = statusComputationService.computeOverallStatus([]);
      expect(status).toBe('OPERATIONAL');
    });

    it('should return worst status', () => {
      const status = statusComputationService.computeOverallStatus([
        'OPERATIONAL',
        'DEGRADED_PERFORMANCE',
        'PARTIAL_OUTAGE',
      ]);
      expect(status).toBe('PARTIAL_OUTAGE');
    });

    it('should handle MAJOR_OUTAGE as worst', () => {
      const status = statusComputationService.computeOverallStatus([
        'OPERATIONAL',
        'MAJOR_OUTAGE',
        'UNDER_MAINTENANCE',
      ]);
      expect(status).toBe('MAJOR_OUTAGE');
    });
  });
});

// ============================================================================
// MAINTENANCE SERVICE TESTS
// ============================================================================

describe('Maintenance Service', () => {
  let testTeam: Awaited<ReturnType<typeof prisma.team.create>>;
  let testUser: Awaited<ReturnType<typeof prisma.user.create>>;
  let statusPage: Awaited<ReturnType<typeof prisma.statusPage.create>>;
  let component: Awaited<ReturnType<typeof prisma.statusPageComponent.create>>;

  beforeAll(async () => {
    testUser = await prisma.user.create({
      data: {
        email: `maint-test-${Date.now()}@example.com`,
        firstName: 'Maint',
        lastName: 'Test',
        platformRole: 'USER',
      },
    });

    testTeam = await prisma.team.create({
      data: { name: `Maint Test Team ${Date.now()}` },
    });

    statusPage = await prisma.statusPage.create({
      data: {
        name: 'Maint Test Page',
        slug: `maint-test-${Date.now()}`,
        teamId: testTeam.id,
        createdById: testUser.id,
        isPublic: true,
      },
    });

    component = await prisma.statusPageComponent.create({
      data: {
        statusPageId: statusPage.id,
        name: 'Maint Component',
      },
    });
  });

  afterAll(async () => {
    await prisma.maintenanceWindow.deleteMany({ where: { statusPageId: statusPage.id } });
    await prisma.statusPageComponent.deleteMany({ where: { statusPageId: statusPage.id } });
    await prisma.statusPage.delete({ where: { id: statusPage.id } });
    await prisma.team.delete({ where: { id: testTeam.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  describe('create', () => {
    it('should create maintenance window with components', async () => {
      const startTime = new Date(Date.now() + 3600000); // 1 hour from now
      const endTime = new Date(Date.now() + 7200000); // 2 hours from now

      const maintenance = await maintenanceService.create(statusPage.id, testUser.id, {
        title: 'Test Maintenance',
        description: 'Test description',
        componentIds: [component.id],
        startTime,
        endTime,
        autoUpdateStatus: true,
        notifySubscribers: false,
      });

      expect(maintenance.id).toBeDefined();
      expect(maintenance.title).toBe('Test Maintenance');
      expect(maintenance.status).toBe('SCHEDULED');
      expect(maintenance.components).toHaveLength(1);

      // Cleanup
      await prisma.maintenanceWindow.delete({ where: { id: maintenance.id } });
    });

    it('should reject end time before start time', async () => {
      const startTime = new Date(Date.now() + 7200000);
      const endTime = new Date(Date.now() + 3600000);

      await expect(
        maintenanceService.create(statusPage.id, testUser.id, {
          title: 'Bad Maintenance',
          componentIds: [component.id],
          startTime,
          endTime,
          autoUpdateStatus: true,
          notifySubscribers: false,
        })
      ).rejects.toThrow('End time must be after start time');
    });

    it('should reject invalid component IDs', async () => {
      const startTime = new Date(Date.now() + 3600000);
      const endTime = new Date(Date.now() + 7200000);

      await expect(
        maintenanceService.create(statusPage.id, testUser.id, {
          title: 'Bad Components',
          componentIds: ['invalid-component-id'],
          startTime,
          endTime,
          autoUpdateStatus: true,
          notifySubscribers: false,
        })
      ).rejects.toThrow('Some component IDs do not belong to this status page');
    });
  });

  describe('cancel', () => {
    it('should set status to CANCELLED', async () => {
      const startTime = new Date(Date.now() + 3600000);
      const endTime = new Date(Date.now() + 7200000);

      const maintenance = await maintenanceService.create(statusPage.id, testUser.id, {
        title: 'Cancel Test',
        componentIds: [component.id],
        startTime,
        endTime,
        autoUpdateStatus: true,
        notifySubscribers: false,
      });

      await maintenanceService.cancel(maintenance.id);

      const cancelled = await prisma.maintenanceWindow.findUnique({
        where: { id: maintenance.id },
      });

      expect(cancelled?.status).toBe('CANCELLED');

      // Cleanup
      await prisma.maintenanceWindow.delete({ where: { id: maintenance.id } });
    });
  });

  describe('isMaintenanceActive', () => {
    it('should return true when now is within window', () => {
      const now = new Date();
      const isActive = maintenanceService.isMaintenanceActive(
        {
          startTime: new Date(now.getTime() - 3600000), // 1 hour ago
          endTime: new Date(now.getTime() + 3600000), // 1 hour from now
          recurrenceRule: null,
        },
        now
      );

      expect(isActive).toBe(true);
    });

    it('should return false when now is outside window', () => {
      const now = new Date();
      const isActive = maintenanceService.isMaintenanceActive(
        {
          startTime: new Date(now.getTime() + 3600000), // 1 hour from now
          endTime: new Date(now.getTime() + 7200000), // 2 hours from now
          recurrenceRule: null,
        },
        now
      );

      expect(isActive).toBe(false);
    });
  });
});

// ============================================================================
// STATUS SUBSCRIBER SERVICE TESTS
// ============================================================================

describe('Status Subscriber Service', () => {
  let statusPage: Awaited<ReturnType<typeof prisma.statusPage.create>>;
  let testTeam: Awaited<ReturnType<typeof prisma.team.create>>;
  let testUser: Awaited<ReturnType<typeof prisma.user.create>>;

  beforeAll(async () => {
    testUser = await prisma.user.create({
      data: {
        email: `sub-test-${Date.now()}@example.com`,
        firstName: 'Sub',
        lastName: 'Test',
        platformRole: 'USER',
      },
    });

    testTeam = await prisma.team.create({
      data: { name: `Sub Test Team ${Date.now()}` },
    });

    statusPage = await prisma.statusPage.create({
      data: {
        name: 'Sub Test Page',
        slug: `sub-test-${Date.now()}`,
        teamId: testTeam.id,
        createdById: testUser.id,
        isPublic: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.statusSubscriber.deleteMany({ where: { statusPageId: statusPage.id } });
    await prisma.statusPage.delete({ where: { id: statusPage.id } });
    await prisma.team.delete({ where: { id: testTeam.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  describe('subscribe', () => {
    it('should create subscriber for webhook without verification', async () => {
      const { subscriber, requiresVerification } = await statusSubscriberService.subscribe(
        statusPage.id,
        'WEBHOOK',
        'https://example.com/webhook'
      );

      expect(subscriber.id).toBeDefined();
      expect(subscriber.isVerified).toBe(true);
      expect(requiresVerification).toBe(false);

      // Cleanup
      await prisma.statusSubscriber.delete({ where: { id: subscriber.id } });
    });

    it('should require verification for email subscriber', async () => {
      const { subscriber, requiresVerification } = await statusSubscriberService.subscribe(
        statusPage.id,
        'EMAIL',
        `test-${Date.now()}@example.com`
      );

      expect(subscriber.isVerified).toBe(false);
      expect(subscriber.verifyToken).toBeDefined();
      expect(requiresVerification).toBe(true);

      // Cleanup
      await prisma.statusSubscriber.delete({ where: { id: subscriber.id } });
    });

    it('should reject duplicate subscription', async () => {
      const destination = `duplicate-${Date.now()}@example.com`;

      await statusSubscriberService.subscribe(statusPage.id, 'EMAIL', destination);

      await expect(
        statusSubscriberService.subscribe(statusPage.id, 'EMAIL', destination)
      ).rejects.toThrow('Already subscribed');

      // Cleanup
      await prisma.statusSubscriber.deleteMany({
        where: { statusPageId: statusPage.id, destination },
      });
    });
  });

  describe('verify', () => {
    it('should verify subscriber with valid token', async () => {
      const { subscriber } = await statusSubscriberService.subscribe(
        statusPage.id,
        'EMAIL',
        `verify-${Date.now()}@example.com`
      );

      const result = await statusSubscriberService.verify(subscriber.verifyToken!);
      expect(result).toBe(true);

      const updated = await prisma.statusSubscriber.findUnique({
        where: { id: subscriber.id },
      });
      expect(updated?.isVerified).toBe(true);
      expect(updated?.verifyToken).toBeNull();

      // Cleanup
      await prisma.statusSubscriber.delete({ where: { id: subscriber.id } });
    });

    it('should return false for invalid token', async () => {
      const result = await statusSubscriberService.verify('invalid-token');
      expect(result).toBe(false);
    });
  });

  describe('unsubscribe', () => {
    it('should deactivate subscriber', async () => {
      const { subscriber } = await statusSubscriberService.subscribe(
        statusPage.id,
        'WEBHOOK',
        `https://unsub-${Date.now()}.example.com/webhook`
      );

      await statusSubscriberService.unsubscribe(subscriber.id);

      const updated = await prisma.statusSubscriber.findUnique({
        where: { id: subscriber.id },
      });
      expect(updated?.isActive).toBe(false);

      // Cleanup
      await prisma.statusSubscriber.delete({ where: { id: subscriber.id } });
    });
  });

  describe('getActiveSubscribersForNotification', () => {
    it('should filter by notification type', async () => {
      // Create verified webhook subscriber
      const webhook = await prisma.statusSubscriber.create({
        data: {
          statusPageId: statusPage.id,
          channel: 'WEBHOOK',
          destination: `https://filter-${Date.now()}.example.com/webhook`,
          notifyOn: ['outage'],
          isVerified: true,
          isActive: true,
        },
      });

      // Create component for testing
      const testComponent = await prisma.statusPageComponent.create({
        data: {
          statusPageId: statusPage.id,
          name: 'Filter Test Component',
        },
      });

      // Should not get subscriber for degraded (not in notifyOn)
      const degradedSubs = await statusSubscriberService.getActiveSubscribersForNotification(
        statusPage.id,
        testComponent.id,
        'degraded'
      );
      expect(degradedSubs).toHaveLength(0);

      // Should get subscriber for outage (in notifyOn)
      const outageSubs = await statusSubscriberService.getActiveSubscribersForNotification(
        statusPage.id,
        testComponent.id,
        'outage'
      );
      expect(outageSubs).toHaveLength(1);

      // Cleanup
      await prisma.statusSubscriber.delete({ where: { id: webhook.id } });
      await prisma.statusPageComponent.delete({ where: { id: testComponent.id } });
    });

    it('should filter by component ID', async () => {
      // Create two components
      const component1 = await prisma.statusPageComponent.create({
        data: {
          statusPageId: statusPage.id,
          name: 'Component 1',
        },
      });

      const component2 = await prisma.statusPageComponent.create({
        data: {
          statusPageId: statusPage.id,
          name: 'Component 2',
        },
      });

      // Create subscriber only for component1
      const subscriber = await prisma.statusSubscriber.create({
        data: {
          statusPageId: statusPage.id,
          channel: 'WEBHOOK',
          destination: `https://comp-filter-${Date.now()}.example.com/webhook`,
          notifyOn: ['outage'],
          componentIds: [component1.id],
          isVerified: true,
          isActive: true,
        },
      });

      // Should get subscriber for component1
      const comp1Subs = await statusSubscriberService.getActiveSubscribersForNotification(
        statusPage.id,
        component1.id,
        'outage'
      );
      expect(comp1Subs).toHaveLength(1);

      // Should not get subscriber for component2
      const comp2Subs = await statusSubscriberService.getActiveSubscribersForNotification(
        statusPage.id,
        component2.id,
        'outage'
      );
      expect(comp2Subs).toHaveLength(0);

      // Cleanup
      await prisma.statusSubscriber.delete({ where: { id: subscriber.id } });
      await prisma.statusPageComponent.delete({ where: { id: component1.id } });
      await prisma.statusPageComponent.delete({ where: { id: component2.id } });
    });
  });
});
