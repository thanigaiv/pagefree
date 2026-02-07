import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../config/database.js';
import bcrypt from 'bcrypt';

describe('Integration Management API', () => {
  let adminSessionCookie: string;
  let regularUserCookie: string;
  let testIntegrationId: string;

  beforeAll(async () => {
    // Create platform admin user
    await prisma.user.upsert({
      where: { email: 'admin@test.com' },
      update: {},
      create: {
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        platformRole: 'PLATFORM_ADMIN',
        isBreakGlassAccount: true,
        passwordHash: await bcrypt.hash('testpass123', 10)
      }
    });

    // Create regular user
    await prisma.user.upsert({
      where: { email: 'user@test.com' },
      update: {},
      create: {
        email: 'user@test.com',
        firstName: 'Regular',
        lastName: 'User',
        platformRole: 'USER',
        isBreakGlassAccount: true,
        passwordHash: await bcrypt.hash('testpass123', 10)
      }
    });

    // Get session cookies via break-glass login
    const adminLogin = await request(app)
      .post('/auth/emergency')
      .send({ email: 'admin@test.com', password: 'testpass123' });
    adminSessionCookie = adminLogin.headers['set-cookie']?.[0] || '';

    const userLogin = await request(app)
      .post('/auth/emergency')
      .send({ email: 'user@test.com', password: 'testpass123' });
    regularUserCookie = userLogin.headers['set-cookie']?.[0] || '';
  });

  afterAll(async () => {
    // Cleanup
    await prisma.webhookDelivery.deleteMany({});
    await prisma.alert.deleteMany({});
    await prisma.integration.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: { in: ['admin@test.com', 'user@test.com'] } }
    });
  });

  describe('POST /api/integrations', () => {
    it('should create integration with generated secret', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Cookie', adminSessionCookie)
        .send({
          name: 'test-datadog',
          type: 'datadog'
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('test-datadog');
      expect(res.body.type).toBe('datadog');
      expect(res.body.webhookSecret).toBeDefined();
      expect(res.body.webhookSecret.length).toBe(64); // 32 bytes hex
      expect(res.body.webhook_url).toBe('/webhooks/alerts/test-datadog');

      testIntegrationId = res.body.id;
    });

    it('should reject duplicate integration names', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Cookie', adminSessionCookie)
        .send({
          name: 'test-datadog',
          type: 'generic'
        });

      expect(res.status).toBe(409);
      expect(res.body.type).toContain('duplicate');
    });

    it('should require platform admin', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Cookie', regularUserCookie)
        .send({
          name: 'another-integration',
          type: 'generic'
        });

      expect(res.status).toBe(403);
    });

    it('should validate integration name format', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Cookie', adminSessionCookie)
        .send({
          name: 'Invalid Name!',
          type: 'generic'
        });

      expect(res.status).toBe(400);
      expect(res.body.validation_errors).toBeDefined();
    });
  });

  describe('GET /api/integrations', () => {
    it('should list integrations with secrets redacted', async () => {
      const res = await request(app)
        .get('/api/integrations')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.integrations).toBeInstanceOf(Array);
      expect(res.body.integrations.length).toBeGreaterThan(0);

      const integration = res.body.integrations[0];
      expect(integration.webhookSecret).toBeUndefined();
      expect(integration.secretPrefix).toBeDefined();
      expect(integration.secretPrefix).toContain('...');
    });
  });

  describe('GET /api/integrations/:id', () => {
    it('should get single integration', async () => {
      const res = await request(app)
        .get(`/api/integrations/${testIntegrationId}`)
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testIntegrationId);
      expect(res.body.webhookSecret).toBeUndefined();
    });

    it('should return 404 for unknown integration', async () => {
      const res = await request(app)
        .get('/api/integrations/unknown-id')
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/integrations/:id', () => {
    it('should update integration', async () => {
      const res = await request(app)
        .patch(`/api/integrations/${testIntegrationId}`)
        .set('Cookie', adminSessionCookie)
        .send({
          deduplicationWindowMinutes: 30
        });

      expect(res.status).toBe(200);
      expect(res.body.deduplicationWindowMinutes).toBe(30);
    });

    it('should disable integration', async () => {
      const res = await request(app)
        .patch(`/api/integrations/${testIntegrationId}`)
        .set('Cookie', adminSessionCookie)
        .send({
          isActive: false
        });

      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);

      // Re-enable for subsequent tests
      await request(app)
        .patch(`/api/integrations/${testIntegrationId}`)
        .set('Cookie', adminSessionCookie)
        .send({ isActive: true });
    });
  });

  describe('POST /api/integrations/:id/rotate-secret', () => {
    it('should generate new secret', async () => {
      // Get current secret prefix
      const before = await request(app)
        .get(`/api/integrations/${testIntegrationId}`)
        .set('Cookie', adminSessionCookie);

      const res = await request(app)
        .post(`/api/integrations/${testIntegrationId}/rotate-secret`)
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(200);
      expect(res.body.webhookSecret).toBeDefined();
      expect(res.body.webhookSecret.length).toBe(64);

      // New secret should be different
      const after = await request(app)
        .get(`/api/integrations/${testIntegrationId}`)
        .set('Cookie', adminSessionCookie);

      expect(after.body.secretPrefix).not.toBe(before.body.secretPrefix);
    });
  });

  describe('DELETE /api/integrations/:id', () => {
    it('should delete integration', async () => {
      // Create integration to delete
      const created = await request(app)
        .post('/api/integrations')
        .set('Cookie', adminSessionCookie)
        .send({ name: 'to-delete', type: 'generic' });

      const res = await request(app)
        .delete(`/api/integrations/${created.body.id}`)
        .set('Cookie', adminSessionCookie);

      expect(res.status).toBe(204);

      // Verify deleted
      const check = await request(app)
        .get(`/api/integrations/${created.body.id}`)
        .set('Cookie', adminSessionCookie);

      expect(check.status).toBe(404);
    });
  });
});
