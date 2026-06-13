// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import qs from 'qs';

// Issue #418 - schema-boundary behaviour of the configuration `list` endpoints.
//
// This test mirrors production validation exactly (src/clients/fastify.ts):
//   - querystringParser: qs.parse  (so `filters[active]=true` -> { active: 'true' })
//   - Ajv with removeAdditional: 'all', coerceTypes: 'array', useDefaults: true
// and registers the CRUD plugin with the per-entity `Query` override the router will
// pass in production. It asserts:
//   - `sort` outside the per-entity allowlist -> 400 (enum value rejection)
//   - `order` outside ASC|DESC -> 400
//   - a recognised filter (`active`) reaches repo.list
//   - an UNKNOWN filter key is STRIPPED by removeAdditional (200, not 400, not forwarded) [D1]
//   - `meta.total` echoes the value repo.list returns (passthrough)

const mockRuleList = jest.fn();
const mockNetworkMapList = jest.fn();

jest.mock('../../src', () => ({
  configuration: { AUTHENTICATED: false },
  loggerService: { log: jest.fn(), error: jest.fn(), trace: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../src/repositories/configuration/rule.config.repository', () => ({
  RuleConfigRepo: {
    list: (...args: unknown[]) => mockRuleList(...args),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock('../../src/repositories/configuration/network.map.repository', () => ({
  NetworkMapRepo: {
    list: (...args: unknown[]) => mockNetworkMapList(...args),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

import { buildCrudPlugin } from '../../src/utils/crud-schema';
import { RuleConfigRepo } from '../../src/repositories/configuration/rule.config.repository';
import { NetworkMapRepo } from '../../src/repositories/configuration/network.map.repository';
import { RuleSchema } from '../../src/schemas/ruleSchema';
import { NetworkMapSchema } from '../../src/schemas/networkMapSchema';
// New per-entity query schemas (created in the green step). They constrain `sort` to an
// allowlist enum and `filters` to a closed set of fields.
import { RuleListQuery, NetworkMapListQuery } from '../../src/schemas/configListQuerySchema';

describe('configuration list - schema-boundary behaviour (#418)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Mirror production (src/clients/fastify.ts): the qs parser is nested under
    // routerOptions in Fastify v5, so `filters[active]=true` becomes { filters: { active: 'true' } }.
    app = Fastify({ routerOptions: { querystringParser: (str) => qs.parse(str) } });

    const ajv = new Ajv({ removeAdditional: 'all', useDefaults: true, coerceTypes: 'array', strictTuples: false });
    addFormats(ajv);
    app.setValidatorCompiler(({ schema }) => ajv.compile(schema));

    await app.register(
      buildCrudPlugin({
        prefix: '/v1/admin/configuration/rule',
        repo: RuleConfigRepo,
        schemas: { Entity: RuleSchema, Create: RuleSchema, Update: RuleSchema, Query: RuleListQuery },
        idParam: { kind: 'single', name: 'id' },
      }),
    );
    await app.register(
      buildCrudPlugin({
        prefix: '/v1/admin/configuration/network_map',
        repo: NetworkMapRepo,
        schemas: { Entity: NetworkMapSchema, Create: NetworkMapSchema, Update: NetworkMapSchema, Query: NetworkMapListQuery },
        idParam: { kind: 'cfg' },
      }),
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockRuleList.mockReset();
    mockNetworkMapList.mockReset();
    mockRuleList.mockResolvedValue({ data: [], total: 0 });
    mockNetworkMapList.mockResolvedValue({ data: [], total: 0 });
  });

  it('rejects a `sort` value outside the per-entity allowlist with 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule?sort=nope' });
    expect(res.statusCode).toBe(400);
    expect(mockRuleList).not.toHaveBeenCalled();
  });

  it('accepts an allowlisted `sort` value', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule?sort=id' });
    expect(res.statusCode).toBe(200);
    expect(mockRuleList).toHaveBeenCalledWith(expect.objectContaining({ sort: 'id' }));
  });

  it('rejects an `order` outside ASC|DESC with 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule?order=SIDEWAYS' });
    expect(res.statusCode).toBe(400);
    expect(mockRuleList).not.toHaveBeenCalled();
  });

  it('forwards a recognised filter (`active`) to repo.list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/configuration/network_map?filters[active]=true' });
    expect(res.statusCode).toBe(200);
    expect(mockNetworkMapList).toHaveBeenCalledWith(expect.objectContaining({ filters: { active: 'true' } }));
  });

  it('rejects a malformed boolean `active` filter with 400 (avoids a Postgres ::boolean cast 500)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/configuration/network_map?filters[active]=foo' });
    expect(res.statusCode).toBe(400);
    expect(mockNetworkMapList).not.toHaveBeenCalled();
  });

  it('strips an unknown filter key (D1: ignored, not 400, not forwarded)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/configuration/network_map?filters[nope]=x&filters[active]=true' });
    expect(res.statusCode).toBe(200);
    const forwarded = mockNetworkMapList.mock.calls[0][0] as { filters?: Record<string, string> };
    expect(forwarded.filters).toEqual({ active: 'true' });
    expect(forwarded.filters).not.toHaveProperty('nope');
  });

  it('passes meta.total straight through from repo.list', async () => {
    mockNetworkMapList.mockResolvedValueOnce({ data: [], total: 99 });
    const res = await app.inject({ method: 'GET', url: '/v1/admin/configuration/network_map' });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta).toEqual({ total: 99, limit: 20, offset: 0 });
  });
});
