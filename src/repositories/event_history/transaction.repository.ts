// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { TransactionRelationship } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';

interface Transaction {
  source: string;
  destination: string;
  transaction: TransactionRelationship;
}

export const TransactionRepo: CrudRepository<Transaction> = {
  list: async function ({ limit, offset, order, sort }): Promise<{ data: Transaction[]; total: number }> {
    sort ??= 'destination';
    const queryRes = await handlePostExecuteSqlStatement<Transaction>(
      {
        text: `SELECT * FROM transaction ORDER BY ${sort} ${order} OFFSET $1 LIMIT $2;`,
        values: [offset, limit],
      } satisfies PgQueryConfig,
      'event_history',
    );

    return queryRes.rows.length > 0 ? { data: queryRes.rows.map((values) => values), total: queryRes.rowCount! } : { data: [], total: 0 };
  },

  get: async function (id: string): Promise<Transaction | null> {
    const queryRes = await handlePostExecuteSqlStatement<Transaction>(
      {
        text: 'SELECT * FROM transaction WHERE msgid = $1;',
        values: [id],
      } satisfies PgQueryConfig,
      'event_history',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0] : null;
  },

  create: async function (payload: Transaction): Promise<Transaction> {
    const queryRes = await handlePostExecuteSqlStatement<Transaction>(
      {
        text: 'INSERT INTO transaction (source, destination, transaction) VALUES ($1, $2, $3) RETURNING source, destination, transaction;',
        values: [payload.source, payload.destination, payload.transaction],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return { source: queryRes.rows[0].source, destination: queryRes.rows[0].destination, transaction: queryRes.rows[0].transaction };
  },

  update: async function (id: string, payload: Transaction): Promise<Transaction | null> {
    const queryRes = await handlePostExecuteSqlStatement<Transaction>(
      {
        text: 'UPDATE transaction SET source = $1,destination = $2,transaction = $3 WHERE msgid = $4 RETURNING source, destination, transaction;',
        values: [payload.source, payload.destination, payload.transaction, id],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? queryRes.rows[0] : null;
  },

  remove: async function (id: string): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ transaction: Transaction }>(
      {
        text: 'DELETE FROM transaction WHERE msgid = $1;',
        values: [id],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? true : false;
  },
};
