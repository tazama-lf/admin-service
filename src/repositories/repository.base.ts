export interface ListQuery {
  limit?: number; // default 20
  offset?: number; // default 0
  sort?: string; // field name
  order?: 'asc' | 'desc';
  q?: string; // free-text filter (optional)
  filters?: Record<string, string>; // exact-match filters
}

export type Node = string;
export interface Connector {
  source: string;
  destination: string;
}
export type AllowedId = Node | Connector;

export interface CrudRepository<TEntity, TId extends AllowedId = Node> {
  list: (params: ListQuery) => Promise<{ data: TEntity[]; total: number }>;
  get: (id: TId) => Promise<TEntity | null>;
  create: (payload: TEntity) => Promise<TEntity>;
  update: (id: TId, payload: TEntity) => Promise<TEntity | null>;
  remove: (id: TId) => Promise<boolean>;
}
