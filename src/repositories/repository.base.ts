// SPDX-License-Identifier: Apache-2.0
import type { PoolClient } from 'pg';
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
  // `client` (optional) pins the insert to an open transaction for atomic batch creates (#436);
  // when omitted, the insert runs on its own pooled connection exactly as before.
  create: (payload: TEntity, tenantId: string, client?: PoolClient) => Promise<TEntity>;
  update: (id: TId, payload: TEntity) => Promise<TEntity | null>;
  remove: (id: TId) => Promise<boolean>;
  getNodeByName?: (nodeName: string, tenantId: string) => Promise<TEntity[] | null>;
  // Optional lifecycle actions. Only entities with a single-active invariant (network_map)
  // implement these; the CRUD factory registers the activate/deactivate routes only when present.
  activate?: (id: TId) => Promise<TEntity | null>;
  deactivate?: (id: TId) => Promise<TEntity | null>;
}
