import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { TransactionRelationship } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';

//npx ts2typebox -i "node_modules\@tazama-lf\frms-coe-lib\lib\interfaces\Pacs002.d.ts" -o "src\schemas\Pacs002Entity.ts"

export const TransactionRepo: CrudRepository<TransactionRelationship> = {
  list: async function ({ limit }): Promise<{ data: TransactionRelationship[]; total: number }> {
    const queryRes = await handlePostExecuteSqlStatement<{ transaction: TransactionRelationship }>(
      {
        text: 'SELECT * FROM transaction',
        values: [limit],
      },
      'event_history',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.transaction), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },
  get: async function (id: string): Promise<TransactionRelationship | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ transaction: TransactionRelationship }>(
      {
        text: 'SELECT * FROM transaction WHERE msgid = $1;',
        values: [id],
      } satisfies PgQueryConfig,
      'event_history',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].transaction : null;
  },
  create: async function (payload: TransactionRelationship): Promise<TransactionRelationship> {
    const queryRes = await handlePostExecuteSqlStatement<{ transaction: TransactionRelationship }>(
      {
        text: 'INSERT INTO transaction (source, destination, transaction) VALUES ($1, $2, $3) RETURNING transaction',
        values: [payload.from, payload.to, payload],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rows[0].transaction;
  },
  update: async function (id: string, payload: TransactionRelationship): Promise<TransactionRelationship | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ transaction: TransactionRelationship }>(
      {
        text: 'UPDATE transaction SET source = $1,destination = $2,transaction = $3 WHERE msgid = $4',
        values: [payload.from, payload.to, payload, id],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? queryRes.rows[0].transaction : null;
  },
  remove: async function (id: string): Promise<boolean> {
    await handlePostExecuteSqlStatement<{ transaction: TransactionRelationship }>(
      {
        text: 'DELETE FROM transaction WHERE msgid = $1',
        values: [id],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return true;
  },
};
