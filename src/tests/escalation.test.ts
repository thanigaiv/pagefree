import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { prisma } from '../config/database.js';
import { escalationPolicyService } from '../services/escalation-policy.service.js';
import { escalationService } from '../services/escalation.service.js';

describe('Escalation Policy Service', () => {
  let testTeam: any;
  let testUser: any;

  beforeAll(async () => {
    testTeam = await prisma.team.create({
      data: { name: `test-escalation-team-${Date.now()}` }
    });

    testUser = await prisma.user.create({
      data: {
        email: `escalation-test-${Date.now()}@example.com`,
        firstName: 'Test',
        lastName: 'User'
      }
    });

    await prisma.teamMember.create({
      data: { userId: testUser.id, teamId: testTeam.id, role: 'TEAM_ADMIN' }
    });
  });

  afterAll(async () => {
    await prisma.escalationPolicy.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.teamMember.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
    await prisma.team.delete({ where: { id: testTeam.id } });
  });

  describe('create', () => {
    it('should create policy with levels', async () => {
      const policy = await escalationPolicyService.create({
        teamId: testTeam.id,
        name: 'Test Policy',
        levels: [
          { levelNumber: 1, targetType: 'user', targetId: testUser.id, timeoutMinutes: 5 },
          { levelNumber: 2, targetType: 'entire_team', timeoutMinutes: 10 }
        ]
      }, testUser.id);

      expect(policy.name).toBe('Test Policy');
      expect(policy.levels.length).toBe(2);
      expect(policy.levels[0].levelNumber).toBe(1);
      expect(policy.levels[1].levelNumber).toBe(2);
    });

    it('should enforce minimum timeout for single target', async () => {
      await expect(
        escalationPolicyService.create({
          teamId: testTeam.id,
          name: 'Invalid Timeout',
          levels: [
            { levelNumber: 1, targetType: 'user', targetId: testUser.id, timeoutMinutes: 0 }
          ]
        }, testUser.id)
      ).rejects.toThrow('minimum timeout');
    });

    it('should require sequential level numbers', async () => {
      await expect(
        escalationPolicyService.create({
          teamId: testTeam.id,
          name: 'Skip Level',
          levels: [
            { levelNumber: 1, targetType: 'user', targetId: testUser.id },
            { levelNumber: 3, targetType: 'entire_team' } // Skips 2
          ]
        }, testUser.id)
      ).rejects.toThrow('sequential');
    });

    it('should set as default when specified', async () => {
      const policy = await escalationPolicyService.create({
        teamId: testTeam.id,
        name: 'Default Policy',
        isDefault: true,
        levels: [{ levelNumber: 1, targetType: 'entire_team' }]
      }, testUser.id);

      expect(policy.isDefault).toBe(true);

      const fetched = await escalationPolicyService.getDefaultForTeam(testTeam.id);
      expect(fetched?.id).toBe(policy.id);
    });
  });

  describe('update', () => {
    it('should update policy properties', async () => {
      const policy = await escalationPolicyService.create({
        teamId: testTeam.id,
        name: 'Update Test',
        levels: [{ levelNumber: 1, targetType: 'entire_team' }]
      }, testUser.id);

      const updated = await escalationPolicyService.update(
        policy.id,
        { name: 'Updated Name', repeatCount: 3 },
        testUser.id
      );

      expect(updated.name).toBe('Updated Name');
      expect(updated.repeatCount).toBe(3);
    });
  });

  describe('delete', () => {
    it('should delete policy without incidents', async () => {
      const policy = await escalationPolicyService.create({
        teamId: testTeam.id,
        name: 'Delete Test',
        levels: [{ levelNumber: 1, targetType: 'entire_team' }]
      }, testUser.id);

      await escalationPolicyService.delete(policy.id, testUser.id);

      const fetched = await escalationPolicyService.getById(policy.id);
      expect(fetched).toBeNull();
    });
  });
});

describe('Escalation Service', () => {
  let testTeam: any;
  let testUser: any;
  let testPolicy: any;

  beforeAll(async () => {
    testTeam = await prisma.team.create({
      data: { name: `test-esc-service-${Date.now()}` }
    });

    testUser = await prisma.user.create({
      data: {
        email: `esc-service-${Date.now()}@example.com`,
        firstName: 'Test',
        lastName: 'User'
      }
    });

    await prisma.teamMember.create({
      data: { userId: testUser.id, teamId: testTeam.id, role: 'RESPONDER' }
    });

    testPolicy = await escalationPolicyService.create({
      teamId: testTeam.id,
      name: 'Escalation Test Policy',
      isDefault: true,
      repeatCount: 2,
      levels: [
        { levelNumber: 1, targetType: 'user', targetId: testUser.id, timeoutMinutes: 1 },
        { levelNumber: 2, targetType: 'entire_team', timeoutMinutes: 3 }
      ]
    }, testUser.id);
  });

  afterAll(async () => {
    await prisma.escalationJob.deleteMany({
      where: { incident: { teamId: testTeam.id } }
    });
    await prisma.incident.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.escalationPolicy.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.teamMember.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
    await prisma.team.delete({ where: { id: testTeam.id } });
  });

  describe('processEscalation', () => {
    it('should skip if incident already acknowledged', async () => {
      const incident = await prisma.incident.create({
        data: {
          fingerprint: `esc-ack-test-${Date.now()}`,
          status: 'ACKNOWLEDGED',
          priority: 'HIGH',
          teamId: testTeam.id,
          escalationPolicyId: testPolicy.id,
          currentLevel: 1
        }
      });

      // Should not throw or escalate
      await escalationService.processEscalation(incident.id, 2, 1);

      const updated = await prisma.incident.findUnique({ where: { id: incident.id } });
      expect(updated?.currentLevel).toBe(1); // Unchanged
    });

    it('should skip if incident resolved', async () => {
      const incident = await prisma.incident.create({
        data: {
          fingerprint: `esc-resolved-test-${Date.now()}`,
          status: 'RESOLVED',
          priority: 'HIGH',
          teamId: testTeam.id,
          escalationPolicyId: testPolicy.id,
          currentLevel: 1
        }
      });

      // Should not throw or escalate
      await escalationService.processEscalation(incident.id, 2, 1);

      const updated = await prisma.incident.findUnique({ where: { id: incident.id } });
      expect(updated?.currentLevel).toBe(1); // Unchanged
      expect(updated?.status).toBe('RESOLVED'); // Still resolved
    });

    // Note: Full escalation flow test requires Redis/BullMQ for job queueing
    // This is tested via incident.test.ts lifecycle where acknowledgment stops escalation
  });
});
