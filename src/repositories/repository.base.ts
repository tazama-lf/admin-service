// SPDX-License-Identifier: Apache-2.0
type StringKeys<T> = Extract<keyof T, string>;
export interface ListQuery<TSort extends string = string> {
  limit?: number | 'all'; // default 20; 'all' returns the full tenant-scoped set (#422)
  tenantId?: string; // tenant id is (optional) default "DEFAULT"
  offset?: number; // default 0
  sort?: TSort; // field name
  order?: 'ASC' | 'DESC';
  filters?: Record<string, string>; // exact-match filters
  keys?: Array<{ id: string; cfg: string }>; // targeted batch fetch by composite (id, cfg) set (#423)
}

export interface Node {
  id: string;
  cfg: string;
  tenantId: string;
}
export interface ConfigVersion {
  cfg: string;
  tenantId: string;
}
export interface Connector {
  source: string;
  destination: string;
  tenantId: string;
}

// Table types one with composite keys and with primary id key
export type AllowedId = Node | ConfigVersion | Connector;

export interface CrudRepository<TEntity, TId extends AllowedId = Node> {
  list: (params: ListQuery<StringKeys<TEntity>>) => Promise<{ data: TEntity[]; total: number }>;
  get: (id: TId) => Promise<TEntity | null>;
  create: (payload: TEntity, tenantId: string) => Promise<TEntity>;
  update: (id: TId, payload: TEntity) => Promise<TEntity | null>;
  remove: (id: TId) => Promise<boolean>;
  getNodeByName?: (nodeName: string, tenantId: string) => Promise<TEntity[] | null>;
}
