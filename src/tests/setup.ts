import { prisma } from '../config/database.js';
import { beforeAll, afterAll } from 'vitest';

// Test database cleanup
beforeAll(async () => {
  // Ensure we're using test database
  if (!process.env.DATABASE_URL?.includes('test')) {
    console.warn('WARNING: Not using test database!');
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Helper to create test user
export async function createTestUser(overrides: any = {}) {
  return prisma.user.create({
    data: {
      email: `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
      firstName: 'Test',
      lastName: 'User',
      platformRole: 'USER',
      isActive: true,
      ...overrides
    },
    include: {
      teamMembers: {
        include: { team: true }
      }
    }
  });
}

// Helper to create test team
export async function createTestTeam(overrides: any = {}) {
  return prisma.team.create({
    data: {
      name: `Test Team ${Date.now()}-${Math.random().toString(36).substring(7)}`,
      isActive: true,
      ...overrides
    }
  });
}

// Helper to cleanup test data
export async function cleanupTestData() {
  // Delete in correct order for foreign keys
  await prisma.auditEvent.deleteMany({});
  await prisma.apiKey.deleteMany({});

  // Phase 4: Incident and escalation cleanup
  await prisma.escalationJob.deleteMany({});
  await prisma.alert.deleteMany({});
  await prisma.webhookDelivery.deleteMany({});
  await prisma.incident.deleteMany({});
  await prisma.escalationLevel.deleteMany({});
  await prisma.escalationPolicy.deleteMany({});
  await prisma.integration.deleteMany({});

  // Phase 3: Schedule cleanup
  await prisma.scheduleOverride.deleteMany({});
  await prisma.scheduleLayer.deleteMany({});
  await prisma.schedule.deleteMany({});

  // Phase 1: User and team cleanup
  await prisma.teamMember.deleteMany({});
  await prisma.teamTag.deleteMany({});
  await prisma.contactVerification.deleteMany({});
  await prisma.notificationPreference.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.userDevice.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({});
}
