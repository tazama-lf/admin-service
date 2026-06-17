// SPDX-License-Identifier: Apache-2.0
import { Type, type Static, type TObject, type TSchema } from '@sinclair/typebox';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { FastifyInstance, FastifyPluginAsync, RawServerDefault } from 'fastify';
import fp from 'fastify-plugin';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PoolClient } from 'pg';
import { configuration, loggerService } from '..';
import { tokenHandler } from '../auth/authHandler';
import type { AllowedId, CrudRepository, ListQuery } from '../repositories/repository.base';
import { validateTenantMiddleware } from '../middleware/tenantMiddleware';
import type { ITenantRequest } from '../interface/ITenantRequest';
import { publishNetworkMapActivated } from '../services/serviceChannel';

export interface CrudSchemas {
  Entity: TSchema;
  Create: TSchema;
  Update: TSchema;
  Id?: TSchema;
  Query?: TObject;
}

// Opt-in atomic batch (array) submission for the POST route (#436). Supplied only by the
// configuration entities that want it (rule, typology); when absent the POST route accepts a
// single object exactly as before. `runInTransaction` is injected per call site (so the generic
// factory never hard-codes a pool-specific helper) and pins one client for the whole batch.
export interface BatchCreateOptions {
  runInTransaction: <T>(work: (client: PoolClient) => Promise<T>) => Promise<T>;
  maxItems?: number;
}

// Default upper bound on a single batch, matching the existing list `keys` batch-fetch cap (#423):
// bounds the transaction size and the request payload.
const DEFAULT_BATCH_MAX_ITEMS = 200;

type IdParamConfig = { kind: 'single'; name?: string } | { kind: 'cfg' } | { kind: 'composite'; names: readonly [string, string] };

interface BuildCrudOptions<TEntity, TId extends AllowedId> {
  prefix: string;
  repo: CrudRepository<TEntity, TId>;
  schemas: CrudSchemas;
  idParam?: IdParamConfig;
  batch?: BatchCreateOptions;
}

const DefaultQuery = Type.Object({
  limit: Type.Optional(Type.Union([Type.Integer({ minimum: 1, maximum: 100 }), Type.Literal('all')])),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  sort: Type.Optional(Type.String()),
  order: Type.Optional(Type.Union([Type.Literal('ASC'), Type.Literal('DESC')])),
  filters: Type.Optional(Type.Record(Type.String(), Type.String())),
});

// Shared error body for every CRUD route, so the documented 400/404 shapes stay consistent in one
// place and surface a description in the generated OpenAPI spec.
const ErrorResponse = Type.Object(
  { message: Type.String({ description: 'Human-readable description of why the request failed.' }) },
  { description: 'Standard error response returned for validation (400) and not-found (404) errors.' },
);

const makeIdSchema = (
  cfg?: { kind: 'single'; name?: string } | { kind: 'cfg' } | { kind: 'composite'; names: readonly [string, string] },
): TObject => {
  const props: Record<string, TSchema> = { cfg: Type.String() };
  if (cfg?.kind === 'composite') {
    const [firstParamKey, secondParamKey] = cfg.names;
    props[firstParamKey] = Type.String();
    props[secondParamKey] = Type.String();
  } else if (cfg?.kind !== 'cfg') {
    const name = cfg?.kind === 'single' ? (cfg.name ?? 'id') : 'id';
    props[name] = Type.String();
  }
  return Type.Object(props);
};

