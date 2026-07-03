// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { RuleConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces';

// Regression test for
// https://github.com/tazama-lf/admin-service/issues/411
//
// Before the fix, src/schemas/ruleSchema.ts declared
//   cases: Type.Optional(Type.Array(Case))   // Case = { subRuleRef, reason, value }
// but @tazama-lf/frms-coe-lib's RuleConfig.config.cases is a single object
//   { expressions: Expression[]; alternative: OutcomeResult }
// so fast-json-stringify (used by Fastify as the default response serializer)
// would throw
//   "The value of '#/properties/data/items/properties/config/properties/cases'
//    does not match schema definition."
// whenever a rule with a populated cases field was returned by the LIST endpoint.
// These tests assert that GET /v1/admin/configuration/rule serialises such a rule
// successfully.

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

jest.mock('../../src/repositories/configuration/rule.config.repository', () => ({
  RuleConfigRepo: {
    list: (...args: unknown[]) => mockList(...args),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

import { buildCrudPlugin } from '../../src/utils/crud-schema';
import { RuleConfigRepo } from '../../src/repositories/configuration/rule.config.repository';
import { RuleSchema } from '../../src/schemas/ruleSchema';

describe('GET /v1/admin/configuration/rule response schema', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();

    // Mirror the Ajv setup used by src/clients/fastify.ts so request-side
    // validation behaves the same way as in production.
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
        prefix: '/v1/admin/configuration/rule',
        repo: RuleConfigRepo,
        schemas: { Entity: RuleSchema, Create: RuleSchema, Update: RuleSchema },
        idParam: { kind: 'single', name: 'id' },
      }),
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serialises a rule whose config.cases matches the RuleConfig library shape', async () => {
    const ruleWithCases: RuleConfig = {
      id: 'rule-001',
      cfg: '1.0.0',
      tenantId: 'DEFAULT',
      desc: 'rule using the real library cases shape',
      config: {
        parameters: { threshold: 100 },
        exitConditions: [{ subRuleRef: 'exit-001', reason: 'threshold exceeded' }],
        bands: [{ subRuleRef: 'band-001', reason: 'low risk', lowerLimit: 0, upperLimit: 50 }],
        cases: {
          expressions: [
            { subRuleRef: 'expr-001', reason: 'matched value A', value: 'A' },
            { subRuleRef: 'expr-002', reason: 'matched value B', value: 'B' },
          ],
          alternative: { subRuleRef: 'alt-001', reason: 'no expression matched' },
        },
      },
    };

    mockList.mockResolvedValue({ data: [ruleWithCases], total: 1 });

    const response = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: RuleConfig[]; meta: { total: number; limit: number; offset: number } };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('rule-001');
    expect(body.data[0].config?.cases).toEqual(ruleWithCases.config?.cases);
    expect(body.meta).toEqual({ total: 1, limit: 20, offset: 0 });
  });

  it('serialises a rule whose config has no cases field (cases remains optional)', async () => {
    const ruleNoCases: RuleConfig = {
      id: 'rule-002',
      cfg: '1.0.0',
      tenantId: 'DEFAULT',
      config: {
        parameters: { threshold: 100 },
        exitConditions: [{ subRuleRef: 'exit-001', reason: 'threshold exceeded' }],
      },
    };

    mockList.mockResolvedValue({ data: [ruleNoCases], total: 1 });

    const response = await app.inject({ method: 'GET', url: '/v1/admin/configuration/rule' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: RuleConfig[] };
    expect(body.data[0].config?.cases).toBeUndefined();
  });
});

// Regression test for
// https://github.com/tazama-lf/admin-service/issues/467
//
// Before the fix, src/schemas/ruleSchema.ts declared
//   parameters: Type.Optional(Type.Record(Type.Optional(Type.Union([Type.String(), Type.Number()])), Type.Optional(Type.Unknown())))
// The malformed key schema made TypeBox emit a JSON Schema with no
// patternProperties/additionalProperties, so Ajv's `removeAdditional: 'all'`
// stripped every real key from config.parameters on POST/PUT, persisting an
// empty object. These tests assert that a submitted config.parameters object
// survives request validation intact and reaches the repository.
describe('POST /v1/admin/configuration/rule preserves config.parameters', () => {
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
        prefix: '/v1/admin/configuration/rule',
        repo: RuleConfigRepo,
        schemas: { Entity: RuleSchema, Create: RuleSchema, Update: RuleSchema },
        idParam: { kind: 'single', name: 'id' },
      }),
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('does not strip parameter keys from config.parameters on create', async () => {
    const createMock = RuleConfigRepo.create as jest.Mock;
    createMock.mockImplementation((payload: unknown) => Promise.resolve(payload as RuleConfig));

    const rule = {
      id: '016@1.0.0',
      cfg: '4.0.0',
      desc: 'Transaction convergence - creditor',
      config: {
        parameters: { maxQueryRange: 86400000 },
        exitConditions: [],
        bands: [
          { subRuleRef: '.01', upperLimit: 5, reason: 'No Transaction convergence detected on creditor account' },
          { subRuleRef: '.02', lowerLimit: 5, reason: 'Transaction convergence detected on creditor account' },
        ],
      },
    };

    const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/rule', payload: rule });

    expect(response.statusCode).toBe(201);

    // The payload the repository received reflects req.body AFTER Ajv validation:
    // this is where the strip used to happen.
    const received = createMock.mock.calls[0][0] as RuleConfig;
    expect(received.config?.parameters).toEqual({ maxQueryRange: 86400000 });

    // The serialised response must also retain the parameters.
    const body = response.json() as RuleConfig;
    expect(body.config?.parameters).toEqual({ maxQueryRange: 86400000 });
  });
});
