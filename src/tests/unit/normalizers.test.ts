import { describe, it, expect } from 'vitest';
import { normalizeDatadogPayload } from '../../webhooks/schemas/datadog.schema.js';
import { normalizeNewRelicPayload } from '../../webhooks/schemas/newrelic.schema.js';

describe('DataDog Normalizer', () => {
  it('normalizes basic DataDog payload', () => {
    const payload = {
      alert_id: 'dd-12345',
      alert_title: 'High CPU Usage',
      alert_status: 'alert',
      alert_priority: 'P2',
      alert_metric: 'system.cpu.user',
      org_id: 'org-123',
      org_name: 'Test Org',
      event_msg: 'CPU usage is above 90%',
      date: 1704067200, // 2024-01-01 00:00:00 UTC
      tags: ['service:api', 'env:production']
    };

    const result = normalizeDatadogPayload(payload, 'datadog-prod');

    expect(result.title).toBe('[DataDog] High CPU Usage');
    expect(result.description).toBe('CPU usage is above 90%');
    expect(result.severity).toBe('HIGH'); // P2 -> HIGH
    expect(result.source).toBe('datadog-prod');
    expect(result.externalId).toBe('dd-12345');
    expect(result.metadata.service).toBe('api');
    expect(result.metadata.provider).toBe('datadog');
    expect(result.metadata.datadog.tags).toEqual(['service:api', 'env:production']);
    expect(result.metadata.tags.service).toBe('api');
    expect(result.metadata.tags.env).toBe('production');
  });

  it('maps P1 to CRITICAL severity', () => {
    const payload = {
      alert_id: 'dd-1',
      alert_title: 'Critical Alert',
      alert_priority: 'P1',
      alert_status: 'alert',
      event_msg: 'Critical issue',
      date: Date.now() / 1000
    };

    const result = normalizeDatadogPayload(payload, 'test');
    expect(result.severity).toBe('CRITICAL');
  });

  it('maps P3 to MEDIUM severity', () => {
    const payload = {
      alert_id: 'dd-2',
      alert_title: 'Medium Alert',
      alert_priority: 'P3',
      alert_status: 'alert',
      event_msg: 'Medium priority issue',
      date: Date.now() / 1000
    };

    const result = normalizeDatadogPayload(payload, 'test');
    expect(result.severity).toBe('MEDIUM');
  });

  it('maps P4 to LOW severity', () => {
    const payload = {
      alert_id: 'dd-3',
      alert_title: 'Low Alert',
      alert_priority: 'P4',
      alert_status: 'alert',
      event_msg: 'Low priority issue',
      date: Date.now() / 1000
    };

    const result = normalizeDatadogPayload(payload, 'test');
    expect(result.severity).toBe('LOW');
  });

  it('maps P5 to INFO severity', () => {
    const payload = {
      alert_id: 'dd-4',
      alert_title: 'Info Alert',
      alert_priority: 'P5',
      alert_status: 'alert',
      event_msg: 'Informational alert',
      date: Date.now() / 1000
    };

    const result = normalizeDatadogPayload(payload, 'test');
    expect(result.severity).toBe('INFO');
  });

  it('defaults unknown severity to MEDIUM', () => {
    const payload = {
      alert_id: 'dd-1',
      alert_title: 'Unknown Priority',
      alert_priority: 'UNKNOWN',
      alert_status: 'alert',
      event_msg: 'Unknown priority issue',
      date: Date.now() / 1000
    };

    const result = normalizeDatadogPayload(payload, 'test');
    expect(result.severity).toBe('MEDIUM');
  });

  it('extracts service from tags', () => {
    const payload = {
      alert_id: 'dd-1',
      alert_title: 'Test',
      alert_priority: 'P3',
      alert_status: 'alert',
      event_msg: 'Test message',
      date: Date.now() / 1000,
      tags: ['env:prod', 'service:payment-api', 'team:payments']
    };

    const result = normalizeDatadogPayload(payload, 'test');
    expect(result.metadata.service).toBe('payment-api');
  });

  it('handles missing service tag', () => {
    const payload = {
      alert_id: 'dd-1',
      alert_title: 'Test',
      alert_priority: 'P3',
      alert_status: 'alert',
      event_msg: 'Test message',
      date: Date.now() / 1000,
      tags: ['env:prod', 'team:payments']
    };

    const result = normalizeDatadogPayload(payload, 'test');
    expect(result.metadata.service).toBeUndefined();
  });

  it('preserves unknown fields in metadata.raw', () => {
    const payload = {
      alert_id: 'dd-1',
      alert_title: 'Test',
      alert_priority: 'P3',
      alert_status: 'alert',
      event_msg: 'Test message',
      date: Date.now() / 1000,
      custom_field: 'custom_value',
      another_field: 123
    };

    const result = normalizeDatadogPayload(payload, 'test');
    expect((result.metadata.raw as any).custom_field).toBe('custom_value');
    expect((result.metadata.raw as any).another_field).toBe(123);
  });

  it('converts Unix timestamp to Date', () => {
    const timestamp = 1704067200; // 2024-01-01 00:00:00 UTC
    const payload = {
      alert_id: 'dd-1',
      alert_title: 'Test',
      alert_priority: 'P3',
      alert_status: 'alert',
      event_msg: 'Test message',
      date: timestamp
    };

    const result = normalizeDatadogPayload(payload, 'test');
    expect(result.triggeredAt).toEqual(new Date(timestamp * 1000));
  });
});

