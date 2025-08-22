import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { Connector, CrudRepository } from '../repository.base';
import type { AccountHolder } from '../../interface/account.holder';

//npx ts2typebox -i "node_modules\@tazama-lf\frms-coe-lib\lib\interfaces\Pacs002.d.ts" -o "src\schemas\Pacs002Entity.ts"

export const AccountHolderRepo: CrudRepository<AccountHolder, Connector> = {
  list: async function ({ limit }): Promise<{ data: AccountHolder[]; total: number }> {
    const queryRes = await handlePostExecuteSqlStatement<{ evaluation: AccountHolder }>(
      {
        text: 'SELECT * FROM account_holder LIMIT $1',
        values: [limit],
      },
      'event_history',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.evaluation), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },
  get: async function ({ source, destination }): Promise<AccountHolder | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ evaluation: AccountHolder }>(
      {
        text: 'SELECT * FROM account_holder WHERE source = $1, destination = $2;',
        values: [source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].evaluation : null;
  },
  create: async function (payload: AccountHolder): Promise<AccountHolder> {
    const queryRes = await handlePostExecuteSqlStatement<{ evaluation: AccountHolder }>(
      {
        text: 'INSERT INTO account_holder (source, destination, credttm) VALUES ($1, $2, $3) RETURNING evaluation',
        values: [payload.entityId, payload.accountId, payload.CreDtTm],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rows[0].evaluation;
  },
  update: async function ({ source, destination }, payload: AccountHolder): Promise<AccountHolder | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ evaluation: AccountHolder }>(
      {
        text: 'UPDATE account_holder SET evaluation = $1 WHERE source = $2, destination = $3 RETURNING evaluation',
        values: [payload, source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? queryRes.rows[0].evaluation : null;
  },
  remove: async function ({ source, destination }): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ evaluation: AccountHolder }>(
      {
        text: 'DELETE FROM account_holder WHERE source = $1',
        values: [source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? true : false;
  },
};
