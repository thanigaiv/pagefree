import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../config/database.js';
import { deduplicationService } from '../services/deduplication.service.js';
import { alertService } from '../services/alert.service.js';
import { escalationPolicyService } from '../services/escalation-policy.service.js';

describe('Deduplication Service', () => {
  let testTeam: any;
  let testUser: any;
  let testPolicy: any;
  let testIntegration: any;

  beforeAll(async () => {
    testTeam = await prisma.team.create({
      data: { name: `test-dedup-team-${Date.now()}` }
    });

    // Add technical tag for routing
    await prisma.teamTag.create({
      data: {
        teamId: testTeam.id,
        tagType: 'TECHNICAL',
        tagValue: 'test-service'
      }
    });

    testUser = await prisma.user.create({
      data: {
        email: `dedup-test-${Date.now()}@example.com`,
        firstName: 'Test',
        lastName: 'User'
      }
    });

    await prisma.teamMember.create({
      data: { userId: testUser.id, teamId: testTeam.id, role: 'RESPONDER' }
    });

    testPolicy = await escalationPolicyService.create({
      teamId: testTeam.id,
      name: 'Dedup Test Policy',
      isDefault: true,
      levels: [{ levelNumber: 1, targetType: 'user', targetId: testUser.id }]
    }, testUser.id);

    testIntegration = await prisma.integration.create({
      data: {
        name: `test-integration-${Date.now()}`,
        type: 'generic',
        webhookSecret: 'test-secret-123',
        deduplicationWindowMinutes: 15
      }
    });
  });

  afterAll(async () => {
    await prisma.escalationJob.deleteMany({
      where: { incident: { teamId: testTeam.id } }
    });
    await prisma.alert.deleteMany({ where: { integrationId: testIntegration.id } });
    await prisma.incident.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.integration.delete({ where: { id: testIntegration.id } });
    await prisma.escalationPolicy.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.teamTag.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.teamMember.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
    await prisma.team.delete({ where: { id: testTeam.id } });
  });

  describe('deduplicateAndCreateIncident', () => {
    it('should create new incident for new fingerprint', async () => {
      const alert = await prisma.alert.create({
        data: {
          title: 'New Alert',
          severity: 'HIGH',
          source: testIntegration.name,
          integrationId: testIntegration.id,
          triggeredAt: new Date(),
          metadata: { service: 'test-service' }
        }
      });

      const fingerprint = `unique-${Date.now()}`;
      const result = await deduplicationService.deduplicateAndCreateIncident(
        alert.id,
        fingerprint,
        alert,
        15
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.incident).toBeDefined();
      expect(result.incident.fingerprint).toBe(fingerprint);
      expect(result.incident.status).toBe('OPEN');
    });

    it('should group alert to existing incident with same fingerprint', async () => {
      const fingerprint = `dedup-test-${Date.now()}`;

      // Create first alert and incident
      const alert1 = await prisma.alert.create({
        data: {
          title: 'First Alert',
          severity: 'HIGH',
          source: testIntegration.name,
          integrationId: testIntegration.id,
          triggeredAt: new Date(),
          metadata: { service: 'test-service' }
        }
      });

      const result1 = await deduplicationService.deduplicateAndCreateIncident(
        alert1.id,
        fingerprint,
        alert1,
        15
      );

      expect(result1.isDuplicate).toBe(false);

      // Create second alert with same fingerprint
      const alert2 = await prisma.alert.create({
        data: {
          title: 'Second Alert',
          severity: 'HIGH',
          source: testIntegration.name,
          integrationId: testIntegration.id,
          triggeredAt: new Date(),
          metadata: { service: 'test-service' }
        }
      });

      const result2 = await deduplicationService.deduplicateAndCreateIncident(
        alert2.id,
        fingerprint,
        alert2,
        15
      );

      expect(result2.isDuplicate).toBe(true);
      expect(result2.incident.id).toBe(result1.incident.id);
      expect(result2.incident.alertCount).toBe(2);
    });

    it('should create new incident outside deduplication window', async () => {
      const fingerprint = `window-test-${Date.now()}`;

      // Create incident with old timestamp
      const oldIncident = await prisma.incident.create({
        data: {
          fingerprint,
          status: 'OPEN',
          priority: 'HIGH',
          teamId: testTeam.id,
          escalationPolicyId: testPolicy.id,
          createdAt: new Date(Date.now() - 20 * 60 * 1000) // 20 minutes ago
        }
      });

      const alert = await prisma.alert.create({
        data: {
          title: 'New Window Alert',
          severity: 'HIGH',
          source: testIntegration.name,
          integrationId: testIntegration.id,
          triggeredAt: new Date(),
          metadata: { service: 'test-service' }
        }
      });

      // Dedup window is 15 minutes, so old incident should not match
      const result = await deduplicationService.deduplicateAndCreateIncident(
        alert.id,
        fingerprint,
        alert,
        15
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.incident.id).not.toBe(oldIncident.id);
    });
  });
});

describe('Alert Service', () => {
  let testTeam: any;
  let testIntegration: any;
  let testAlerts: any[] = [];

  beforeAll(async () => {
    testTeam = await prisma.team.create({
      data: { name: `test-alert-search-${Date.now()}` }
    });

    testIntegration = await prisma.integration.create({
      data: {
        name: `alert-search-int-${Date.now()}`,
        type: 'generic',
        webhookSecret: 'test-secret'
      }
    });

    // Create test alerts with varying severity
    for (const severity of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
      const alert = await prisma.alert.create({
        data: {
          title: `${severity} Alert`,
          severity: severity as any,
          source: testIntegration.name,
          integrationId: testIntegration.id,
          triggeredAt: new Date()
        }
      });
      testAlerts.push(alert);
    }
  });

  afterAll(async () => {
    await prisma.alert.deleteMany({ where: { integrationId: testIntegration.id } });
    await prisma.integration.delete({ where: { id: testIntegration.id } });
    await prisma.team.delete({ where: { id: testTeam.id } });
  });

  describe('search', () => {
    it('should filter by severity', async () => {
      const result = await alertService.search({
        integrationId: testIntegration.id,
        severity: 'CRITICAL'
      });

      expect(result.alerts.every(a => a.severity === 'CRITICAL')).toBe(true);
    });

    it('should filter by multiple severities', async () => {
      const result = await alertService.search({
        integrationId: testIntegration.id,
        severity: ['CRITICAL', 'HIGH']
      });

      expect(result.alerts.every(a => ['CRITICAL', 'HIGH'].includes(a.severity))).toBe(true);
    });

    it('should search by title text', async () => {
      const result = await alertService.search({
        integrationId: testIntegration.id,
        searchTerm: 'CRITICAL'
      });

      expect(result.alerts.some(a => a.title.includes('CRITICAL'))).toBe(true);
    });

    it('should support cursor pagination', async () => {
      const first = await alertService.search(
        { integrationId: testIntegration.id },
        { limit: 2 }
      );

      expect(first.alerts.length).toBe(2);

      if (first.nextCursor) {
        const second = await alertService.search(
          { integrationId: testIntegration.id },
          { limit: 2, cursor: first.nextCursor }
        );

        expect(second.alerts[0].id).not.toBe(first.alerts[0].id);
      }
    });
  });
});
