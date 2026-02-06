import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../config/database.js';
import { createTestUser, createTestTeam, cleanupTestData } from './setup.js';

const SCIM_TOKEN = process.env.SCIM_BEARER_TOKEN || 'test-scim-token';

describe('SCIM API', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Authentication', () => {
    it('returns 401 without auth header', async () => {
      const res = await request(app).get('/scim/v2/Users');
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app)
        .get('/scim/v2/Users')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /scim/v2/Users', () => {
    it('returns empty list when no users', async () => {
      const res = await request(app)
        .get('/scim/v2/Users')
        .set('Authorization', `Bearer ${SCIM_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:ListResponse');
      expect(res.body.Resources).toHaveLength(0);
    });

    it('does not return break-glass accounts', async () => {
      await createTestUser({
        isBreakGlassAccount: true,
        syncedFromOkta: false
      });
      await createTestUser({
        isBreakGlassAccount: false,
        syncedFromOkta: true
      });

      const res = await request(app)
        .get('/scim/v2/Users')
        .set('Authorization', `Bearer ${SCIM_TOKEN}`);

      expect(res.body.totalResults).toBe(1);
      expect(res.body.Resources.every(u => !u.externalId?.includes('breakglass'))).toBe(true);
    });
  });

  describe('POST /scim/v2/Users', () => {
    it('creates user from SCIM payload', async () => {
      const res = await request(app)
        .post('/scim/v2/Users')
        .set('Authorization', `Bearer ${SCIM_TOKEN}`)
        .send({
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName: 'newuser@example.com',
          name: { givenName: 'New', familyName: 'User' },
          emails: [{ value: 'newuser@example.com', primary: true }],
          externalId: 'okta-123',
          active: true
        });

      expect(res.status).toBe(201);
      expect(res.body.userName).toBe('newuser@example.com');

      const user = await prisma.user.findUnique({
        where: { email: 'newuser@example.com' }
      });
      expect(user?.syncedFromOkta).toBe(true);
      expect(user?.oktaId).toBe('okta-123');
    });
  });

  describe('PATCH /scim/v2/Users/:id', () => {
    it('soft deletes user when active set to false', async () => {
      const user = await createTestUser({
        syncedFromOkta: true,
        isBreakGlassAccount: false,
        oktaId: 'test-okta-id'
      });

      const res = await request(app)
        .patch(`/scim/v2/Users/${user.id}`)
        .set('Authorization', `Bearer ${SCIM_TOKEN}`)
        .send({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [{ op: 'replace', path: 'active', value: false }]
        });

      expect(res.status).toBe(200);

      const updated = await prisma.user.findUnique({
        where: { id: user.id }
      });
      expect(updated?.isActive).toBe(false);
      expect(updated?.deactivatedAt).toBeTruthy();
    });
  });

  describe('SCIM Groups', () => {
    it('creates team from SCIM group', async () => {
      const res = await request(app)
        .post('/scim/v2/Groups')
        .set('Authorization', `Bearer ${SCIM_TOKEN}`)
        .send({
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
          displayName: 'Engineering Team',
          externalId: 'okta-group-123'
        });

      expect(res.status).toBe(201);
      expect(res.body.displayName).toBe('Engineering Team');

      const team = await prisma.team.findFirst({
        where: { name: 'Engineering Team' }
      });
      expect(team?.syncedFromOkta).toBe(true);
    });
  });
});
