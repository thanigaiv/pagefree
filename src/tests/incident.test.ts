import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../config/database.js';
import { incidentService } from '../services/incident.service.js';
import { escalationPolicyService } from '../services/escalation-policy.service.js';

describe('Incident Service', () => {
  let testTeam: any;
  let testUser: any;
  let testPolicy: any;
  let testIncident: any;

  beforeAll(async () => {
    // Create test team
    testTeam = await prisma.team.create({
      data: { name: `test-incident-team-${Date.now()}` }
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: `incident-test-${Date.now()}@example.com`,
        firstName: 'Test',
        lastName: 'User'
      }
    });

    // Add user to team
    await prisma.teamMember.create({
      data: {
        userId: testUser.id,
        teamId: testTeam.id,
        role: 'RESPONDER'
      }
    });

    // Create escalation policy
    testPolicy = await escalationPolicyService.create({
      teamId: testTeam.id,
      name: 'Test Policy',
      isDefault: true,
      levels: [
        { levelNumber: 1, targetType: 'user', targetId: testUser.id, timeoutMinutes: 5 }
      ]
    }, testUser.id);
  });

  afterAll(async () => {
    // Cleanup
    await prisma.incident.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.escalationPolicy.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.teamMember.deleteMany({ where: { teamId: testTeam.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
    await prisma.team.delete({ where: { id: testTeam.id } });
  });

  beforeEach(async () => {
    // Create fresh incident for each test
    testIncident = await prisma.incident.create({
      data: {
        fingerprint: `test-fingerprint-${Date.now()}`,
        status: 'OPEN',
        priority: 'HIGH',
        teamId: testTeam.id,
        escalationPolicyId: testPolicy.id,
        assignedUserId: testUser.id
      }
    });
  });

  describe('acknowledge', () => {
    it('should update status to ACKNOWLEDGED', async () => {
      const result = await incidentService.acknowledge(
        testIncident.id,
        testUser.id
      );

      expect(result.status).toBe('ACKNOWLEDGED');
      expect(result.acknowledgedAt).toBeDefined();
    });

    it('should assign to acknowledging user', async () => {
      // Create another user
      const otherUser = await prisma.user.create({
        data: {
          email: `other-${Date.now()}@example.com`,
          firstName: 'Other',
          lastName: 'User'
        }
      });

      await prisma.teamMember.create({
        data: { userId: otherUser.id, teamId: testTeam.id, role: 'RESPONDER' }
      });

      const result = await incidentService.acknowledge(
        testIncident.id,
        otherUser.id
      );

      expect(result.assignedUserId).toBe(otherUser.id);

      // Cleanup
      await prisma.teamMember.deleteMany({ where: { userId: otherUser.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });

    it('should reject if already acknowledged', async () => {
      await incidentService.acknowledge(testIncident.id, testUser.id);

      await expect(
        incidentService.acknowledge(testIncident.id, testUser.id)
      ).rejects.toThrow('Cannot acknowledge');
    });
  });

  describe('resolve', () => {
    it('should update status to RESOLVED', async () => {
      const result = await incidentService.resolve(
        testIncident.id,
        testUser.id,
        { resolutionNote: 'Fixed by restarting service' }
      );

      expect(result.status).toBe('RESOLVED');
      expect(result.resolvedAt).toBeDefined();
    });

    it('should work on acknowledged incidents', async () => {
      await incidentService.acknowledge(testIncident.id, testUser.id);

      const result = await incidentService.resolve(
        testIncident.id,
        testUser.id,
        {}
      );

      expect(result.status).toBe('RESOLVED');
    });
  });

  describe('reassign', () => {
    it('should update assignedUserId', async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: `reassign-${Date.now()}@example.com`,
          firstName: 'Reassign',
          lastName: 'Target'
        }
      });

      await prisma.teamMember.create({
        data: { userId: otherUser.id, teamId: testTeam.id, role: 'RESPONDER' }
      });

      const result = await incidentService.reassign(
        testIncident.id,
        otherUser.id,
        testUser.id,
        'Handing off to specialist'
      );

      expect(result.assignedUserId).toBe(otherUser.id);

      // Cleanup
      await prisma.teamMember.deleteMany({ where: { userId: otherUser.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });

    it('should reject non-team member as assignee', async () => {
      const nonMember = await prisma.user.create({
        data: {
          email: `nonmember-${Date.now()}@example.com`,
          firstName: 'Non',
          lastName: 'Member'
        }
      });

      await expect(
        incidentService.reassign(testIncident.id, nonMember.id, testUser.id)
      ).rejects.toThrow('must be an active team responder');

      await prisma.user.delete({ where: { id: nonMember.id } });
    });
  });

  describe('list', () => {
    it('should filter by team', async () => {
      const result = await incidentService.list({ teamId: testTeam.id });

      expect(result.incidents.length).toBeGreaterThan(0);
      expect(result.incidents.every((i: any) => i.teamId === testTeam.id)).toBe(true);
    });

    it('should filter by status', async () => {
      const result = await incidentService.list({
        teamId: testTeam.id,
        status: 'OPEN'
      });

      expect(result.incidents.every((i: any) => i.status === 'OPEN')).toBe(true);
    });

    it('should support pagination', async () => {
      const first = await incidentService.list({ teamId: testTeam.id }, { limit: 1 });
      expect(first.incidents.length).toBe(1);

      if (first.nextCursor) {
        const second = await incidentService.list(
          { teamId: testTeam.id },
          { limit: 1, cursor: first.nextCursor }
        );
        expect(second.incidents[0].id).not.toBe(first.incidents[0].id);
      }
    });
  });
});