export const buildCrudPlugin = <TEntity, TId extends AllowedId = { id: string; cfg: string; tenantId: string }>(
  opts: BuildCrudOptions<TEntity, TId>,
): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = async (app: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse>) => {
    const { prefix, repo, schemas, idParam, batch } = opts;
    const { Entity, Create, Update } = schemas;
    const batchMaxItems = batch?.maxItems ?? DEFAULT_BATCH_MAX_ITEMS;

    // When batch submission is enabled the POST body accepts BOTH a single object and an array.
    // The array branch's items use an unconstrained schema (Type.Unknown) so the app-wide
    // `removeAdditional: 'all'` does NOT strip their fields and malformed ITEMS reach the handler,
    // where per-item validation reports the offending index (item[i]); the union's single-object
    // branch still enforces the full Create schema, preserving today's single-object behaviour.
    const BatchItem = Type.Unknown({ description: 'A configuration object following the entity Create schema.' });
    const CreateBody = batch
      ? Type.Union([Create, Type.Array(BatchItem, { minItems: 1, maxItems: batchMaxItems })], {
          description:
            'A single configuration object, or a non-empty array (atomic batch insert) of configuration objects following the same schema.',
        })
      : Create;
    // Response serialization: the single-object 201 always keeps the strict Entity schema (and its
    // OpenAPI 201), on batch routes too. Only the batch ARRAY reply skips the schema serializer (see
    // the POST handler), because a Union([Entity, Array(Entity)]) breaks fast-json-stringify when
    // Entity is recursive (e.g. TypologySchema.expression). The accepted request shapes remain fully
    // documented via CreateBody (the #436 OpenAPI acceptance criterion).
    const CreateResponseSchema = batch ? { 201: Entity, 400: ErrorResponse } : { 201: Entity };

    // Batch runtime: the transaction runner and a standalone per-item validator are bundled together
    // so they share a single existence fact (`batch` enabled <=> both present). This lets the handler
    // narrow once and treat `validateItem` as non-optional, guaranteeing validation is never skipped.
    // The validator mirrors the app-wide Ajv config (see src/clients/fastify.ts) and is compiled from
    // the full Create schema so it can surface an item[i] message for the offending array element.
    const batchRuntime = batch
      ? (() => {
          const itemAjv = new Ajv({ removeAdditional: 'all', useDefaults: true, coerceTypes: 'array', strictTuples: false });
          addFormats(itemAjv);
          return { runInTransaction: batch.runInTransaction, validateItem: itemAjv.compile(Create) };
        })()
      : undefined;

    // --- Build path and param schema based on idParam ---
    const singleName: string = idParam?.kind === 'single' ? (idParam.name ?? 'id') : 'id';
    const idPath =
      idParam?.kind === 'composite'
        ? `/:${idParam.names[0]}/:${idParam.names[1]}/:cfg`
        : idParam?.kind === 'cfg'
          ? '/:cfg'
          : `/:${singleName}/:cfg`;

    const IdParam = schemas.Id ?? makeIdSchema(idParam);
    const makeRepositoryId = (params: Record<string, string>, tenantId: string): TId => {
      const id =
        idParam?.kind === 'composite'
          ? { [idParam.names[0]]: params[idParam.names[0]], [idParam.names[1]]: params[idParam.names[1]], cfg: params.cfg, tenantId }
          : idParam?.kind === 'cfg'
            ? { cfg: params.cfg, tenantId }
            : { id: params[singleName], cfg: params.cfg, tenantId };
      return id as unknown as TId;
    };

    const QuerySchema = schemas.Query ?? DefaultQuery;

    const ListResponse = Type.Object({
      data: Type.Array(Entity),
      meta: Type.Object({
        total: Type.Integer({
          description: 'Total number of rows matching the query (a real COUNT(*), not the size of the returned page).',
        }),
        limit: Type.Integer({ description: 'Page size applied to this response. Equals total on the limit=all path.' }),
        offset: Type.Integer({ description: 'Row offset applied to this response. Always 0 on the limit=all path.' }),
      }),
    });
    // --- LIST --- AUTH:EXAMPLE(LIST_V1_ADMIN_RAW_HISTORY_PACS002)
    app.get(
      prefix,
      {
        schema: {
          tags: [prefix],
          querystring: QuerySchema,
          response: { 200: ListResponse, 400: ErrorResponse },
        },
        preHandler: configuration.AUTHENTICATED
          ? [validateTenantMiddleware, tokenHandler(`LIST${prefix.replaceAll('/', '_').toUpperCase()}`)]
          : [validateTenantMiddleware],
      },
      async (req, reply) => {
        // The batch-fetch set (#423) is validated/bounded only by the per-entity Query schema
        // (rule + typology, maxItems 200); entities without it have `keys` stripped by Ajv. It is
        // typed here so the handler can forward it without widening the generic fallback schema.
        const queryParams = req.query as Static<typeof DefaultQuery> & { keys?: Array<{ id: string; cfg: string }> };
        const { tenantId } = req as ITenantRequest;
        const { limit = 20, offset = 0, sort, order = 'ASC', filters, keys } = queryParams;

        // `limit=all` and a non-zero `offset` are mutually exclusive: an unbounded fetch has no
        // page to skip into, so combining them is a client error rather than a silent no-op (#422).
        if (limit === 'all' && offset !== 0) {
          return await reply.code(400).send({ message: 'offset cannot be combined with limit=all' });
        }

        type SortField = Extract<keyof TEntity, string>;

        const params: ListQuery<SortField> = {
          limit,
          tenantId,
          offset,
          sort: sort as SortField | undefined,
          order,
          filters,
          // Only forward the batch-fetch set when the per-entity schema kept it; entities out of
          // scope (e.g. network_map) have `keys` stripped to undefined and must not receive it.
          ...(keys ? { keys } : {}),
        };

        const { data, total } = await repo.list(params);
        // For the unbounded path report the truthful window: the whole set was returned from offset 0.
        const meta = limit === 'all' ? { total, limit: total, offset: 0 } : { total, limit, offset };
        return await reply.send({ data, meta });
      },
    );

    // --- GET --- AUTH:EXAMPLE(GET_V1_ADMIN_RAW_HISTORY_PACS002)
    app.get(
      `${prefix}${idPath}`,
      {
        schema: {
          tags: [prefix],
          params: IdParam,
          response: { 200: Entity, 404: ErrorResponse },
        },
        preHandler: configuration.AUTHENTICATED
          ? [validateTenantMiddleware, tokenHandler(`GET${prefix.replaceAll('/', '_').toUpperCase()}`)]
          : [validateTenantMiddleware],
      },
      async (req, reply) => {
        const p = req.params as Record<string, string>;
        const { tenantId } = req as ITenantRequest;

        const entity = await repo.get(makeRepositoryId(p, tenantId));
        if (!entity) return await reply.code(404).send({ message: 'Not found' });
        return entity;
      },
    );

    // --- CREATE --- AUTH:EXAMPLE(POST_V1_ADMIN_RAW_HISTORY_PACS002)
    app.post(
      prefix,
      {
        schema: {
          tags: [prefix],
          body: CreateBody,
          response: CreateResponseSchema,
        },
        preHandler: configuration.AUTHENTICATED
          ? [validateTenantMiddleware, tokenHandler(`POST${prefix.replaceAll('/', '_').toUpperCase()}`)]
          : [validateTenantMiddleware],
      },
      async (req, reply) => {
        const { tenantId } = req as ITenantRequest;

        // Batch path: an array body is inserted all-or-nothing inside one injected transaction,
        // with the pinned client threaded into every create so the rows share one BEGIN/COMMIT.
        if (batchRuntime && Array.isArray(req.body)) {
          const items = req.body as TEntity[];

          // Validate each item up-front (before opening a transaction) so a malformed batch never
          // partially inserts and the client gets an error that names the offending index.
          for (let i = 0; i < items.length; i++) {
            if (!batchRuntime.validateItem(items[i])) {
              const firstError = batchRuntime.validateItem.errors?.[0];
              const detail = firstError ? `${firstError.instancePath || '/'} ${firstError.message}`.trim() : 'invalid item';
              return await reply.code(400).send({ message: `item[${i}]: ${detail}` });
            }
          }

          const created = await batchRuntime.runInTransaction(async (client) => {
            const results: TEntity[] = [];
            // Inserts run serially: a single pinned PoolClient cannot execute concurrent queries.
            for (const item of items) {
              results.push(await repo.create(item, tenantId, client));
            }
            return results;
          });
          // The route's 201 schema is the single Entity (object); an array can't be serialized
          // against it directly, and a Union/Array serializer breaks on recursive schemas
          // (typology.expression). So instead of dumping the raw rows with JSON.stringify (which
          // would echo the repository's key order and any off-schema fields, diverging from the
          // single-object reply), reuse THIS route's compiled Entity serializer per element and
          // join them into a JSON array. Each element is then shaped identically to a single create.
          const serializeEntity = reply.getSerializationFunction('201');
          reply.serializer(
            serializeEntity
              ? (payload) => `[${(payload as TEntity[]).map((item) => serializeEntity(item as Record<string, unknown>)).join(',')}]`
              : (payload) => JSON.stringify(payload),
          );
          // A custom serializer returns a string, so Fastify would default the reply to text/plain;
          // set the content type explicitly so the array is advertised as JSON, like every other route.
          reply.type('application/json; charset=utf-8');
          return await reply.code(201).send(created);
        }

        const created = await repo.create(req.body as TEntity, tenantId);
        return await reply.code(201).send(created);
      },
    );

    // --- PUT --- AUTH:EXAMPLE(PUT_V1_ADMIN_RAW_HISTORY_PACS002)
    app.put(
      `${prefix}${idPath}`,
      {
        schema: {
          tags: [prefix],
          params: IdParam,
          body: Update,
          response: { 200: Entity, 404: ErrorResponse },
        },
        preHandler: configuration.AUTHENTICATED
          ? [validateTenantMiddleware, tokenHandler(`PUT${prefix.replaceAll('/', '_').toUpperCase()}`)]
          : [validateTenantMiddleware],
      },
      async (req, reply) => {
        const p = req.params as Record<string, string>;
        const { tenantId } = req as ITenantRequest;

        const updated = await repo.update(makeRepositoryId(p, tenantId), req.body as TEntity);
        if (!updated) return await reply.code(404).send({ message: 'Not found' });
        return updated;
      },
    );

    // --- DELETE --- AUTH:EXAMPLE(DELETE_V1_ADMIN_RAW_HISTORY_PACS002)
    app.delete(
      `${prefix}${idPath}`,
      {
        schema: {
          tags: [prefix],
          params: IdParam,
          response: {
            200: Type.Object({ success: Type.Boolean({ description: 'Always true when a row was deleted.' }) }),
            404: ErrorResponse,
          },
        },
        preHandler: configuration.AUTHENTICATED
          ? [validateTenantMiddleware, tokenHandler(`DELETE${prefix.replaceAll('/', '_').toUpperCase()}`)]
          : [validateTenantMiddleware],
      },
      async (req, reply) => {
        const p = req.params as Record<string, string>;
        const { tenantId } = req as ITenantRequest;

        const ok = await repo.remove(makeRepositoryId(p, tenantId));
        // Parity with GET/PUT: a missing row is a 404, not a 200 { success: false } (#420).
        if (!ok) return await reply.code(404).send({ message: 'Not found' });
        return { success: true };
      },
    );

    // --- ACTIVATE / DEACTIVATE --- only for entities that expose the lifecycle actions
    // (network_map). The activate swap is atomic in the repository; the route just maps a
    // null result (missing target) to 404, mirroring GET/PUT/DELETE. AUTH:EXAMPLE(POST_V1_ADMIN_CONFIGURATION_NETWORK_MAP_ACTIVATE)
    const activateFn = repo.activate;
    if (activateFn) {
      const ActivateResponse = Type.Object({
        data: Entity,
        reloadDispatched: Type.Object({
          status: Type.Boolean(),
          outcome: Type.String(),
        }),
      });

      app.post(
        `${prefix}${idPath}/activate`,
        {
          schema: {
            tags: [prefix],
            params: IdParam,
            response: { 200: ActivateResponse, 400: ErrorResponse, 404: ErrorResponse },
          },
          preHandler: configuration.AUTHENTICATED
            ? [validateTenantMiddleware, tokenHandler(`POST${prefix.replaceAll('/', '_').toUpperCase()}_ACTIVATE`)]
            : [validateTenantMiddleware],
        },
        async (req, reply) => {
          const p = req.params as Record<string, string>;
          const { tenantId } = req as ITenantRequest;
          if (req.body !== undefined && (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body))) {
            return await reply.code(400).send({ message: 'body must be a JSON object' });
          }

          const payload = (req.body ?? {}) as Record<string, unknown>;
          const { reloadMode } = payload;

          if (reloadMode !== undefined && reloadMode !== 'none' && reloadMode !== 'broadcast') {
            return await reply.code(400).send({ message: 'reloadMode must be one of: none, broadcast' });
          }

          const activated = await activateFn(makeRepositoryId(p, tenantId));
          if (!activated) return await reply.code(404).send({ message: 'Not found' });

          if (reloadMode === 'none') {
            return {
              data: activated,
              reloadDispatched: { status: false, outcome: 'suppressed' },
            };
          }

          const activationData = activated as Partial<{ cfg: string; tenantId: string }>;
          const reloadDispatched = await publishNetworkMapActivated(
            typeof activationData.cfg === 'string' ? activationData.cfg : p.cfg,
            typeof activationData.tenantId === 'string' ? activationData.tenantId : tenantId,
          );

          if (!reloadDispatched.status) {
            loggerService.warn(`Network-map reload dispatch degraded: ${reloadDispatched.outcome}`);
          }

          return {
            data: activated,
            reloadDispatched,
          };
        },
      );
    }

    const deactivateFn = repo.deactivate;
    if (deactivateFn) {
      app.post(
        `${prefix}${idPath}/deactivate`,
        {
          schema: {
            tags: [prefix],
            params: IdParam,
            response: { 200: Entity, 404: ErrorResponse },
          },
          preHandler: configuration.AUTHENTICATED
            ? [validateTenantMiddleware, tokenHandler(`POST${prefix.replaceAll('/', '_').toUpperCase()}_DEACTIVATE`)]
            : [validateTenantMiddleware],
        },
        async (req, reply) => {
          const p = req.params as Record<string, string>;
          const { tenantId } = req as ITenantRequest;

          const deactivated = await deactivateFn(makeRepositoryId(p, tenantId));
          if (!deactivated) return await reply.code(404).send({ message: 'Not found' });
          return deactivated;
        },
      );
    }

    await Promise.resolve(true);
  };

  return fp(plugin, { name: `crud:${opts.prefix}` });
};
