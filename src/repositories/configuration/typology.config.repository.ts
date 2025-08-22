//npx ts2typebox -i "node_modules\@tazama-lf\frms-coe-lib\lib\interfaces\typology\TypologyConfig.d.ts" -o "src\schemas\RuleConfigEntity.ts"

import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { TypologyConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces/processor-files/TypologyConfig';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';

export const TypologyConfigRepo: CrudRepository<TypologyConfig> = {
  list: async function ({ filters, limit, offset }): Promise<{ data: TypologyConfig[]; total: number }> {
    const filter: { field: string; value: string } = { field: 'typologyid', value: '' };
    if (filters) {
      filter.field = filters[0];
      filter.value = filters[1];
    }

    const queryRes = await handlePostExecuteSqlStatement<{ configuration: TypologyConfig }>(
      {
        text: "SELECT configuration FROM typology WHERE ($2 = '' OR configuration->>$1 = $2) OFFSET $3 LIMIT $4;",
        values: [filter.field, filter.value, offset, limit],
      } satisfies PgQueryConfig,
      'configuration',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.configuration), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },
  get: async function (id: string): Promise<TypologyConfig | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: TypologyConfig }>(
      {
        text: 'SELECT configuration FROM typology WHERE typologyid = $1',
        values: [id],
      } satisfies PgQueryConfig,
      'configuration',
    );

    return queryRes.rowCount ? queryRes.rows[0].configuration : null;
  },
  create: async function (payload: TypologyConfig): Promise<TypologyConfig> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: TypologyConfig }>(
      {
        text: 'INSERT INTO typology (configuration) VALUES ($1) RETURNING configuration',
        values: [payload],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rows[0].configuration;
  },
  update: async function (id: string, payload: TypologyConfig): Promise<TypologyConfig | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: TypologyConfig }>(
      {
        text: 'UPDATE typology SET configuration = $1 WHERE typologyid = $2 RETURNING configuration',
        values: [payload, id],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? queryRes.rows[0].configuration : null;
  },
  remove: async function (id: string): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: TypologyConfig }>(
      {
        text: 'DELETE FROM typology WHERE typologyid = $1',
        values: [id],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? true : false;
  },
};
