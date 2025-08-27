// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { Entity } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';

export const EntityRepo: CrudRepository<Entity> = {
  list: async function ({ limit, offset, sort, order }): Promise<{ data: Entity[]; total: number }> {
    sort ??= 'creDtTm';
    const queryRes = await handlePostExecuteSqlStatement<Entity>(
      {
        text: `SELECT id, credttm as "creDtTm" FROM entity ORDER BY ${sort} ${order} OFFSET $1 LIMIT $2`,
        values: [offset, limit],
      } satisfies PgQueryConfig,
      'event_history',
    );

    return queryRes.rows.length > 0 ? { data: queryRes.rows.map((values) => values), total: queryRes.rowCount! } : { data: [], total: 0 };
  },

  get: async function (id: string): Promise<Entity | null> {
    const queryRes = await handlePostExecuteSqlStatement<Entity>(
      {
        text: 'SELECT id, credttm as "creDtTm" FROM entity WHERE id = $1;',
        values: [id],
      } satisfies PgQueryConfig,
      'event_history',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0] : null;
  },

  create: async function (payload: Entity): Promise<Entity> {
    const queryRes = await handlePostExecuteSqlStatement<{ entity: Entity }>(
      {
        text: 'INSERT INTO entity (id, creDtTm) VALUES ($1,$2) RETURNING id, credttm as "creDtTm";',
        values: [payload.id, payload.creDtTm],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rows[0].entity;
  },

  update: async function (id: string, payload: Entity): Promise<Entity | null> {
    const queryRes = await handlePostExecuteSqlStatement<Entity>(
      {
        text: 'UPDATE entity SET id = $1, creDtTm = $2 WHERE id = $3 RETURNING id, credttm AS "creDtTm";',
        values: [payload.id, payload.creDtTm, id],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? queryRes.rows[0] : null;
  },

  remove: async function (id: string): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<Entity>(
      {
        text: 'DELETE FROM entity WHERE id = $1;',
        values: [id],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? true : false;
  },
};
