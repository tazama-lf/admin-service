import { type Static, type TSchema, Type, type TObject } from '@sinclair/typebox';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { AllowedId, CrudRepository, ListQuery } from '../repositories/repository.base';

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
  sort: Type.Optional(Type.String()),
  order: Type.Optional(Type.Union([Type.Literal('ASC'), Type.Literal('DESC')])), // public name
  q: Type.Optional(Type.String()),
  filters: Type.Optional(Type.Record(Type.String(), Type.String())),
});

const makeIdSchema = (
  cfg?: { kind: 'single'; name?: string } | { kind: 'composite'; names: readonly [string, string] },
): TObject<Record<string, TSchema>> => {
  const props: Record<string, TSchema> = {};
  if (cfg?.kind === 'composite') {
    const [a, b] = cfg.names;
    props[a] = Type.String();
    props[b] = Type.String();
  } else {
    const name = cfg?.kind === 'single' ? (cfg.name ?? 'id') : 'id';
    props[name] = Type.String();
  }
  return Type.Object(props);
};

export const buildCrudPlugin = <TEntity, TId extends AllowedId = string>(opts: BuildCrudOptions<TEntity, TId>): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = async (app) => {
    const { prefix, repo, schemas, idParam } = opts;
    const { Entity, Create, Update } = schemas;

    // --- Build path and param schema based on idParam ---
    const singleName: string = idParam?.kind === 'single' ? (idParam.name ?? 'id') : 'id';
    const idPath = idParam?.kind === 'composite' ? `/:${idParam.names[0]}/:${idParam.names[1]}` : `/:${singleName}`;

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

    // --- LIST ---
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
        const { limit = 20, offset = 0, sort, order = 'ASC', q: search, filters } = q;

        type SortField = Extract<keyof TEntity, string>;

        const params: ListQuery<SortField> = {
          limit,
          offset,
          sort: sort as SortField | undefined,
          order,
          q: search,
          filters,
        };

        const { data, total } = await repo.list(params);
        return await reply.send({ data, meta: { total, limit, offset } });
      },
    );

    // --- GET ---
    app.get(
      `${prefix}${idPath}`,
      {
        schema: {
          tags: [prefix],
          params: IdParam,
          response: { 200: Entity, 404: Type.Object({ message: Type.String() }) },
        },
      },
      async (req, reply) => {
        const p = req.params as Record<string, string>;

        const id =
          idParam?.kind === 'composite'
            ? ({ [idParam.names[0]]: p[idParam.names[0]], [idParam.names[1]]: p[idParam.names[1]] } as unknown as TId)
            : (p[singleName] as unknown as TId);

        const entity = await repo.get(id);
        if (!entity) return await reply.code(404).send({ message: 'Not found' });
        return entity;
      },
    );

    // --- CREATE ---
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
      `${prefix}${idPath}`,
      {
        schema: {
          tags: [prefix],
          params: IdParam,
          body: Update,
          response: { 200: Entity, 404: Type.Object({ message: Type.String() }) },
        },
      },
      async (req, reply) => {
        const p = req.params as Record<string, string>;
        const id =
          idParam?.kind === 'composite'
            ? ({ [idParam.names[0]]: p[idParam.names[0]], [idParam.names[1]]: p[idParam.names[1]] } as unknown as TId)
            : (p[singleName] as unknown as TId);

        const updated = await repo.update(id, req.body as TEntity);
        if (!updated) return await reply.code(404).send({ message: 'Not found' });
        return updated;
      },
    );

    // --- DELETE ---
    app.delete(
      `${prefix}${idPath}`,
      {
        schema: {
          tags: [prefix],
          params: IdParam,
          response: { 200: Type.Object({ success: Type.Boolean() }) },
        },
      },
      async (req, reply) => {
        const p = req.params as Record<string, string>;
        const id =
          idParam?.kind === 'composite'
            ? ({ [idParam.names[0]]: p[idParam.names[0]], [idParam.names[1]]: p[idParam.names[1]] } as unknown as TId)
            : (p[singleName] as unknown as TId);

        const ok = await repo.remove(id);
        return { success: ok };
      },
    );

    await Promise.resolve(true);
  };

  return fp(plugin, { name: `crud:${opts.prefix}` });
};
