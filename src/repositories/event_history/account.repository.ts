import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { Account } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';

//npx ts2typebox -i "node_modules\@tazama-lf\frms-coe-lib\lib\interfaces\Pacs002.d.ts" -o "src\schemas\Pacs002Entity.ts"

export const AccountRepo: CrudRepository<Account> = {
  list: async function ({ limit, offset }): Promise<{ data: Account[]; total: number }> {
    const queryRes = await handlePostExecuteSqlStatement<{ id: Account }>(
      {
        text: 'SELECT id FROM account OFFSET $1 LIMIT $2',
        values: [offset, limit],
      } satisfies PgQueryConfig,
      'event_history',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.id), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },
  get: async function (id: string | undefined): Promise<Account | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ id: Account }>(
      {
        text: 'SELECT id FROM account WHERE id = $1;',
        values: [id],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rows.length > 0 ? queryRes.rows[0].id : null;
  },
  create: async function (payload: Account): Promise<Account> {
    const queryRes = await handlePostExecuteSqlStatement<{ account: Account }>(
      {
        text: 'INSERT INTO account (id) VALUES ($1) RETURNING id',
        values: [payload],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rows[0].account;
  },
  update: async function (id: string, payload: Account): Promise<Account | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ account: Account }>(
      {
        text: 'UPDATE account SET id = $1 WHERE id = $2 RETURNING id',
        values: [payload, id],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? queryRes.rows[0].account : null;
  },
  remove: async function (id: string): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ account: Account }>(
      {
        text: 'DELETE FROM account WHERE id = $1',
        values: [id],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? true : false;
  },
};
