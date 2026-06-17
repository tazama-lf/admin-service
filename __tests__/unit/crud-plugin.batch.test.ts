// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { Type } from '@sinclair/typebox';

// RED tests (#436): buildCrudPlugin must allow batch (array) submission on the
// generic POST route for the `rule` and `typology` configuration entities.
//
// Locked design (post-grill arbitration):
//  - C1 atomicity: the batch is inserted inside ONE transaction. The transaction
//    runner is INJECTED per call site via a new `batch.runInTransaction` option
//    (mirrors withConfigurationTransaction's signature). The pinned client is
//    threaded into every repo.create(payload, tenantId, client) call, so a
//    mid-batch failure rolls the whole batch back (all-or-nothing).
//  - C2 wiring/scope: batch is a per-entity OPT-IN. It is NOT hard-wired into the
//    generic factory, and only rule + typology enable it.
//  - C3 network_map EXCLUDED from batch: its POST stays single-object only, so an
//    array body must still be rejected with 400.
//  - C4 validation: a malformed item in an array yields a 400 whose message
//    identifies the offending index (item[i]).
//  - Defaults: 201 for both shapes; response mirrors the request shape
//    (object-in -> bare entity, array-in -> array, even length 1); maxItems cap.

const mockRuleCreate = jest.fn();
const mockTypologyCreate = jest.fn();
const mockNetworkMapCreate = jest.fn();

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
    create: (...args: unknown[]) => mockRuleCreate(...args),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock('../../src/repositories/configuration/typology.config.repository', () => ({
  TypologyConfigRepo: {
    list: jest.fn(),
    get: jest.fn(),
    create: (...args: unknown[]) => mockTypologyCreate(...args),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock('../../src/repositories/configuration/network.map.repository', () => ({
  NetworkMapRepo: {
    list: jest.fn(),
    get: jest.fn(),
    create: (...args: unknown[]) => mockNetworkMapCreate(...args),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

import { buildCrudPlugin } from '../../src/utils/crud-schema';
import { RuleConfigRepo } from '../../src/repositories/configuration/rule.config.repository';
import { TypologyConfigRepo } from '../../src/repositories/configuration/typology.config.repository';
import { NetworkMapRepo } from '../../src/repositories/configuration/network.map.repository';
import { RuleSchema } from '../../src/schemas/ruleSchema';
import { TypologySchema } from '../../src/schemas/typologySchema';
import { NetworkMapSchema } from '../../src/schemas/networkMapSchema';

// --- The new `batch` option does not exist on BuildCrudOptions yet. This shim lets
//     the file compile so the RED state is an assertion failure (array POST returns
//     400 today instead of 201), not a type error. ---
type BatchOption = {
  runInTransaction: <T>(work: (client: unknown) => Promise<T>) => Promise<T>;
  maxItems?: number;
};
type CrudOptions = Parameters<typeof buildCrudPlugin>[0];
const registerCrud = (opts: CrudOptions & { batch?: BatchOption }): ReturnType<typeof buildCrudPlugin> =>
  buildCrudPlugin(opts as CrudOptions);

// A faithful stand-in for withConfigurationTransaction: BEGIN, run the work on a
// pinned client, COMMIT on success / ROLLBACK on throw. We record the lifecycle so
// the rollback test can prove all-or-nothing without a real database.
interface TxRecorder {
  begin: number;
  commit: number;
  rollback: number;
  readonly client: { readonly __pinned: true };
}
const makeTxRecorder = (): { recorder: TxRecorder; runInTransaction: BatchOption['runInTransaction'] } => {
  const recorder: TxRecorder = { begin: 0, commit: 0, rollback: 0, client: { __pinned: true } };
  const runInTransaction: BatchOption['runInTransaction'] = async (work) => {
    recorder.begin += 1;
    try {
      const result = await work(recorder.client);
      recorder.commit += 1;
      return result;
    } catch (error) {
      recorder.rollback += 1;
      throw error;
    }
  };
  return { recorder, runInTransaction };
};

const makeAjv = (): Ajv => {
  const ajv = new Ajv({ removeAdditional: 'all', useDefaults: true, coerceTypes: 'array', strictTuples: false });
  addFormats(ajv);
  return ajv;
};

const validRule = (id: string): Record<string, unknown> => ({ id, cfg: '1.0.0', config: {} });
const validTypology = (id: string): Record<string, unknown> => ({
  id,
  cfg: '1.0.0',
  rules: [],
  expression: [],
  workflow: { alertThreshold: 1 },
});

const BATCH_MAX = 3; // small cap for the oversize test; production default is 200

describe('POST batch (array) submission on buildCrudPlugin (#436)', () => {
  describe('rule (batch enabled)', () => {
    let app: FastifyInstance;
    let tx: TxRecorder;

    beforeAll(async () => {
      app = Fastify();
      app.setValidatorCompiler(({ schema }) => makeAjv().compile(schema));
      const { recorder, runInTransaction } = makeTxRecorder();
      tx = recorder;

      await app.register(
        registerCrud({
          prefix: '/v1/admin/configuration/rule',
          repo: RuleConfigRepo,
          schemas: { Entity: RuleSchema, Create: RuleSchema, Update: RuleSchema },
          idParam: { kind: 'single', name: 'id' },
          batch: { runInTransaction, maxItems: BATCH_MAX },
        }),
      );
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      mockRuleCreate.mockReset();
      tx.begin = 0;
      tx.commit = 0;
      tx.rollback = 0;
      // Default: echo the payload back as the created entity.
      mockRuleCreate.mockImplementation((payload: unknown) => Promise.resolve(payload));
    });

    it('single-object body still returns 201 with a bare entity and runs NO transaction (regression)', async () => {
      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/rule', payload: validRule('r1') });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(Array.isArray(body)).toBe(false);
      expect(body).toMatchObject({ id: 'r1' });
      expect(mockRuleCreate).toHaveBeenCalledTimes(1);
      // tenantId (defaulted by validateTenantMiddleware) is forwarded as the 2nd arg.
      expect(mockRuleCreate.mock.calls[0][1]).toBe('DEFAULT');
      // Single path does not open a transaction and passes no pinned client.
      expect(tx.begin).toBe(0);
      expect(mockRuleCreate.mock.calls[0][2]).toBeUndefined();
    });

    it('strips unknown fields from a single-object body before insert (AC6: no mass-assignment via the union; #436)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/configuration/rule',
        payload: { ...validRule('r1'), sneaky: 'leak', injected: 42 },
      });

      // Pre-#436 the single object was validated directly against Create, so the app-wide
      // removeAdditional:'all' stripped unknown keys. Wrapping the body in Type.Union([...]) must
      // NOT regress that (Ajv removeAdditional is documented as unreliable inside anyOf). This is a
      // mass-assignment guard: extra keys must never round-trip into the stored configuration JSONB.
      expect(response.statusCode).toBe(201);
      expect(mockRuleCreate).toHaveBeenCalledTimes(1);
      const inserted = mockRuleCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(inserted).not.toHaveProperty('sneaky');
      expect(inserted).not.toHaveProperty('injected');
      // The declared fields survive unchanged.
      expect(inserted).toMatchObject({ id: 'r1', cfg: '1.0.0' });
    });

    it('array body returns 201 with an array of created entities, inserted in one committed transaction', async () => {
      const payload = [validRule('r1'), validRule('r2')];
      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/rule', payload });

      expect(response.statusCode).toBe(201);
      const body = response.json() as Array<{ id: string }>;
      expect(Array.isArray(body)).toBe(true);
      expect(body.map((r) => r.id)).toEqual(['r1', 'r2']);

      expect(mockRuleCreate).toHaveBeenCalledTimes(2);
      // Atomic: exactly one transaction, committed once, never rolled back.
      expect(tx.begin).toBe(1);
      expect(tx.commit).toBe(1);
      expect(tx.rollback).toBe(0);
      // tenantId is forwarded for every item.
      expect(mockRuleCreate.mock.calls[0][1]).toBe('DEFAULT');
      expect(mockRuleCreate.mock.calls[1][1]).toBe('DEFAULT');
      // Every create runs on the pinned transaction client (3rd arg).
      expect(mockRuleCreate.mock.calls[0][2]).toBe(tx.client);
      expect(mockRuleCreate.mock.calls[1][2]).toBe(tx.client);
    });

    it('single-element array returns a one-element array (response mirrors request shape)', async () => {
      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/rule', payload: [validRule('r1')] });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
    });

    it('serializes each batch element identically to the single-object create (consistent schema shaping)', async () => {
      // The repository returns the persisted row with keys in a NON-schema order. The single-object
      // 201 path runs through the Entity (fast-json-stringify) serializer, which emits declared keys
      // in SCHEMA order; a raw JSON.stringify of the array would instead echo the row's insertion
      // order, so the two replies diverge for the same entity. Each batch element must be byte-for-
      // byte the same serialization the single-object route produces.
      const row = (id: string): Record<string, unknown> => ({ config: {}, cfg: '1.0.0', creDtTm: '2026-01-01T00:00:00.000Z', id });
      mockRuleCreate.mockImplementation((payload: Record<string, unknown>) => Promise.resolve(row(payload.id as string)));

      const single = await app.inject({ method: 'POST', url: '/v1/admin/configuration/rule', payload: validRule('r1') });
      const batch = await app.inject({ method: 'POST', url: '/v1/admin/configuration/rule', payload: [validRule('r1')] });

      expect(single.statusCode).toBe(201);
      expect(batch.statusCode).toBe(201);
      // A batch element is the schema-serialized object, not a raw dump of the repository row.
      expect(batch.payload).toBe(`[${single.payload}]`);
    });

    it('rolls the whole batch back when any item fails (all-or-nothing)', async () => {
      mockRuleCreate
        .mockImplementationOnce((payload: unknown) => Promise.resolve(payload))
        .mockImplementationOnce(() => Promise.reject(new Error('insert failed for item 2')));

      const payload = [validRule('r1'), validRule('r2')];
      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/rule', payload });

      // Not a success: the batch must not partially persist.
      expect(response.statusCode).toBeGreaterThanOrEqual(500);
      // The single transaction was rolled back and never committed.
      expect(tx.begin).toBe(1);
      expect(tx.commit).toBe(0);
      expect(tx.rollback).toBe(1);
    });

    it('rejects an empty array with 400 and never opens a transaction', async () => {
      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/rule', payload: [] });

      expect(response.statusCode).toBe(400);
      expect(tx.begin).toBe(0);
      expect(mockRuleCreate).not.toHaveBeenCalled();
    });

    it('rejects an array larger than maxItems with 400', async () => {
      const payload = Array.from({ length: BATCH_MAX + 1 }, (_, i) => validRule(`r${i}`));
      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/rule', payload });

      expect(response.statusCode).toBe(400);
      expect(tx.begin).toBe(0);
      expect(mockRuleCreate).not.toHaveBeenCalled();
    });

    it('rejects a malformed item with a 400 that identifies the offending index', async () => {
      // index 1 is missing the required `config` and `id` fields.
      const payload = [validRule('r0'), { cfg: '1.0.0' }];
      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/rule', payload });

      expect(response.statusCode).toBe(400);
      const { message } = response.json() as { message: string };
      // The error must point at item index 1 specifically (item[1]), not a generic
      // "anyOf"/"body must be object" failure. Pinning the index to the `item` token
      // avoids a coincidental match on the "1" in a version string like "1.0.0".
      expect(message).toMatch(/item\s*\[\s*1\s*\]/i);
      // Validation happens up-front: a malformed batch must not open a transaction
      // or call create at all (no partial insert + rollback).
      expect(tx.begin).toBe(0);
      expect(mockRuleCreate).not.toHaveBeenCalled();
    });
  });

  describe('typology (batch enabled)', () => {
    let app: FastifyInstance;
    let tx: TxRecorder;

    beforeAll(async () => {
      app = Fastify();
      app.setValidatorCompiler(({ schema }) => makeAjv().compile(schema));
      const { recorder, runInTransaction } = makeTxRecorder();
      tx = recorder;

      await app.register(
        registerCrud({
          prefix: '/v1/admin/configuration/typology',
          repo: TypologyConfigRepo,
          schemas: { Entity: TypologySchema, Create: TypologySchema, Update: TypologySchema },
          idParam: { kind: 'single', name: 'id' },
          batch: { runInTransaction, maxItems: BATCH_MAX },
        }),
      );
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      mockTypologyCreate.mockReset();
      tx.begin = 0;
      tx.commit = 0;
      tx.rollback = 0;
      mockTypologyCreate.mockImplementation((payload: unknown) => Promise.resolve(payload));
    });

    it('array body returns 201 with all created typologies in one committed transaction', async () => {
      const payload = [validTypology('t1'), validTypology('t2')];
      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/typology', payload });

      expect(response.statusCode).toBe(201);
      const body = response.json() as Array<{ id: string }>;
      expect(body.map((t) => t.id)).toEqual(['t1', 't2']);
      expect(mockTypologyCreate).toHaveBeenCalledTimes(2);
      expect(tx.begin).toBe(1);
      expect(tx.commit).toBe(1);
    });
  });

  describe('network_map (batch NOT enabled - deliberate exclusion)', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify();
      app.setValidatorCompiler(({ schema }) => makeAjv().compile(schema));

      await app.register(
        registerCrud({
          prefix: '/v1/admin/configuration/network_map',
          repo: NetworkMapRepo,
          schemas: { Entity: NetworkMapSchema, Create: NetworkMapSchema, Update: NetworkMapSchema },
          idParam: { kind: 'cfg' },
          // no batch option -> single-object only
        }),
      );
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      mockNetworkMapCreate.mockReset();
      mockNetworkMapCreate.mockImplementation((payload: unknown) => Promise.resolve(payload));
    });

    it('still accepts a single-object body (201, unchanged)', async () => {
      const payload = { cfg: '1.0.0', tenantId: 'DEFAULT', active: false, messages: [] };
      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map', payload });

      expect(response.statusCode).toBe(201);
      expect(Array.isArray(response.json())).toBe(false);
    });

    it('rejects an array body with 400 (batch is out of scope for network_map)', async () => {
      const payload = [
        { cfg: '1.0.0', tenantId: 'DEFAULT', active: false, messages: [] },
        { cfg: '2.0.0', tenantId: 'DEFAULT', active: false, messages: [] },
      ];
      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map', payload });

      expect(response.statusCode).toBe(400);
      expect(mockNetworkMapCreate).not.toHaveBeenCalled();
    });
  });

  // Response serialization on batch-enabled routes (CodeRabbit, PR #437): the single-object 201 must
  // keep its strict Entity serializer (and OpenAPI 201), while ONLY the array reply bypasses it. A
  // Union([Entity, Array(Entity)]) serializer breaks fast-json-stringify on recursive schemas, so the
  // array path overrides reply.serializer to emit raw JSON. These tests use a deliberately strict
  // Entity (no additionalProperties) so fast-json-stringify drops anything outside the schema - the
  // observable signal that the schema serializer ran on the single-object reply but not the array.
  describe('response serialization on batch routes (#436, PR #437)', () => {
    let app: FastifyInstance;
    const StrictEntity = Type.Object({ id: Type.String(), cfg: Type.String() });

    beforeAll(async () => {
      app = Fastify();
      app.setValidatorCompiler(({ schema }) => makeAjv().compile(schema));
      const { runInTransaction } = makeTxRecorder();

      await app.register(
        registerCrud({
          prefix: '/v1/admin/configuration/rule',
          repo: RuleConfigRepo,
          // Entity (response) is strict; Create (request) stays the real RuleSchema.
          schemas: { Entity: StrictEntity, Create: RuleSchema, Update: RuleSchema },
          idParam: { kind: 'single', name: 'id' },
          batch: { runInTransaction, maxItems: BATCH_MAX },
        }),
      );
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      mockRuleCreate.mockReset();
      // The repo returns a field that is NOT in the strict Entity response schema.
      mockRuleCreate.mockImplementation((payload: Record<string, unknown>) =>
        Promise.resolve({ id: payload.id, cfg: payload.cfg, serverOnly: 'secret' }),
      );
    });

    it('serializes the single-object 201 against Entity, dropping fields outside the schema', async () => {
      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/rule', payload: validRule('r1') });

      expect(response.statusCode).toBe(201);
      const body = response.json() as Record<string, unknown>;
      // The Entity serializer ran: only the declared id/cfg survive; serverOnly is dropped.
      expect(body).toEqual({ id: 'r1', cfg: '1.0.0' });
      expect(body).not.toHaveProperty('serverOnly');
    });

    it('serializes each array element through the Entity serializer too (consistent with the single-object reply)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/configuration/rule',
        payload: [validRule('r1'), validRule('r2')],
      });

      expect(response.statusCode).toBe(201);
      const body = response.json() as Array<Record<string, unknown>>;
      // Each element runs through the SAME Entity serializer as the single-object path: the reply
      // stays an array of length 2, and off-schema fields (serverOnly) are dropped from every
      // element - the array reply is shaped consistently with a single create, not a raw row dump.
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0]).toEqual({ id: 'r1', cfg: '1.0.0' });
      expect(body[1]).toEqual({ id: 'r2', cfg: '1.0.0' });
      expect(body[0]).not.toHaveProperty('serverOnly');
    });
  });
});
