import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../index.js';
import { prisma } from '../config/database.js';

describe('Webhook Receiver', () => {
  let integration: any;
  let webhookSecret: string;

  beforeAll(async () => {
    // Ensure test database
    if (!process.env.DATABASE_URL?.includes('test')) {
      throw new Error('Tests must run against test database');
    }

    // Create test integration directly (bypass API to get secret)
    webhookSecret = crypto.randomBytes(32).toString('hex');

    integration = await prisma.integration.create({
      data: {
        name: 'test-webhook-integration',
        type: 'generic',
        webhookSecret,
        signatureHeader: 'X-Webhook-Signature',
        signatureAlgorithm: 'sha256',
        signatureFormat: 'hex',
        deduplicationWindowMinutes: 15
      }
    });
  });

  afterAll(async () => {
    // Cleanup in order (respect foreign keys)
    await prisma.webhookDelivery.deleteMany({});
    await prisma.alert.deleteMany({});
    await prisma.integration.deleteMany({});
  });

  beforeEach(async () => {
    // Clean alerts and deliveries between tests
    await prisma.webhookDelivery.deleteMany({});
    await prisma.alert.deleteMany({});
  });

  function generateSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  describe('POST /webhooks/alerts/:integrationName', () => {
    it('should create alert from valid webhook', async () => {
      const payload = {
        title: 'High CPU Alert',
        severity: 'critical',
        timestamp: new Date().toISOString(),
        description: 'CPU usage exceeded 90%',
        source: 'test-server',
        external_id: 'alert-123'
      };

      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, webhookSecret);

      const res = await request(app)
        .post(`/webhooks/alerts/${integration.name}`)
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', signature)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.alert_id).toBeDefined();
      expect(res.body.status).toBe('created');
      expect(res.body.title).toBe('High CPU Alert');
      expect(res.body.severity).toBe('CRITICAL');

      // Verify alert in database
      const alert = await prisma.alert.findUnique({
        where: { id: res.body.alert_id }
      });
      expect(alert).toBeDefined();
      expect(alert?.title).toBe('High CPU Alert');
      expect(alert?.status).toBe('OPEN');

      // Verify delivery logged
      const delivery = await prisma.webhookDelivery.findFirst({
        where: { alertId: alert?.id }
      });
      expect(delivery).toBeDefined();
      expect(delivery?.statusCode).toBe(201);
    });

    it('should reject webhook with invalid signature', async () => {
      const payload = {
        title: 'Test Alert',
        severity: 'low',
        timestamp: new Date().toISOString()
      };

      const res = await request(app)
        .post(`/webhooks/alerts/${integration.name}`)
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', 'invalid-signature')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.type).toContain('invalid-signature');
    });

    it('should reject webhook with missing signature', async () => {
      const payload = {
        title: 'Test Alert',
        severity: 'low',
        timestamp: new Date().toISOString()
      };

      const res = await request(app)
        .post(`/webhooks/alerts/${integration.name}`)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.type).toContain('missing-signature');
    });

    it('should return 200 for duplicate webhook (idempotent)', async () => {
      const payload = {
        title: 'Duplicate Test',
        severity: 'high',
        timestamp: new Date().toISOString(),
        external_id: 'dup-123'
      };

      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, webhookSecret);

      // First request creates alert
      const first = await request(app)
        .post(`/webhooks/alerts/${integration.name}`)
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', signature)
        .send(payload);

      expect(first.status).toBe(201);
      const alertId = first.body.alert_id;

      // Second request is duplicate
      const second = await request(app)
        .post(`/webhooks/alerts/${integration.name}`)
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', signature)
        .send(payload);

      expect(second.status).toBe(200);
      expect(second.body.status).toBe('duplicate');
      expect(second.body.alert_id).toBe(alertId);
      expect(second.body.idempotent).toBe(true);

      // Verify only one alert created
      const alertCount = await prisma.alert.count();
      expect(alertCount).toBe(1);

      // Verify both deliveries logged
      const deliveryCount = await prisma.webhookDelivery.count();
      expect(deliveryCount).toBe(2);
    });

    it('should detect duplicate by idempotency key header', async () => {
      const idempotencyKey = `test-${Date.now()}`;

      // Different payloads but same idempotency key
      const payload1 = {
        title: 'Alert 1',
        severity: 'low',
        timestamp: new Date().toISOString()
      };

      const payload2 = {
        title: 'Alert 2',
        severity: 'medium',
        timestamp: new Date().toISOString()
      };

      const signature1 = generateSignature(JSON.stringify(payload1), webhookSecret);
      const signature2 = generateSignature(JSON.stringify(payload2), webhookSecret);

      // First request
      const first = await request(app)
        .post(`/webhooks/alerts/${integration.name}`)
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', signature1)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload1);

      expect(first.status).toBe(201);

      // Second request with same idempotency key
      const second = await request(app)
        .post(`/webhooks/alerts/${integration.name}`)
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', signature2)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload2);

      expect(second.status).toBe(200);
      expect(second.body.status).toBe('duplicate');
      expect(second.body.alert_id).toBe(first.body.alert_id);
    });

    it('should return 400 for invalid payload', async () => {
      const payload = {
        // Missing required title
        severity: 'high',
        timestamp: new Date().toISOString()
      };

      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, webhookSecret);

      const res = await request(app)
        .post(`/webhooks/alerts/${integration.name}`)
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', signature)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.type).toContain('validation-failed');
      expect(res.body.validation_errors).toBeDefined();
      expect(res.body.validation_errors.some((e: any) => e.field === 'title')).toBe(true);

      // Verify delivery logged with 400
      const delivery = await prisma.webhookDelivery.findFirst({
        orderBy: { createdAt: 'desc' }
      });
      expect(delivery?.statusCode).toBe(400);
    });

    it('should return 404 for unknown integration', async () => {
      const payload = {
        title: 'Test',
        severity: 'low',
        timestamp: new Date().toISOString()
      };

      const res = await request(app)
        .post('/webhooks/alerts/nonexistent-integration')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', 'any')
        .send(payload);

      expect(res.status).toBe(404);
    });

    it('should return 404 for disabled integration', async () => {
      // Disable integration
      await prisma.integration.update({
        where: { id: integration.id },
        data: { isActive: false }
      });

      const payload = {
        title: 'Test',
        severity: 'low',
        timestamp: new Date().toISOString()
      };

      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, webhookSecret);

      const res = await request(app)
        .post(`/webhooks/alerts/${integration.name}`)
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', signature)
        .send(payload);

      expect(res.status).toBe(404);

      // Re-enable
      await prisma.integration.update({
        where: { id: integration.id },
        data: { isActive: true }
      });
    });

    it('should normalize severity values', async () => {
      const testCases = [
        { input: 'P1', expected: 'CRITICAL' },
        { input: 'warning', expected: 'MEDIUM' },
        { input: 'EMERGENCY', expected: 'CRITICAL' },
        { input: 'info', expected: 'INFO' }
      ];

      for (const { input, expected } of testCases) {
        const payload = {
          title: `Test ${input}`,
          severity: input,
          timestamp: new Date().toISOString()
        };

        const payloadString = JSON.stringify(payload);
        const signature = generateSignature(payloadString, webhookSecret);

        const res = await request(app)
          .post(`/webhooks/alerts/${integration.name}`)
          .set('Content-Type', 'application/json')
          .set('X-Webhook-Signature', signature)
          .send(payload);

        expect(res.status).toBe(201);
        expect(res.body.severity).toBe(expected);

        // Cleanup for next iteration
        await prisma.webhookDelivery.deleteMany({});
        await prisma.alert.deleteMany({});
      }
    });

    it('should handle Unix timestamps', async () => {
      const unixTimestamp = Math.floor(Date.now() / 1000);
      const payload = {
        title: 'Unix Timestamp Test',
        severity: 'low',
        timestamp: unixTimestamp
      };

      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString, webhookSecret);

      const res = await request(app)
        .post(`/webhooks/alerts/${integration.name}`)
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', signature)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.triggered_at).toBeDefined();
      // Should be close to now
      const triggeredAt = new Date(res.body.triggered_at);
      expect(Math.abs(triggeredAt.getTime() - Date.now())).toBeLessThan(5000);
    });
  });

  describe('GET /webhooks/alerts/:integrationName/test', () => {
    it('should return 200 without auth', async () => {
      const res = await request(app)
        .get(`/webhooks/alerts/${integration.name}/test`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.message).toContain('reachable');
    });
  });
});
