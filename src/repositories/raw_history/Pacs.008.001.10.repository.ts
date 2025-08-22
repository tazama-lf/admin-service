import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { Pacs008 } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';

//npx ts2typebox -i "node_modules\@tazama-lf\frms-coe-lib\lib\interfaces\Pacs.008.001.10.d.ts" -o "src\schemas\interface.schemas\Pacs008Entity.ts"

export const Pacs008Repo: CrudRepository<Pacs008> = {
  list: async function ({ limit }): Promise<{ data: Pacs008[]; total: number }> {
    const queryRes = await handlePostExecuteSqlStatement<{ document: Pacs008 }>(
      {
        text: 'SELECT document FROM pacs008 LIMIT $1;',
        values: [limit],
      },
      'raw_history',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.document), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },
  get: async function (id): Promise<Pacs008 | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ document: Pacs008 }>(
      {
        text: 'SELECT document FROM pacs008 WHERE messageid = $1;',
        values: [id],
      } satisfies PgQueryConfig,
      'raw_history',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].document : null;
  },
  create: async function (payload: Pacs008): Promise<Pacs008> {
    const queryRes = await handlePostExecuteSqlStatement<{ document: Pacs008 }>(
      {
        text: 'INSERT INTO pacs008 (document) VALUES ($1) RETURNING document',
        values: [payload],
      } satisfies PgQueryConfig,
      'raw_history',
    );
    return queryRes.rows[0].document;
  },
  update: async function (id: string, payload: Pacs008): Promise<Pacs008 | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ document: Pacs008 }>(
      {
        text: 'UPDATE pacs008 SET document = $1 WHERE messageid = $2 RETURNING document',
        values: [payload, id],
      } satisfies PgQueryConfig,
      'raw_history',
    );
    return queryRes.rowCount ? queryRes.rows[0].document : null;
  },
  remove: async function (id: string): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ document: Pacs008 }>(
      {
        text: 'DELETE FROM pacs008 WHERE messageid = $1',
        values: [id],
      } satisfies PgQueryConfig,
      'raw_history',
    );
    return queryRes.rowCount ? true : false;
  },
};
