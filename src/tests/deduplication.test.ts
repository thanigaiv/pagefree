import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../config/database.js';
import { deduplicationService } from '../services/deduplication.service.js';
import { routingService } from '../services/routing.service.js';
import { createTestUser, createTestTeam, cleanupTestData } from './setup.js';

describe('Alert Deduplication', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it('should create new incident for first alert with fingerprint', async () => {
    // Setup: Create team and integration
    const team = await createTestTeam();
    const user = await createTestUser();
    await prisma.teamMember.create({
      data: {
        userId: user.id,
        teamId: team.id,
        role: 'RESPONDER'
      }
    });

    // Create team tag for routing
    await prisma.teamTag.create({
      data: {
        teamId: team.id,
        tagType: 'TECHNICAL',
        tagValue: 'payments-api'
      }
    });

    // Create escalation policy
    await prisma.escalationPolicy.create({
      data: {
        teamId: team.id,
        name: 'Default Policy',
        isDefault: true,
        levels: {
          create: {
            levelNumber: 1,
            targetType: 'user',
            targetId: user.id,
            timeoutMinutes: 30
          }
        }
      }
    });

    const integration = await prisma.integration.create({
      data: {
        name: 'test-integration',
        type: 'datadog',
        webhookSecret: 'test-secret'
      }
    });

    // Create alert
    const alert = await prisma.alert.create({
      data: {
        title: 'Test Alert',
        severity: 'CRITICAL',
        source: integration.name,
        triggeredAt: new Date(),
        integrationId: integration.id,
        metadata: { service: 'payments-api' }
      }
    });

    // Test deduplication
    const result = await deduplicationService.deduplicateAndCreateIncident(
      alert.id,
      'abc123',
      alert,
      15
    );

    expect(result.isDuplicate).toBe(false);
    expect(result.incident).toBeDefined();
    expect(result.incident.fingerprint).toBe('abc123');
    expect(result.incident.teamId).toBe(team.id);
    expect(result.incident.assignedUserId).toBe(user.id);
    expect(result.incident.alertCount).toBe(1);
    expect(result.incident.status).toBe('OPEN');

    // Verify alert is linked
    const updatedAlert = await prisma.alert.findUnique({
      where: { id: alert.id }
    });
    expect(updatedAlert?.incidentId).toBe(result.incident.id);
  });

  it('should group duplicate alert to existing incident', async () => {
    // Setup
    const team = await createTestTeam();
    const user = await createTestUser();
    await prisma.teamMember.create({
      data: {
        userId: user.id,
        teamId: team.id,
        role: 'RESPONDER'
      }
    });

    await prisma.teamTag.create({
      data: {
        teamId: team.id,
        tagType: 'TECHNICAL',
        tagValue: 'payments-api'
      }
    });

    await prisma.escalationPolicy.create({
      data: {
        teamId: team.id,
        name: 'Default Policy',
        isDefault: true,
        levels: {
          create: {
            levelNumber: 1,
            targetType: 'user',
            targetId: user.id,
            timeoutMinutes: 30
          }
        }
      }
    });

    const integration = await prisma.integration.create({
      data: {
        name: 'test-integration',
        type: 'datadog',
        webhookSecret: 'test-secret'
      }
    });

    // Create first alert and incident
    const alert1 = await prisma.alert.create({
      data: {
        title: 'Test Alert 1',
        severity: 'CRITICAL',
        source: integration.name,
        triggeredAt: new Date(),
        integrationId: integration.id,
        metadata: { service: 'payments-api' }
      }
    });

    const result1 = await deduplicationService.deduplicateAndCreateIncident(
      alert1.id,
      'abc123',
      alert1,
      15
    );

    // Create second alert with same fingerprint
    const alert2 = await prisma.alert.create({
      data: {
        title: 'Test Alert 2',
        severity: 'CRITICAL',
        source: integration.name,
        triggeredAt: new Date(),
        integrationId: integration.id,
        metadata: { service: 'payments-api' }
      }
    });

    const result2 = await deduplicationService.deduplicateAndCreateIncident(
      alert2.id,
      'abc123',
      alert2,
      15
    );

    // Verify grouping
    expect(result2.isDuplicate).toBe(true);
    expect(result2.incident.id).toBe(result1.incident.id);
    expect(result2.incident.alertCount).toBe(2);

    // Verify both alerts linked to same incident
    const updatedAlert1 = await prisma.alert.findUnique({
      where: { id: alert1.id }
    });
    const updatedAlert2 = await prisma.alert.findUnique({
      where: { id: alert2.id }
    });
    expect(updatedAlert1?.incidentId).toBe(result1.incident.id);
    expect(updatedAlert2?.incidentId).toBe(result1.incident.id);
  });

  it('should prevent race condition with concurrent deduplication', async () => {
    // Setup
    const team = await createTestTeam();
    const user = await createTestUser();
    await prisma.teamMember.create({
      data: {
        userId: user.id,
        teamId: team.id,
        role: 'RESPONDER'
      }
    });

    await prisma.teamTag.create({
      data: {
        teamId: team.id,
        tagType: 'TECHNICAL',
        tagValue: 'payments-api'
      }
    });

    await prisma.escalationPolicy.create({
      data: {
        teamId: team.id,
        name: 'Default Policy',
        isDefault: true,
        levels: {
          create: {
            levelNumber: 1,
            targetType: 'user',
            targetId: user.id,
            timeoutMinutes: 30
          }
        }
      }
    });

    const integration = await prisma.integration.create({
      data: {
        name: 'test-integration',
        type: 'datadog',
        webhookSecret: 'test-secret'
      }
    });

    // Create two alerts
    const alert1 = await prisma.alert.create({
      data: {
        title: 'Test Alert 1',
        severity: 'CRITICAL',
        source: integration.name,
        triggeredAt: new Date(),
        integrationId: integration.id,
        metadata: { service: 'payments-api' }
      }
    });

    const alert2 = await prisma.alert.create({
      data: {
        title: 'Test Alert 2',
        severity: 'CRITICAL',
        source: integration.name,
        triggeredAt: new Date(),
        integrationId: integration.id,
        metadata: { service: 'payments-api' }
      }
    });

    // Execute concurrently with same fingerprint
    const [result1, result2] = await Promise.all([
      deduplicationService.deduplicateAndCreateIncident(
        alert1.id,
        'concurrent-test',
        alert1,
        15
      ),
      deduplicationService.deduplicateAndCreateIncident(
        alert2.id,
        'concurrent-test',
        alert2,
        15
      )
    ]);

    // Verify exactly one incident created
    const incidents = await prisma.incident.findMany({
      where: { fingerprint: 'concurrent-test' }
    });
    expect(incidents.length).toBe(1);

    // Both results should reference same incident
    expect(result1.incident.id).toBe(result2.incident.id);

    // One should be marked as duplicate
    const duplicateCount = [result1.isDuplicate, result2.isDuplicate].filter(Boolean).length;
    expect(duplicateCount).toBe(1);
  });

  it('should route alert to team by service tag', async () => {
    // Setup
    const team = await createTestTeam({ name: 'Payments Team' });
    const user = await createTestUser();
    await prisma.teamMember.create({
      data: {
        userId: user.id,
        teamId: team.id,
        role: 'RESPONDER'
      }
    });

    await prisma.teamTag.create({
      data: {
        teamId: team.id,
        tagType: 'TECHNICAL',
        tagValue: 'payments-api'
      }
    });

    const policy = await prisma.escalationPolicy.create({
      data: {
        teamId: team.id,
        name: 'Default Policy',
        isDefault: true,
        levels: {
          create: {
            levelNumber: 1,
            targetType: 'user',
            targetId: user.id,
            timeoutMinutes: 30
          }
        }
      }
    });

    const integration = await prisma.integration.create({
      data: {
        name: 'test-integration',
        type: 'datadog',
        webhookSecret: 'test-secret'
      }
    });

    const alert = await prisma.alert.create({
      data: {
        title: 'Payment Processing Error',
        severity: 'HIGH',
        source: integration.name,
        triggeredAt: new Date(),
        integrationId: integration.id,
        metadata: { service: 'payments-api' }
      }
    });

    // Test routing
    const routing = await routingService.routeAlertToTeam(alert);

    expect(routing.teamId).toBe(team.id);
    expect(routing.escalationPolicyId).toBe(policy.id);
    expect(routing.assignedUserId).toBe(user.id);
  });

  it('should handle no on-call user scenario', async () => {
    // Setup team without members
    const team = await createTestTeam({ name: 'Empty Team' });

    await prisma.teamTag.create({
      data: {
        teamId: team.id,
        tagType: 'TECHNICAL',
        tagValue: 'test-service'
      }
    });

    const policy = await prisma.escalationPolicy.create({
      data: {
        teamId: team.id,
        name: 'Default Policy',
        isDefault: true,
        levels: {
          create: {
            levelNumber: 1,
            targetType: 'entire_team',
            targetId: null,
            timeoutMinutes: 30
          }
        }
      }
    });

    const integration = await prisma.integration.create({
      data: {
        name: 'test-integration',
        type: 'datadog',
        webhookSecret: 'test-secret'
      }
    });

    const alert = await prisma.alert.create({
      data: {
        title: 'Test Alert',
        severity: 'HIGH',
        source: integration.name,
        triggeredAt: new Date(),
        integrationId: integration.id,
        metadata: { service: 'test-service' }
      }
    });

    // Test routing with no available users
    const routing = await routingService.routeAlertToTeam(alert);

    expect(routing.teamId).toBe(team.id);
    expect(routing.escalationPolicyId).toBe(policy.id);
    expect(routing.assignedUserId).toBeNull();
  });
});
