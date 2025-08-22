import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { Pacs002 } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';

//npx ts2typebox -i "node_modules\@tazama-lf\frms-coe-lib\lib\interfaces\Pacs.002.001.12.d.ts" -o "src\schemas\Pacs002Entity.ts"

export const Pacs002Repo: CrudRepository<Pacs002> = {
  list: async function ({ limit }): Promise<{ data: Pacs002[]; total: number }> {
    const queryRes = await handlePostExecuteSqlStatement<{ document: Pacs002 }>(
      {
        text: 'SELECT document FROM pacs002 LIMIT $1',
        values: [limit],
      },
      'raw_history',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.document), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },
  get: async function (id: string): Promise<Pacs002 | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ document: Pacs002 }>(
      {
        text: 'SELECT document FROM pacs002 WHERE messageid = $1;',
        values: [id],
      } satisfies PgQueryConfig,
      'raw_history',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].document : null;
  },
  create: async function (payload: Pacs002): Promise<Pacs002> {
    const queryRes = await handlePostExecuteSqlStatement<{ document: Pacs002 }>(
      {
        text: 'INSERT INTO pacs002 (document) VALUES ($1) RETURNING document',
        values: [payload],
      } satisfies PgQueryConfig,
      'raw_history',
    );
    return queryRes.rows[0].document;
  },
  update: async function (name: string, payload: Pacs002): Promise<Pacs002 | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ document: Pacs002 }>(
      {
        text: 'UPDATE pacs002 SET document = $1 WHERE messageid = $2 RETURNING document',
        values: [payload, name],
      } satisfies PgQueryConfig,
      'raw_history',
    );
    return queryRes.rowCount ? queryRes.rows[0].document : null;
  },
  remove: async function (name: string): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ document: Pacs002 }>(
      {
        text: 'DELETE FROM pacs002 WHERE messageid = $1',
        values: [name],
      } satisfies PgQueryConfig,
      'raw_history',
    );
    return queryRes.rowCount ? true : false;
  },
};
