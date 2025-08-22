//npx ts2typebox -i "node_modules\@tazama-lf\frms-coe-lib\lib\interfaces\rule\RuleConfig.d.ts" -o "src\schemas\RuleConfigEntity.ts"

import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { RuleConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';

export const RuleConfigRepo: CrudRepository<RuleConfig> = {
  list: async function ({ offset, limit }): Promise<{ data: RuleConfig[]; total: number }> {
    //et filter = '';
    // const limit = `${params.limit}`;
    // if (params.filters) {
    //   //filter = `WHERE configuration->>'${params.filters[0]}' = "${params.filters[1]}"`;
    // }

    const queryRes = await handlePostExecuteSqlStatement<{ configuration: RuleConfig }>(
      {
        text: 'SELECT configuration FROM rule OFFSET $1 LIMIT $2',
        values: [offset, limit],
      } satisfies PgQueryConfig,
      'configuration',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.configuration), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },
  get: async function (id: string): Promise<RuleConfig | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: RuleConfig }>(
      {
        text: 'SELECT configuration FROM rule WHERE ruleid = $1',
        values: [id],
      } satisfies PgQueryConfig,
      'configuration',
    );

    return queryRes.rowCount ? queryRes.rows[0].configuration : null;
  },
  create: async function (payload: RuleConfig): Promise<RuleConfig> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: RuleConfig }>(
      {
        text: 'INSERT INTO rule (configuration) VALUES ($1) RETURNING configuration',
        values: [payload],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rows[0].configuration;
  },
  update: async function (id: string, payload: RuleConfig): Promise<RuleConfig | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: RuleConfig }>(
      {
        text: 'UPDATE rule SET configuration = $1 WHERE ruleid = $2 RETURNING configuration',
        values: [payload, id],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? queryRes.rows[0].configuration : null;
  },
  remove: async function (id: string): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: RuleConfig }>(
      {
        text: 'DELETE FROM rule WHERE ruleid = $2',
        values: [id],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? true : false;
  },
};
