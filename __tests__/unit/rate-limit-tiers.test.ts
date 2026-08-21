// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from '@jest/globals';
import { RateLimitTiers, rateLimitKeyGenerator, UNAUTHENTICATED_TENANT_SENTINEL } from '../../src/utils/rate-limit-tiers';
import type { FastifyRequest } from 'fastify';
import type { ITenantRequest } from '../../src/interface/ITenantRequest';

const fakeRequest = (tenantId: string | undefined, ip: string): FastifyRequest => ({ tenantId, ip }) as unknown as ITenantRequest;

describe('RateLimitTiers', () => {
  it('orders max ascending from expensive -> write -> read (costlier routes get a tighter budget)', () => {
    expect(RateLimitTiers.expensive.max).toBeLessThan(RateLimitTiers.write.max);
    expect(RateLimitTiers.write.max).toBeLessThan(RateLimitTiers.read.max);
  });

  it('every tier shares the same time window unit so the numbers stay directly comparable', () => {
    expect(RateLimitTiers.read.timeWindow).toBe('1 minute');
    expect(RateLimitTiers.write.timeWindow).toBe('1 minute');
    expect(RateLimitTiers.expensive.timeWindow).toBe('1 minute');
  });
});

// Regression test: a plain `tenantId ?? req.ip` would never fall back to the IP, since
// unauthenticated requests get the literal tenantId 'DEFAULT', not undefined.
describe('rateLimitKeyGenerator', () => {
  it('keys authenticated requests by tenantId, ignoring the IP entirely', () => {
    const reqA = fakeRequest('tenant-a', '10.0.0.1');
    const reqB = fakeRequest('tenant-a', '10.0.0.2');
    expect(rateLimitKeyGenerator(reqA)).toBe('tenant-a');
    expect(rateLimitKeyGenerator(reqB)).toBe('tenant-a');
  });

  it('distinguishes different tenants sharing the same IP', () => {
    const reqA = fakeRequest('tenant-a', '10.0.0.1');
    const reqB = fakeRequest('tenant-b', '10.0.0.1');
    expect(rateLimitKeyGenerator(reqA)).not.toBe(rateLimitKeyGenerator(reqB));
  });

  it("falls back to req.ip when tenantId is the unauthenticated sentinel 'DEFAULT' (the bug this guards against)", () => {
    const client1 = fakeRequest(UNAUTHENTICATED_TENANT_SENTINEL, '203.0.113.1');
    const client2 = fakeRequest(UNAUTHENTICATED_TENANT_SENTINEL, '203.0.113.2');
    // Same literal tenantId for both — must key by IP instead, or they'd share one bucket.
    expect(rateLimitKeyGenerator(client1)).toBe('203.0.113.1');
    expect(rateLimitKeyGenerator(client2)).toBe('203.0.113.2');
    expect(rateLimitKeyGenerator(client1)).not.toBe(rateLimitKeyGenerator(client2));
  });

  it('falls back to req.ip when tenantId is missing entirely', () => {
    expect(rateLimitKeyGenerator(fakeRequest(undefined, '203.0.113.5'))).toBe('203.0.113.5');
  });

  it('falls back to req.ip when tenantId is an empty string', () => {
    expect(rateLimitKeyGenerator(fakeRequest('', '203.0.113.9'))).toBe('203.0.113.9');
  });
});