describe('New Relic Normalizer', () => {
  it('normalizes basic New Relic payload', () => {
    const payload = {
      id: 'nr-67890',
      title: 'Error Rate Spike',
      priority: 'CRITICAL',
      state: 'open',
      message: 'Error rate exceeded 5%',
      timestamp: '2024-01-01T00:00:00Z',
      labels: {
        service: 'checkout',
        env: 'production'
      }
    };

    const result = normalizeNewRelicPayload(payload, 'newrelic-prod');

    expect(result.title).toBe('[New Relic] Error Rate Spike');
    expect(result.description).toBe('Error rate exceeded 5%');
    expect(result.severity).toBe('CRITICAL');
    expect(result.source).toBe('newrelic-prod');
    expect(result.externalId).toBe('nr-67890');
    expect(result.metadata.service).toBe('checkout');
    expect(result.metadata.provider).toBe('newrelic');
    expect(result.metadata.newrelic.labels).toEqual({
      service: 'checkout',
      env: 'production'
    });
  });

  it('maps CRITICAL severity correctly', () => {
    const payload = {
      id: 'nr-1',
      title: 'Critical Alert',
      priority: 'CRITICAL',
      state: 'open',
      message: 'Critical issue',
      timestamp: new Date().toISOString()
    };

    const result = normalizeNewRelicPayload(payload, 'test');
    expect(result.severity).toBe('CRITICAL');
  });

  it('maps HIGH severity correctly', () => {
    const payload = {
      id: 'nr-1',
      title: 'High Priority Alert',
      priority: 'HIGH',
      state: 'open',
      message: 'High priority issue',
      timestamp: new Date().toISOString()
    };

    const result = normalizeNewRelicPayload(payload, 'test');
    expect(result.severity).toBe('HIGH');
  });

  it('maps MEDIUM severity correctly', () => {
    const payload = {
      id: 'nr-2',
      title: 'Medium Priority Alert',
      priority: 'MEDIUM',
      state: 'open',
      message: 'Medium priority issue',
      timestamp: new Date().toISOString()
    };

    const result = normalizeNewRelicPayload(payload, 'test');
    expect(result.severity).toBe('MEDIUM');
  });

  it('maps LOW severity correctly', () => {
    const payload = {
      id: 'nr-3',
      title: 'Low Priority Alert',
      priority: 'LOW',
      state: 'open',
      message: 'Low priority issue',
      timestamp: new Date().toISOString()
    };

    const result = normalizeNewRelicPayload(payload, 'test');
    expect(result.severity).toBe('LOW');
  });

  it('maps INFO severity correctly', () => {
    const payload = {
      id: 'nr-4',
      title: 'Info Alert',
      priority: 'INFO',
      state: 'open',
      message: 'Informational alert',
      timestamp: new Date().toISOString()
    };

    const result = normalizeNewRelicPayload(payload, 'test');
    expect(result.severity).toBe('INFO');
  });

  it('handles case-insensitive priority', () => {
    const payload = {
      id: 'nr-1',
      title: 'Test',
      priority: 'high',
      state: 'open',
      message: 'Test message',
      timestamp: new Date().toISOString()
    };

    const result = normalizeNewRelicPayload(payload, 'test');
    expect(result.severity).toBe('HIGH');
  });

  it('defaults unknown priority to MEDIUM', () => {
    const payload = {
      id: 'nr-1',
      title: 'Unknown Priority',
      priority: 'UNKNOWN_LEVEL',
      state: 'open',
      message: 'Unknown priority',
      timestamp: new Date().toISOString()
    };

    const result = normalizeNewRelicPayload(payload, 'test');
    expect(result.severity).toBe('MEDIUM');
  });

  it('extracts service from labels', () => {
    const payload = {
      id: 'nr-1',
      title: 'Test',
      priority: 'MEDIUM',
      state: 'open',
      message: 'Test message',
      timestamp: new Date().toISOString(),
      labels: {
        service: 'user-api',
        region: 'us-east-1'
      }
    };

    const result = normalizeNewRelicPayload(payload, 'test');
    expect(result.metadata.service).toBe('user-api');
  });

  it('handles missing service label', () => {
    const payload = {
      id: 'nr-1',
      title: 'Test',
      priority: 'MEDIUM',
      state: 'open',
      message: 'Test message',
      timestamp: new Date().toISOString(),
      labels: {
        region: 'us-east-1'
      }
    };

    const result = normalizeNewRelicPayload(payload, 'test');
    expect(result.metadata.service).toBeUndefined();
  });

  it('preserves unknown fields in metadata.raw', () => {
    const payload = {
      id: 'nr-1',
      title: 'Test',
      priority: 'LOW',
      state: 'open',
      message: 'Test message',
      timestamp: new Date().toISOString(),
      condition_id: 'cond-123',
      policy_name: 'Production Policy'
    };

    const result = normalizeNewRelicPayload(payload, 'test');
    expect((result.metadata.raw as any).condition_id).toBe('cond-123');
    expect((result.metadata.raw as any).policy_name).toBe('Production Policy');
  });

  it('parses ISO timestamp correctly', () => {
    const timestamp = '2024-01-01T12:30:45.123Z';
    const payload = {
      id: 'nr-1',
      title: 'Test',
      priority: 'MEDIUM',
      state: 'open',
      message: 'Test message',
      timestamp
    };

    const result = normalizeNewRelicPayload(payload, 'test');
    expect(result.triggeredAt).toEqual(new Date(timestamp));
  });

  it('preserves New Relic-specific fields in metadata', () => {
    const payload = {
      id: 'nr-1',
      title: 'Test',
      priority: 'HIGH',
      state: 'acknowledged',
      message: 'Test message',
      timestamp: new Date().toISOString(),
      condition_name: 'High Error Rate',
      condition_id: 12345,
      account_id: 'acc-789',
      account_name: 'Production Account',
      policy_name: 'Critical Alerts',
      policy_url: 'https://rpm.newrelic.com/policies/123',
      incident_url: 'https://rpm.newrelic.com/incidents/456'
    };

    const result = normalizeNewRelicPayload(payload, 'test');
    expect(result.metadata.newrelic.condition_name).toBe('High Error Rate');
    expect(result.metadata.newrelic.condition_id).toBe(12345);
    expect(result.metadata.newrelic.account_id).toBe('acc-789');
    expect(result.metadata.newrelic.account_name).toBe('Production Account');
    expect(result.metadata.newrelic.policy_name).toBe('Critical Alerts');
    expect(result.metadata.newrelic.policy_url).toBe('https://rpm.newrelic.com/policies/123');
    expect(result.metadata.newrelic.incident_url).toBe('https://rpm.newrelic.com/incidents/456');
    expect(result.metadata.newrelic.state).toBe('acknowledged');
  });
});
