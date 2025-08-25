import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { Alert } from '@tazama-lf/frms-coe-lib/lib/interfaces/processor-files/Alert';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';

//npx ts2typebox -i "node_modules\@tazama-lf\frms-coe-lib\lib\interfaces\Pacs002.d.ts" -o "src\schemas\Pacs002Entity.ts"

export const EvaluationRepo: CrudRepository<Alert> = {
  list: async function ({ limit, offset, sort, order }): Promise<{ data: Alert[]; total: number }> {
    sort ??= 'timestamp';
    const queryRes = await handlePostExecuteSqlStatement<{ evaluation: Alert }>(
      {
        text: `SELECT evaluation FROM evaluation ORDER BY evaluation->>$3 ${order} OFFSET $1 LIMIT $2;`,
        values: [offset, limit, sort],
      },
      'evaluation',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.evaluation), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },

  get: async function (id: string): Promise<Alert | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ evaluation: Alert }>(
      {
        text: 'SELECT evaluation FROM evaluation WHERE messageid = $1;',
        values: [id],
      } satisfies PgQueryConfig,
      'evaluation',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].evaluation : null;
  },

  create: async function (payload: Alert): Promise<Alert> {
    const queryRes = await handlePostExecuteSqlStatement<{ evaluation: Alert }>(
      {
        text: 'INSERT INTO evaluation (evaluation) VALUES ($1) RETURNING evaluation;',
        values: [payload],
      } satisfies PgQueryConfig,
      'evaluation',
    );
    return queryRes.rows[0].evaluation;
  },

  update: async function (name: string, payload: Alert): Promise<Alert | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ evaluation: Alert }>(
      {
        text: 'UPDATE evaluation SET evaluation = $1 WHERE messageid = $2 RETURNING evaluation;',
        values: [payload, name],
      } satisfies PgQueryConfig,
      'evaluation',
    );
    return queryRes.rowCount ? queryRes.rows[0].evaluation : null;
  },

  remove: async function (name: string): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ evaluation: Alert }>(
      {
        text: 'DELETE FROM evaluation WHERE messageid = $1;',
        values: [name],
      } satisfies PgQueryConfig,
      'evaluation',
    );
    return queryRes.rowCount ? true : false;
  },
};
