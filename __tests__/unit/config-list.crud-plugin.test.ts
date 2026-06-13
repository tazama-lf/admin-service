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

  // --- limit=all (#422): bounded default stays, explicit opt-in for the full set ---

  it('accepts limit=all and forwards it to repo.list (#422)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule?limit=all' });
    expect(res.statusCode).toBe(200);
    expect(mockRuleList).toHaveBeenCalledWith(expect.objectContaining({ limit: 'all' }));
  });

  it('reports meta.limit = total and meta.offset = 0 for limit=all (#422)', async () => {
    mockRuleList.mockResolvedValueOnce({ data: [], total: 99 });
    const res = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule?limit=all' });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta).toEqual({ total: 99, limit: 99, offset: 0 });
  });

  it('allows limit=all with an explicit offset=0 (#422)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule?limit=all&offset=0' });
    expect(res.statusCode).toBe(200);
    expect(mockRuleList).toHaveBeenCalledWith(expect.objectContaining({ limit: 'all' }));
  });

  it('rejects limit=all combined with a non-zero offset with 400 (mutually exclusive, #422)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule?limit=all&offset=10' });
    expect(res.statusCode).toBe(400);
    // Must be the handler-level cross-field guard, not the schema rejecting the literal 'all'.
    expect(res.json().message).toMatch(/offset/i);
    expect(mockRuleList).not.toHaveBeenCalled();
  });

  it('forwards the bounded default limit:20 and offset:0 when no paging params are supplied (#422)', async () => {
    await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule' });
    expect(mockRuleList).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 0 }));
  });

  it('forwards a bare offset with the bounded default limit:20 (#422)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule?offset=10' });
    expect(res.statusCode).toBe(200);
    expect(mockRuleList).toHaveBeenCalledWith(expect.objectContaining({ offset: 10, limit: 20 }));
  });

  it('still rejects an over-cap numeric limit with 400 (#422)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule?limit=500' });
    expect(res.statusCode).toBe(400);
    expect(mockRuleList).not.toHaveBeenCalled();
  });

  // --- targeted batch fetch by (id, cfg) set (#423) ---

  it('forwards a parsed (id, cfg) set to repo.list as an array of {id, cfg} (#423)', async () => {
    const url = '/v1/admin/configuration/rule?keys[0][id]=EFRuP@1.0.0&keys[0][cfg]=1.0.0&keys[1][id]=Foo@1.0.0&keys[1][cfg]=1.0.0';
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    expect(mockRuleList).toHaveBeenCalledWith(
      expect.objectContaining({
        keys: [
          { id: 'EFRuP@1.0.0', cfg: '1.0.0' },
          { id: 'Foo@1.0.0', cfg: '1.0.0' },
        ],
      }),
    );
  });

  it('accepts the (id, cfg) set together with limit=all (the canonical client call, #423)', async () => {
    const url = '/v1/admin/configuration/rule?keys[0][id]=EFRuP@1.0.0&keys[0][cfg]=1.0.0&limit=all';
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    expect(mockRuleList).toHaveBeenCalledWith(expect.objectContaining({ keys: [{ id: 'EFRuP@1.0.0', cfg: '1.0.0' }], limit: 'all' }));
  });

  it('rejects a malformed set entry (a pair missing cfg) with 400 (#423)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule?keys[0][id]=EFRuP@1.0.0' });
    expect(res.statusCode).toBe(400);
    expect(mockRuleList).not.toHaveBeenCalled();
  });

  it('rejects a set larger than the maxItems cap with 400 (#423)', async () => {
    const pairs = Array.from({ length: 201 }, (_, i) => `keys[${i}][id]=r${i}&keys[${i}][cfg]=1.0.0`).join('&');
    const res = await app.inject({ method: 'GET', url: `/v1/admin/configuration/rule?${pairs}` });
    expect(res.statusCode).toBe(400);
    expect(mockRuleList).not.toHaveBeenCalled();
  });

  it('does not expose the (id, cfg) set on network_map - the param is stripped, not forwarded (#423 scope)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/configuration/network_map?keys[0][id]=x&keys[0][cfg]=1.0.0',
    });
    expect(res.statusCode).toBe(200);
    const forwarded = mockNetworkMapList.mock.calls[0][0] as { keys?: unknown };
    expect(forwarded).not.toHaveProperty('keys');
  });
});
