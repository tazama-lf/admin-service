// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Issue D (#420): the DELETE handler in buildCrudPlugin returns 200 { success: ok }
// unconditionally. When repo.remove reports no row was deleted (false), the client
// gets 200 { success: false } instead of a 404, which is inconsistent with GET and
// PUT (both 404 on a missing entity). These tests pin the desired parity: a missing
// row returns 404 and an existing row returns 200 { success: true }, across all three
// configuration entities that share the factory (network_map, rule, typology).

const mockRuleRemove = jest.fn();
const mockTypologyRemove = jest.fn();
const mockNetworkMapRemove = jest.fn();

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

jest.mock('../../src/repositories/configuration/rule.config.repository', () => ({
  RuleConfigRepo: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: (...args: unknown[]) => mockRuleRemove(...args),
  },
}));

jest.mock('../../src/repositories/configuration/typology.config.repository', () => ({
  TypologyConfigRepo: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: (...args: unknown[]) => mockTypologyRemove(...args),
  },
}));

jest.mock('../../src/repositories/configuration/network.map.repository', () => ({
  NetworkMapRepo: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: (...args: unknown[]) => mockNetworkMapRemove(...args),
  },
}));

import { buildCrudPlugin } from '../../src/utils/crud-schema';
import { RuleConfigRepo } from '../../src/repositories/configuration/rule.config.repository';
import { TypologyConfigRepo } from '../../src/repositories/configuration/typology.config.repository';
import { NetworkMapRepo } from '../../src/repositories/configuration/network.map.repository';
import { RuleSchema } from '../../src/schemas/ruleSchema';
import { TypologySchema } from '../../src/schemas/typologySchema';
import { NetworkMapSchema } from '../../src/schemas/networkMapSchema';

describe('DELETE /v1/admin/configuration/* returns 404 for a missing row (#420)', () => {
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
    await app.register(
      buildCrudPlugin({
        prefix: '/v1/admin/configuration/rule',
        repo: RuleConfigRepo,
        schemas: { Entity: RuleSchema, Create: RuleSchema, Update: RuleSchema },
        idParam: { kind: 'single', name: 'id' },
      }),
    );
    await app.register(
      buildCrudPlugin({
        prefix: '/v1/admin/configuration/typology',
        repo: TypologyConfigRepo,
        schemas: { Entity: TypologySchema, Create: TypologySchema, Update: TypologySchema },
        idParam: { kind: 'single', name: 'id' },
      }),
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockRuleRemove.mockReset();
    mockTypologyRemove.mockReset();
    mockNetworkMapRemove.mockReset();
  });

  describe('rule', () => {
    it('DELETE of an existing row returns 200 { success: true }', async () => {
      mockRuleRemove.mockResolvedValue(true);

      const response = await app.inject({ method: 'DELETE', url: '/v1/admin/configuration/rule/rule-001/1.0.0' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    });

    it('DELETE of a missing row returns 404, not 200 { success: false }', async () => {
      mockRuleRemove.mockResolvedValue(false);

      const response = await app.inject({ method: 'DELETE', url: '/v1/admin/configuration/rule/missing/9.9.9' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toHaveProperty('message');
    });
  });

  describe('typology', () => {
    it('DELETE of an existing row returns 200 { success: true }', async () => {
      mockTypologyRemove.mockResolvedValue(true);

      const response = await app.inject({ method: 'DELETE', url: '/v1/admin/configuration/typology/typology-001/1.0.0' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    });

    it('DELETE of a missing row returns 404, not 200 { success: false }', async () => {
      mockTypologyRemove.mockResolvedValue(false);

      const response = await app.inject({ method: 'DELETE', url: '/v1/admin/configuration/typology/missing/9.9.9' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toHaveProperty('message');
    });
  });

  describe('network_map', () => {
    it('DELETE of an existing row returns 200 { success: true }', async () => {
      mockNetworkMapRemove.mockResolvedValue(true);

      const response = await app.inject({ method: 'DELETE', url: '/v1/admin/configuration/network_map/1.0.0' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    });

    it('DELETE of a missing row returns 404, not 200 { success: false }', async () => {
      mockNetworkMapRemove.mockResolvedValue(false);

      const response = await app.inject({ method: 'DELETE', url: '/v1/admin/configuration/network_map/9.9.9' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toHaveProperty('message');
    });
  });
});
