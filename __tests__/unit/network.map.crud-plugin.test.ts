// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces';

// Regression test for the response-schema serialisation path used by
// /v1/admin/configuration/network_map. The NetworkMapRepo is wired into the
// same buildCrudPlugin helper that surfaced the cases-shape mismatch in
// issue #411, so we apply the same end-to-end approach: register the plugin
// against a mock repo and assert a real library-shaped NetworkMap round trips
// through GET /v1/admin/configuration/network_map without triggering
// fast-json-stringify's "does not match schema definition" error.

const mockList = jest.fn();

jest.mock('../../src', () => ({
  configuration: { AUTHENTICATED: false },
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../src/repositories/configuration/network.map.repository', () => ({
  NetworkMapRepo: {
    list: (...args: unknown[]) => mockList(...args),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

import { buildCrudPlugin } from '../../src/utils/crud-schema';
import { NetworkMapRepo } from '../../src/repositories/configuration/network.map.repository';
import { NetworkMapSchema } from '../../src/schemas/networkMapSchema';

describe('GET /v1/admin/configuration/network_map response schema', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    const ajv = new Ajv({
      removeAdditional: 'all',
      useDefaults: true,
      coerceTypes: 'array',
      strictTuples: false,
    });
    addFormats(ajv);
    app.setValidatorCompiler(({ schema }) => ajv.compile(schema));

    await app.register(
      buildCrudPlugin({
        prefix: '/v1/admin/configuration/network_map',
        repo: NetworkMapRepo,
        schemas: { Entity: NetworkMapSchema, Create: NetworkMapSchema, Update: NetworkMapSchema },
        idParam: { kind: 'cfg' },
      }),
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serialises a network map matching the NetworkMap library shape', async () => {
    const networkMap: NetworkMap = {
      active: true,
      cfg: '1.0.0',
      tenantId: 'DEFAULT',
      creDtTm: '2026-01-01T00:00:00.000Z',
      updDtTm: '2026-01-02T00:00:00.000Z',
      messages: [
        {
          id: 'msg-001',
          cfg: '1.0.0',
          txTp: 'pacs.008.001.10',
          typologies: [
            {
              id: 'typology-001',
              cfg: '1.0.0',
              rules: [
                { id: 'rule-001', cfg: '1.0.0' },
                { id: 'rule-002', cfg: '1.0.0' },
              ],
            },
            {
              id: 'typology-002',
              cfg: '1.0.0',
              rules: [{ id: 'rule-003', cfg: '1.0.0' }],
            },
          ],
        },
        {
          id: 'msg-002',
          cfg: '1.0.0',
          txTp: 'pain.001.001.11',
          typologies: [
            {
              id: 'typology-003',
              cfg: '1.0.0',
              rules: [{ id: 'rule-004', cfg: '1.0.0' }],
            },
          ],
        },
      ],
    };

    mockList.mockResolvedValue({ data: [networkMap], total: 1 });

    const response = await app.inject({ method: 'GET', url: '/v1/admin/configuration/network_map' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: NetworkMap[]; meta: { total: number; limit: number; offset: number } };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].active).toBe(true);
    expect(body.data[0].cfg).toBe('1.0.0');
    expect(body.data[0].messages).toEqual(networkMap.messages);
    expect(body.meta).toEqual({ total: 1, limit: 20, offset: 0 });
  });

  it('serialises a network map with an empty messages array', async () => {
    const emptyNetworkMap: NetworkMap = {
      active: false,
      cfg: '0.0.1',
      tenantId: 'DEFAULT',
      messages: [],
    };

    mockList.mockResolvedValue({ data: [emptyNetworkMap], total: 1 });

    const response = await app.inject({ method: 'GET', url: '/v1/admin/configuration/network_map' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: NetworkMap[] };
    expect(body.data[0].messages).toEqual([]);
    expect(body.data[0].active).toBe(false);
  });
});
