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
  Query?: typeof DefaultQuery;
}

type IdParamConfig = { kind: 'single'; name?: string } | { kind: 'composite'; names: readonly [string, string] };

interface BuildCrudOptions<TEntity, TId extends AllowedId> {
  prefix: string;
  repo: CrudRepository<TEntity, TId>;
  schemas: CrudSchemas;
  idParam?: IdParamConfig;
}

const DefaultQuery = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  tenantId: Type.Optional(Type.String({ default: 'DEFAULT' })),
  sort: Type.Optional(Type.String()),
  order: Type.Optional(Type.Union([Type.Literal('ASC'), Type.Literal('DESC')])),
  filters: Type.Optional(Type.Record(Type.String(), Type.String())),
});

const makeIdSchema = (
  cfg?: { kind: 'single'; name?: string } | { kind: 'composite'; names: readonly [string, string] },
): TObject<Record<string, TSchema>> => {
  const props: Record<string, TSchema> = { cfg: Type.String() };
  if (cfg?.kind === 'composite') {
    const [firstParamKey, secondParamKey] = cfg.names;
    props[firstParamKey] = Type.String();
    props[secondParamKey] = Type.String();
  } else {
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
    const idPath = idParam?.kind === 'composite' ? `/:${idParam.names[0]}/:${idParam.names[1]}/:cfg` : `/:${singleName}/:cfg`;

    const IdParam = schemas.Id ?? makeIdSchema(idParam);

    const QuerySchema = schemas.Query ?? DefaultQuery;

    const ListResponse = Type.Object({
      data: Type.Array(Entity),
      meta: Type.Object({
        total: Type.Integer(),
        limit: Type.Integer(),
        offset: Type.Integer(),
      }),
    });
    // --- LIST --- AUTH:EXAMPLE(LIST_V1_ADMIN_RAW_HISTORY_PACS002)
    app.get(
      prefix,
      {
        schema: {
          tags: [prefix],
          querystring: QuerySchema,
          response: { 200: ListResponse },
        },
        preHandler: configuration.AUTHENTICATED
          ? [validateTenantMiddleware, tokenHandler(`LIST${prefix.replaceAll('/', '_').toUpperCase()}`)]
          : [validateTenantMiddleware],
      },
      async (req, reply) => {
        const queryParams = req.query as Static<typeof QuerySchema>;
        const { tenantId: authTenantId } = req as ITenantRequest;
        const { limit = 20, tenantId = authTenantId, offset = 0, sort, order = 'ASC', filters } = queryParams;

        type SortField = Extract<keyof TEntity, string>;

        const params: ListQuery<SortField> = {
          limit,
          tenantId,
          offset,
          sort: sort as SortField | undefined,
          order,
          filters,
        };

        const { data, total } = await repo.list(params);
        return await reply.send({ data, meta: { total, limit, offset } });
      },
    );

    // --- GET --- AUTH:EXAMPLE(GET_V1_ADMIN_RAW_HISTORY_PACS002)
    app.get(
      `${prefix}${idPath}`,
      {
        schema: {
          tags: [prefix],
          params: IdParam,
          response: { 200: Entity, 404: Type.Object({ message: Type.String() }) },
        },
        preHandler: configuration.AUTHENTICATED
          ? [validateTenantMiddleware, tokenHandler(`GET${prefix.replaceAll('/', '_').toUpperCase()}`)]
          : [validateTenantMiddleware],
      },
      async (req, reply) => {
        const p = req.params as Record<string, string>;
        const { tenantId } = req as ITenantRequest;

        const id =
          idParam?.kind === 'composite'
            ? { [idParam.names[0]]: p[idParam.names[0]], [idParam.names[1]]: p[idParam.names[1]], cfg: p.cfg, tenantId }
            : { id: p[singleName], cfg: p.cfg, tenantId };

        const entity = await repo.get(id as TId);
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
          response: { 200: Entity, 404: Type.Object({ message: Type.String() }) },
        },
        preHandler: configuration.AUTHENTICATED
          ? [validateTenantMiddleware, tokenHandler(`PUT${prefix.replaceAll('/', '_').toUpperCase()}`)]
          : [validateTenantMiddleware],
      },
      async (req, reply) => {
        const p = req.params as Record<string, string>;
        const { tenantId } = req as ITenantRequest;
        const id =
          idParam?.kind === 'composite'
            ? { [idParam.names[0]]: p[idParam.names[0]], [idParam.names[1]]: p[idParam.names[1]], cfg: p.cfg, tenantId }
            : { id: p[singleName], cfg: p.cfg, tenantId };

        const updated = await repo.update(id as TId, req.body as TEntity);
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
          response: { 200: Type.Object({ success: Type.Boolean() }) },
        },
        preHandler: configuration.AUTHENTICATED
          ? [validateTenantMiddleware, tokenHandler(`DELETE${prefix.replaceAll('/', '_').toUpperCase()}`)]
          : [validateTenantMiddleware],
      },
      async (req, reply) => {
        const p = req.params as Record<string, string>;
        const { tenantId } = req as ITenantRequest;
        const id =
          idParam?.kind === 'composite'
            ? { [idParam.names[0]]: p[idParam.names[0]], [idParam.names[1]]: p[idParam.names[1]], cfg: p.cfg, tenantId }
            : { id: p[singleName], cfg: p.cfg, tenantId };

        const ok = await repo.remove(id as TId);
        return { success: ok };
      },
    );

    await Promise.resolve(true);
  };

  return fp(plugin, { name: `crud:${opts.prefix}` });
};
