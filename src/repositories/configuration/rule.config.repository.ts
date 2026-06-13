// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { RuleConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';
import { listConfiguration, type ConfigListDescriptor } from './config-list.shared';

const ruleListDescriptor: ConfigListDescriptor = {
  table: 'rule',
  sortColumns: { id: 'ruleid', cfg: 'rulecfg' },
  defaultSort: 'cfg',
  uniqueKeyOrder: ['ruleid', 'rulecfg'],
  filters: [
    { key: 'id', column: 'ruleid' },
    { key: 'cfg', column: 'rulecfg' },
  ],
};

export const RuleConfigRepo: CrudRepository<RuleConfig> = {
  list: async function (params): Promise<{ data: RuleConfig[]; total: number }> {
    return await listConfiguration<RuleConfig>(ruleListDescriptor, params);
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

    const dtTme = new Date().toISOString();
    payload.creDtTm = dtTme;
    payload.updDtTm = dtTme;

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
    const dtTme = new Date().toISOString();
    payload.updDtTm = dtTme;
    payload.tenantId = tenantId;

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
