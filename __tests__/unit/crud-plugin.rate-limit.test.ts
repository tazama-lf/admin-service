// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import { fastifyRateLimit } from '@fastify/rate-limit';
import Redis from 'ioredis';

// End-to-end coverage for buildCrudPlugin's per-route rateLimit option, using the project's
// existing ioredis -> ioredis-mock mapping (a real Redis-backed store, not a stub).

const mockList = jest.fn();
const mockGet = jest.fn();
const mockCreate = jest.fn();

jest.mock('../../src', () => ({
  configuration: { AUTHENTICATED: false },
  loggerService: { log: jest.fn(), error: jest.fn(), trace: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../src/repositories/configuration/rule.config.repository', () => ({
  RuleConfigRepo: {
    list: (...args: unknown[]) => mockList(...args),
    get: (...args: unknown[]) => mockGet(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

import { buildCrudPlugin } from '../../src/utils/crud-schema';
import { RuleConfigRepo } from '../../src/repositories/configuration/rule.config.repository';
import { RuleSchema } from '../../src/schemas/ruleSchema';
import { RuleListQuery } from '../../src/schemas/configListQuerySchema';

describe('buildCrudPlugin - rate-limit opt-in (issue-rate-limiting)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(fastifyRateLimit, {
      global: false,
      redis: new Redis(),
      errorResponseBuilder: (_req, context) => ({
        statusCode: 429,
        message: `Rate limit exceeded, retry in ${context.after}`,
      }),
    });

    await app.register(
      buildCrudPlugin({
        prefix: '/v1/admin/configuration/rule',
        repo: RuleConfigRepo,
        schemas: { Entity: RuleSchema, Create: RuleSchema, Update: RuleSchema, Query: RuleListQuery },
        idParam: { kind: 'single', name: 'id' },
        rateLimit: { list: { max: 2, timeWindow: '1 minute' }, get: { max: 1, timeWindow: '1 minute' } },
        // `write` left undeclared on purpose: proves opt-in is per-route, not per-plugin.
      }),
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockList.mockReset().mockResolvedValue({ data: [], total: 0 });
    mockGet.mockReset().mockResolvedValue({ id: '1', cfg: '1.0.0', config: {} });
    mockCreate.mockReset().mockResolvedValue({ id: '1', cfg: '1.0.0', config: {} });
  });

  it('allows requests up to the LIST tier max, then returns 429 with a Retry-After header', async () => {
    const r1 = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule' });
    const r2 = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule' });
    const r3 = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule' });

    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(r3.statusCode).toBe(429);
    expect(r3.headers['retry-after']).toBeDefined();
    expect(r3.json().message).toMatch(/Rate limit exceeded/);
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('enforces the GET tier independently of the LIST tier (different route, different budget)', async () => {
    const r1 = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule/1/1.0.0' });
    const r2 = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule/1/1.0.0' });

    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(429);
  });

  it('leaves a route with no declared tier (write) completely unaffected, even past the LIST/GET budgets', async () => {
    const validBody = { id: 'x', cfg: '1.0.0', config: {} };
    const attempts = await Promise.all(
      Array.from({ length: 5 }, async () => app.inject({ method: 'POST', url: '/v1/admin/configuration/rule', payload: validBody })),
    );
    expect(attempts.every((res) => res.statusCode === 201)).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(5);
  });
});
