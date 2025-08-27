// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { Connector, CrudRepository } from '../repository.base';
import type { AccountHolder } from '../../interface/account.holder';

export const AccountHolderRepo: CrudRepository<AccountHolder, Connector> = {
  list: async function ({ limit, offset, order, sort }): Promise<{ data: AccountHolder[]; total: number }> {
    sort ??= 'credttm';
    const queryRes = await handlePostExecuteSqlStatement<{ evaluation: AccountHolder }>(
      {
        text: `SELECT * FROM account_holder ORDER BY ${sort} ${order} OFFSET $1 LIMIT $2;`,
        values: [offset, limit],
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
        text: 'SELECT * FROM account_holder WHERE source = $1 AND destination = $2;',
        values: [source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].evaluation : null;
  },

  create: async function (payload: AccountHolder): Promise<AccountHolder> {
    const queryRes = await handlePostExecuteSqlStatement<{ evaluation: AccountHolder }>(
      {
        text: 'INSERT INTO account_holder (source, destination, credttm) VALUES ($1, $2, $3) RETURNING source, destination, credttm;',
        values: [payload.source, payload.destination, payload.credttm],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rows[0].evaluation;
  },

  update: async function ({ source, destination }, payload: AccountHolder): Promise<AccountHolder | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ evaluation: AccountHolder }>(
      {
        text: 'UPDATE account_holder SET credttm = $1, source = $2, destination = $3 WHERE source = $4 AND destination = $5 RETURNING source, destination, credttm;',
        values: [payload.credttm, payload.source, payload.destination, source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? queryRes.rows[0].evaluation : null;
  },

  remove: async function ({ source, destination }): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ evaluation: AccountHolder }>(
      {
        text: 'DELETE FROM account_holder WHERE source = $1 AND destination = $2;',
        values: [source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? true : false;
  },
};
