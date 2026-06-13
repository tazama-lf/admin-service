// SPDX-License-Identifier: Apache-2.0
import { Type, type Static, type TObject, type TSchema } from '@sinclair/typebox';
import type { FastifyInstance, FastifyPluginAsync, RawServerDefault } from 'fastify';
import fp from 'fastify-plugin';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { configuration } from '..';
import { tokenHandler } from '../auth/authHandler';
import type { AllowedId, CrudRepository, ListQuery } from '../repositories/repository.base';
import { validateTenantMiddleware } from '../middleware/tenantMiddleware';
import type { ITenantRequest } from '../interface/ITenantRequest';

export interface CrudSchemas {
  Entity: TSchema;
  Create: TSchema;
  Update: TSchema;
  Id?: TSchema;
  Query?: TObject;
}

type IdParamConfig = { kind: 'single'; name?: string } | { kind: 'cfg' } | { kind: 'composite'; names: readonly [string, string] };

interface BuildCrudOptions<TEntity, TId extends AllowedId> {
  prefix: string;
  repo: CrudRepository<TEntity, TId>;
  schemas: CrudSchemas;
  idParam?: IdParamConfig;
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
    const { prefix, repo, schemas, idParam } = opts;
    const { Entity, Create, Update } = schemas;

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
          body: Create,
          response: { 201: Entity },
        },
        preHandler: configuration.AUTHENTICATED
          ? [validateTenantMiddleware, tokenHandler(`POST${prefix.replaceAll('/', '_').toUpperCase()}`)]
          : [validateTenantMiddleware],
      },
      async (req, reply) => {
        const { tenantId } = req as ITenantRequest;
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
      app.post(
        `${prefix}${idPath}/activate`,
        {
          schema: {
            tags: [prefix],
            params: IdParam,
            response: { 200: Entity, 404: ErrorResponse },
          },
          preHandler: configuration.AUTHENTICATED
            ? [validateTenantMiddleware, tokenHandler(`POST${prefix.replaceAll('/', '_').toUpperCase()}_ACTIVATE`)]
            : [validateTenantMiddleware],
        },
        async (req, reply) => {
          const p = req.params as Record<string, string>;
          const { tenantId } = req as ITenantRequest;

          const activated = await activateFn(makeRepositoryId(p, tenantId));
          if (!activated) return await reply.code(404).send({ message: 'Not found' });
          return activated;
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
