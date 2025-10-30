// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { RuleConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';

export const RuleConfigRepo: CrudRepository<RuleConfig> = {
  list: async function ({ offset, limit, filters, order, sort, tenantId }): Promise<{ data: RuleConfig[]; total: number }> {
    sort ??= 'cfg';
    const filter: { field: string; value: string } = { field: 'ruleid', value: '' };
    if (filters) {
      filter.field = filters[0];
      filter.value = filters[1];
    }

    const queryRes = await handlePostExecuteSqlStatement<{ configuration: RuleConfig }>(
      {
        text: `SELECT configuration FROM rule WHERE ($2 = '' OR configuration->>$1 = $2) AND tenantId = $6 ORDER BY configuration->>$3 ${order} OFFSET $4 LIMIT $5;`,
        values: [filter.field, filter.value, sort, offset, limit, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.configuration), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },

  get: async function ({ id, cfg, tenantId }): Promise<RuleConfig | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: RuleConfig }>(
      {
        text: 'SELECT configuration FROM rule WHERE ruleid = $1 AND rulecfg = $2 AND tenantid = $3;',
        values: [id, cfg, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );

    return queryRes.rowCount ? queryRes.rows[0].configuration : null;
  },

  create: async function (payload: RuleConfig, tenantId: string): Promise<RuleConfig> {
    payload.tenantId = tenantId;
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: RuleConfig }>(
      {
        text: 'INSERT INTO rule (configuration) VALUES ($1) RETURNING configuration;',
        values: [payload],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rows[0].configuration;
  },

  update: async function ({ id, cfg, tenantId }, payload: RuleConfig): Promise<RuleConfig | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: RuleConfig }>(
      {
        text: 'UPDATE rule SET configuration = $1 WHERE ruleid = $2 AND rulecfg = $3 AND tenantid = $4 RETURNING configuration;',
        values: [payload, id, cfg, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? queryRes.rows[0].configuration : null;
  },

  remove: async function ({ id, cfg, tenantId }): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: RuleConfig }>(
      {
        text: 'DELETE FROM rule WHERE ruleid = $1 AND rulecfg = $2 AND tenantid = $3;',
        values: [id, cfg, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? true : false;
  },
};
