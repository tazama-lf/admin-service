import { type Static, type TSchema, Type } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { CrudRepository, ListQuery } from '../repositories/repository.base';

export interface CrudSchemas {
  Entity: TSchema; // TypeBox schema for responses
  Create: TSchema; // TypeBox schema for POST body
  Update: TSchema; // TypeBox schema for PATCH body
  Id?: string; // optional TypeBox schema for ID param (defaults to string)
  Query?: typeof DefaultQuery; // optional TypeBox schema for querystring (defaults provided)
}

interface BuildCrudOptions<TEntity, TId> {
  prefix: string; // e.g. "/users"
  repo: CrudRepository<TEntity, TId>;
  schemas: CrudSchemas;
}

const DefaultQuery = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  sort: Type.Optional(Type.String()),
  order: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
  q: Type.Optional(Type.String()),
});

export const buildCrudPlugin = <TEntity, TId = string>(opts: BuildCrudOptions<TEntity, TId>): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = async (app) => {
    const {
      prefix,
      repo,
      schemas: { Entity, Create, Update, Id, Query },
    } = opts;

    const IdParam = Id ?? Type.Object({ id: Type.String() });
    const QuerySchema = Query ?? DefaultQuery;

    const ListResponse = Type.Object({
      data: Type.Array(Entity),
      meta: Type.Object({
        total: Type.Integer(),
        limit: Type.Integer(),
        offset: Type.Integer(),
      }),
    });

    app.get(
      prefix,
      {
        schema: {
          tags: [prefix],
          querystring: QuerySchema,
          response: { 200: ListResponse },
        },
      },
      async (req, reply) => {
        const q = req.query as Static<typeof QuerySchema>;
        const {
          limit = 20,
          offset = 0,
          sort,
          order = 'asc',
          q: search,
          ...rest
        } = q as { limit?: number; offset?: number; sort?: string; order?: 'asc' | 'desc'; q?: string; filters?: Record<string, string> };
        const params: ListQuery = {
          limit,
          offset,
          sort,
          order,
          q: search,
          filters: rest.filters ?? undefined,
        };
        const { data, total } = await repo.list(params);
        return await reply.send({ data, meta: { total, limit, offset } });
      },
    );

    app.get(
      `${prefix}/:id`,
      {
        schema: {
          tags: [prefix],
          params: IdParam,
          response: { 200: Entity, 404: Type.Object({ message: Type.String() }) },
        },
      },
      async (req, reply) => {
        const { id } = req.params as { id: TId };
        const entity = await repo.get(id);
        if (!entity) return await reply.code(404).send({ message: 'Not found' });
        return entity;
      },
    );

    app.post(
      prefix,
      {
        schema: {
          tags: [prefix],
          body: Create,
          response: { 201: Entity },
        },
      },
      async (req, reply) => {
        const created = await repo.create(req.body as TEntity);
        return await reply.code(201).send(created);
      },
    );

    app.put(
      `${prefix}/:id`,
      {
        schema: {
          tags: [prefix],
          params: IdParam,
          body: Update,
          response: { 200: Entity, 404: Type.Object({ message: Type.String() }) },
        },
      },
      async (req, reply) => {
        const { id } = req.params as { id: TId };
        const updated = await repo.update(id, req.body as TEntity);
        if (!updated) return await reply.code(404).send({ message: 'Not found' });
        return updated;
      },
    );

    app.delete(
      `${prefix}/:id`,
      {
        schema: {
          tags: [prefix],
          params: IdParam,
          response: { 200: Type.Object({ success: Type.Boolean() }) },
        },
      },
      async (req, reply) => {
        const { id } = req.params as { id: TId };
        const ok = await repo.remove(id);
        return { success: ok };
      },
    );
    await Promise.resolve(true);
  };

  // Return a real Fastify plugin (so we can .register it)
  return fp(plugin, { name: `crud:${opts.prefix}` });
};
