// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { fastifySwagger } from '@fastify/swagger';

// Regression test for the OpenAPI spec generation used by the Swagger UI at /documentation.
// The recursive TypologySchema.expression (Type.Recursive, mirroring the library's
// ExpressionMathJSON = Array<string | number | ExpressionMathJSON>) emits a self-$ref that
// @fastify/swagger names `def-0` but does NOT hoist into components/schemas, leaving a dangling
// pointer. Swagger UI then reports: "Could not resolve pointer: /components/schemas/def-0 does not
// exist in document" for every typology endpoint. This test builds the typology CRUD routes
// exactly as the app does (custom Ajv validator compiler + @fastify/swagger) and asserts the
// generated document has no dangling component references.

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
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

import { buildCrudPlugin } from '../../src/utils/crud-schema';
import { TypologyConfigRepo } from '../../src/repositories/configuration/typology.config.repository';
import { TypologySchema } from '../../src/schemas/typologySchema';

// Collect every `#/components/schemas/<name>` reference found anywhere in the document.
const collectComponentRefs = (node: unknown, acc: Set<string>): void => {
  if (Array.isArray(node)) {
    for (const item of node) collectComponentRefs(item, acc);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === '$ref' && typeof value === 'string') {
        const match = /^#\/components\/schemas\/(.+)$/.exec(value);
        if (match) acc.add(match[1]);
      } else {
        collectComponentRefs(value, acc);
      }
    }
  }
};

describe('typology OpenAPI spec generation', () => {
  let app: FastifyInstance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let spec: any;

  beforeAll(async () => {
    app = Fastify();
    const ajv = new Ajv({
      removeAdditional: 'all',
      useDefaults: true,
      coerceTypes: 'array',
      strictTuples: false,
    });
    addFormats(ajv);

    await app.register(fastifySwagger, {
      openapi: { info: { title: 'Tazama Admin Service API', version: '0.0.0' } },
    });

    await app.register(
      buildCrudPlugin({
        prefix: '/v1/admin/configuration/typology',
        repo: TypologyConfigRepo,
        schemas: { Entity: TypologySchema, Create: TypologySchema, Update: TypologySchema },
        idParam: { kind: 'single', name: 'id' },
      }),
    );

    app.setValidatorCompiler(({ schema }) => ajv.compile(schema));
    await app.ready();
    spec = app.swagger();
  });

  afterAll(async () => {
    await app.close();
  });

  it('produces a document whose component $refs all resolve (no dangling def-0)', () => {
    const referenced = new Set<string>();
    collectComponentRefs(spec, referenced);
    const defined = new Set(Object.keys(spec.components?.schemas ?? {}));
    const dangling = [...referenced].filter((name) => !defined.has(name));
    expect(dangling).toEqual([]);
  });

  it('represents the typology expression without an unresolved self-reference', () => {
    const referenced = new Set<string>();
    collectComponentRefs(spec, referenced);
    const defined = new Set(Object.keys(spec.components?.schemas ?? {}));
    // Every component reference the expression schema emits must point at a defined component.
    for (const name of referenced) {
      expect(defined.has(name)).toBe(true);
    }
  });
});
