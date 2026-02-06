import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../config/database.js';
import bcrypt from 'bcrypt';
import { createTestUser, cleanupTestData } from './setup.js';

describe('Authentication', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('GET /auth/status', () => {
    it('returns authenticated: false when not logged in', async () => {
      const res = await request(app).get('/auth/status');
      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(false);
    });
  });

  describe('GET /auth/login', () => {
    it('redirects to Okta authorization URL', async () => {
      const res = await request(app).get('/auth/login');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('authorize');
    });
  });

  describe('POST /auth/emergency (break-glass)', () => {
    it('returns 401 for non-break-glass account', async () => {
      const user = await createTestUser({
        isBreakGlassAccount: false
      });

      const res = await request(app)
        .post('/auth/emergency')
        .send({ email: user.email, password: 'wrongpassword' });

      expect(res.status).toBe(401);
    });

    it('returns 401 for wrong password', async () => {
      const passwordHash = await bcrypt.hash('correctpassword', 10);
      const user = await createTestUser({
        isBreakGlassAccount: true,
        passwordHash
      });

      const res = await request(app)
        .post('/auth/emergency')
        .send({ email: user.email, password: 'wrongpassword' });

      expect(res.status).toBe(401);
    });

    it('authenticates valid break-glass account', async () => {
      const passwordHash = await bcrypt.hash('correctpassword', 10);
      const user = await createTestUser({
        isBreakGlassAccount: true,
        passwordHash,
        platformRole: 'PLATFORM_ADMIN'
      });

      const res = await request(app)
        .post('/auth/emergency')
        .send({ email: user.email, password: 'correctpassword' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.isBreakGlassAccount).toBe(true);
    });

    it('rate limits excessive attempts', async () => {
      const user = await createTestUser({
        isBreakGlassAccount: true
      });

      // Make 6 requests (limit is 5)
      for (let i = 0; i < 6; i++) {
        await request(app)
          .post('/auth/emergency')
          .send({ email: user.email, password: 'wrong' });
      }

      const res = await request(app)
        .post('/auth/emergency')
        .send({ email: user.email, password: 'wrong' });

      expect(res.status).toBe(429);
    });

    it('creates audit event for break-glass login', async () => {
      const passwordHash = await bcrypt.hash('password123', 10);
      const user = await createTestUser({
        isBreakGlassAccount: true,
        passwordHash
      });

      await request(app)
        .post('/auth/emergency')
        .send({ email: user.email, password: 'password123' });

      const audit = await prisma.auditEvent.findFirst({
        where: {
          action: 'auth.breakglass.success',
          userId: user.id
        }
      });

      expect(audit).toBeTruthy();
      expect(audit?.severity).toBe('HIGH');
    });
  });

  describe('POST /auth/logout', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request(app).post('/auth/logout');
      expect(res.status).toBe(401);
    });
  });
});
