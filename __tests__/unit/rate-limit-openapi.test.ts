// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import { fastifySwagger } from '@fastify/swagger';
import { fastifyRateLimit } from '@fastify/rate-limit';
import Redis from 'ioredis';

// Covers issue §2.9: routes that declare a rate-limit tier must document the 429 response and its
// Retry-After header in the generated OpenAPI spec; routes without a tier must stay untouched.

jest.mock('../../src', () => ({
  configuration: { AUTHENTICATED: false },
  loggerService: { log: jest.fn(), error: jest.fn(), trace: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../src/repositories/configuration/rule.config.repository', () => ({
  RuleConfigRepo: { list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
}));

import { buildCrudPlugin } from '../../src/utils/crud-schema';
import { RuleConfigRepo } from '../../src/repositories/configuration/rule.config.repository';
import { RuleSchema } from '../../src/schemas/ruleSchema';
import { RuleListQuery } from '../../src/schemas/configListQuerySchema';
import { SetOptionsBodyAndParams } from '../../src/utils/schema-utils';
import { RateLimitTiers, rateLimitErrorResponseBuilder } from '../../src/utils/rate-limit-tiers';

interface OpenApiResponse {
  description?: string;
  headers?: Record<string, { description?: string; schema?: { type?: string } }>;
  content?: Record<string, { schema?: { properties?: Record<string, unknown> } }>;
}
type OpenApiSpec = { paths: Record<string, Record<string, { responses: Record<string, OpenApiResponse> }>> };

describe('OpenAPI documentation for rate-limited routes (issue §2.9)', () => {
  let app: FastifyInstance;
  let spec: OpenApiSpec;

  beforeAll(async () => {
    app = Fastify();
    await app.register(fastifySwagger, { openapi: { info: { title: 'test', version: '0.0.0' } } });
    await app.register(fastifyRateLimit, { global: false, redis: new Redis(), errorResponseBuilder: rateLimitErrorResponseBuilder });

    await app.register(
      buildCrudPlugin({
        prefix: '/v1/admin/configuration/rule',
        repo: RuleConfigRepo,
        schemas: { Entity: RuleSchema, Create: RuleSchema, Update: RuleSchema, Query: RuleListQuery },
        idParam: { kind: 'single', name: 'id' },
        // `write` left undeclared on purpose: its routes must not gain a documented 429.
        rateLimit: { list: RateLimitTiers.read, get: RateLimitTiers.read },
      }),
    );

    const handler = async (): Promise<{ ok: boolean }> => ({ ok: true });
    app.get('/standalone/limited', SetOptionsBodyAndParams(handler, 'claim', undefined, undefined, undefined, RateLimitTiers.expensive));
    app.get('/standalone/unlimited', SetOptionsBodyAndParams(handler, 'claim'));

    await app.ready();
    spec = app.swagger() as unknown as OpenApiSpec;
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['CRUD LIST', '/v1/admin/configuration/rule', 'get'],
    ['CRUD GET', '/v1/admin/configuration/rule/{id}/{cfg}', 'get'],
    ['standalone route', '/standalone/limited', 'get'],
  ])('documents the 429 response and Retry-After header on a rate-limited %s', (_label, path, method) => {
    const response = spec.paths[path][method].responses['429'];

    expect(response).toBeDefined();
    expect(response.description).toMatch(/rate limit/i);
    expect(response.headers?.['retry-after']).toBeDefined();
    expect(response.headers?.['retry-after'].description).toMatch(/seconds/i);
    expect(Object.keys(response.headers ?? {})).toEqual(
      expect.arrayContaining(['retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset']),
    );
  });

  it('documents the 429 body with the same fields the error builder returns', () => {
    const response = spec.paths['/standalone/limited'].get.responses['429'];
    const properties = response.content?.['application/json'].schema?.properties ?? {};

    expect(Object.keys(properties).sort()).toEqual(['details', 'error', 'message', 'statusCode', 'success']);
    // `headers` is a swagger-only keyword and must not leak into the documented body schema.
    expect(properties).not.toHaveProperty('headers');
  });

  it('leaves routes without a declared tier free of a 429 entry', () => {
    expect(spec.paths['/standalone/unlimited'].get.responses['429']).toBeUndefined();
    expect(spec.paths['/v1/admin/configuration/rule'].post.responses['429']).toBeUndefined();
  });
});
