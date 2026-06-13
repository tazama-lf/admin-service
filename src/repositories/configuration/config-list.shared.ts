// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { ListQuery } from '../repository.base';

// Shared, parameterised implementation of the configuration `list` endpoints (#418).
//
// Fixes the defects of the per-entity hand-rolled queries:
//   - every supplied filter becomes its own ANDed, parameterised predicate
//     (previously only the first filter was applied);
//   - `total` comes from a SEPARATE COUNT(*) issued before the page query, so an
//     over-paged (empty) page still reports the real total (COUNT(*) OVER() would not);
//   - ordering is on the generated key columns with a deterministic tiebreak;
//   - the chosen `sort` and each `filter` field are mapped through an allowlist
//     descriptor, never interpolated from caller-supplied identifiers.

export interface ConfigFilterColumn {
  /** Querystring filter key (e.g. `id`). */
  key: string;
  /** Generated database column the key maps to (e.g. `ruleid`). */
  column: string;
  /** Optional SQL cast appended to the placeholder (e.g. `::boolean`). */
  cast?: string;
}

export interface ConfigListDescriptor {
  /** Configuration table name. */
  table: string;
  /** Allowlist of sort keys mapped to generated columns. */
  sortColumns: Record<string, string>;
  /** Sort key applied when the caller omits `sort`. */
  defaultSort: string;
  /** Canonical order of generated unique-key columns for deterministic tiebreaks. */
  uniqueKeyOrder: string[];
  /** Ordered allowlist of filter fields; iteration order is part of the SQL contract. */
  filters: ConfigFilterColumn[];
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- TEntity gives call sites their concrete config type for `data`.
export const listConfiguration = async <TEntity>(
  descriptor: ConfigListDescriptor,
  query: ListQuery,
): Promise<{ data: TEntity[]; total: number }> => {
  const { offset = 0, limit = 20, order = 'ASC', sort, filters, tenantId } = query;
  const direction = order === 'DESC' ? 'DESC' : 'ASC';

  // tenantId is always the first bound parameter.
  const predicates: string[] = ['tenantid = $1'];
  const filterValues: string[] = [];
  for (const { key, column, cast } of descriptor.filters) {
    const value = filters?.[key];
    if (value !== undefined) {
      filterValues.push(value);
      predicates.push(`${column} = $${filterValues.length + 1}${cast ?? ''}`);
    }
  }
  const whereClause = predicates.join(' AND ');

  // COUNT first: a dedicated COUNT(*) reports the true total even on an empty/over-paged page.
  const countRes = await handlePostExecuteSqlStatement<{ total: string }>(
    {
      text: `SELECT COUNT(*) AS total FROM ${descriptor.table} WHERE ${whereClause};`,
      values: [tenantId, ...filterValues],
    } satisfies PgQueryConfig,
    'configuration',
  );
  const total = parseInt(countRes.rows[0]?.total ?? '', 10) || 0;

  // Deterministic ORDER BY: the chosen sort column first, then the remaining unique-key columns.
  const sortColumn = descriptor.sortColumns[sort ?? ''] ?? descriptor.sortColumns[descriptor.defaultSort];
  const orderColumns = [sortColumn, ...descriptor.uniqueKeyOrder.filter((column) => column !== sortColumn)];
  const orderByClause = orderColumns.map((column) => `${column} ${direction}`).join(', ');

  const offsetParam = filterValues.length + 2;
  const limitParam = filterValues.length + 3;
  const pageRes = await handlePostExecuteSqlStatement<{ configuration: TEntity }>(
    {
      text: `SELECT configuration FROM ${descriptor.table} WHERE ${whereClause} ORDER BY ${orderByClause} OFFSET $${offsetParam} LIMIT $${limitParam};`,
      values: [tenantId, ...filterValues, offset, limit],
    } satisfies PgQueryConfig,
    'configuration',
  );

  return { data: pageRes.rows.map((row) => row.configuration), total };
};
