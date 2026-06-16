// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { TypologyConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces/processor-files/TypologyConfig';

// Regression test for the response-schema serialisation path used by
// /v1/admin/configuration/typology. The TypologyConfigRepo is wired into the
// same buildCrudPlugin helper that surfaced the cases-shape mismatch in
// issue #411, so we apply the same end-to-end approach: register the plugin
// against a mock repo and assert a real library-shaped TypologyConfig round
// trips through GET /v1/admin/configuration/typology without triggering
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

jest.mock('../../src/repositories/configuration/typology.config.repository', () => ({
  TypologyConfigRepo: {
    list: (...args: unknown[]) => mockList(...args),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

import { buildCrudPlugin } from '../../src/utils/crud-schema';
import { TypologyConfigRepo } from '../../src/repositories/configuration/typology.config.repository';
import { TypologySchema } from '../../src/schemas/typologySchema';

describe('GET /v1/admin/configuration/typology response schema', () => {
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

  it('serialises a typology whose expression matches the ExpressionMathJSON library shape', async () => {
    const typology: TypologyConfig = {
      id: 'typology-001',
      cfg: '1.0.0',
      tenantId: 'DEFAULT',
      desc: 'typology using the real library expression shape',
      rules: [
        {
          id: 'rule-001',
          cfg: '1.0.0',
          termId: 'term-A',
          wghts: [{ ref: 'weight-ref-1', wght: 1.5 }],
        },
        {
          id: 'rule-002',
          cfg: '1.0.0',
          termId: 'term-B',
          wghts: [{ ref: 'weight-ref-2', wght: 2.25 }],
        },
      ],
      // ExpressionMathJSON = Array<string | number | ExpressionMathJSON>
      // e.g. ["+", 1, ["*", 2, 3]]
      expression: ['+', 1, ['*', 2, 3]],
      workflow: {
        alertThreshold: 200,
        interdictionThreshold: 500,
        flowProcessor: 'default-processor',
      },
    };

    mockList.mockResolvedValue({ data: [typology], total: 1 });

    const response = await app.inject({ method: 'GET', url: '/v1/admin/configuration/typology' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: TypologyConfig[]; meta: { total: number; limit: number; offset: number } };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('typology-001');
    expect(body.data[0].expression).toEqual(typology.expression);
    expect(body.data[0].rules).toEqual(typology.rules);
    expect(body.data[0].workflow).toEqual(typology.workflow);
    expect(body.meta).toEqual({ total: 1, limit: 20, offset: 0 });
  });

  it('serialises a typology whose expression is a flat string-only array', async () => {
    const typology: TypologyConfig = {
      id: 'typology-002',
      cfg: '1.0.0',
      tenantId: 'DEFAULT',
      rules: [
        {
          id: 'rule-001',
          cfg: '1.0.0',
          termId: 'term-A',
          wghts: [],
        },
      ],
      expression: ['x', 'y', 'z'],
      workflow: { alertThreshold: 100 },
    };

    mockList.mockResolvedValue({ data: [typology], total: 1 });

    const response = await app.inject({ method: 'GET', url: '/v1/admin/configuration/typology' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: TypologyConfig[] };
    expect(body.data[0].expression).toEqual(typology.expression);
  });
});
