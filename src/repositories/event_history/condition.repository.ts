import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { Condition } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';

//npx ts2typebox -i "node_modules\@tazama-lf\frms-coe-lib\lib\interfaces\Pacs002.d.ts" -o "src\schemas\Pacs002Entity.ts"

export const ConditionRepo: CrudRepository<Condition> = {
  list: async function ({ offset, limit, sort, order }): Promise<{ data: Condition[]; total: number }> {
    sort ??= 'creDtTm';
    const queryRes = await handlePostExecuteSqlStatement<{ condition: Condition }>(
      {
        text: `SELECT condition FROM condition ORDER BY condition->>$3 ${order} OFFSET $1 LIMIT $2`,
        values: [offset, limit, sort],
      } satisfies PgQueryConfig,
      'event_history',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.condition), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },

  get: async function (id: string): Promise<Condition | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ condition: Condition }>(
      {
        text: 'SELECT condition FROM condition WHERE id = $1;',
        values: [id],
      } satisfies PgQueryConfig,
      'event_history',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].condition : null;
  },

  create: async function (payload: Condition): Promise<Condition> {
    const queryRes = await handlePostExecuteSqlStatement<{ condition: Condition }>(
      {
        text: 'INSERT INTO condition (condition) VALUES ($1) RETURNING condition',
        values: [payload],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rows[0].condition;
  },

  update: async function (id: string, payload: Condition): Promise<Condition | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ condition: Condition }>(
      {
        text: 'UPDATE condition SET condition = $1 WHERE id = $2 RETURNING condition',
        values: [payload, id],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? queryRes.rows[0].condition : null;
  },

  remove: async function (id: string): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ condition: Condition }>(
      {
        text: 'DELETE FROM condition WHERE id = $1',
        values: [id],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? true : false;
  },
};
