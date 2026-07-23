// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { TypologyConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces/processor-files/TypologyConfig';
import type { PoolClient } from 'pg';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';
import { listConfiguration, type ConfigListDescriptor } from './config-list.shared';

const typologyListDescriptor: ConfigListDescriptor = {
  table: 'typology',
  sortColumns: { id: 'typologyid', cfg: 'typologycfg' },
  defaultSort: 'cfg',
  uniqueKeyOrder: ['typologyid', 'typologycfg'],
  filters: [
    { key: 'id', column: 'typologyid' },
    { key: 'cfg', column: 'typologycfg' },
  ],
  keySetColumns: ['typologyid', 'typologycfg'],
};

export const TypologyConfigRepo: CrudRepository<TypologyConfig> = {
  list: async function (params): Promise<{ data: TypologyConfig[]; total: number }> {
    return await listConfiguration<TypologyConfig>(typologyListDescriptor, params);
  },

  get: async function ({ id, cfg, tenantId }): Promise<TypologyConfig | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: TypologyConfig }>(
      {
        text: 'SELECT configuration FROM typology WHERE typologyid = $1 AND typologycfg = $2 AND tenantid = $3;',
        values: [id, cfg, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );

    return queryRes.rowCount ? queryRes.rows[0].configuration : null;
  },

  create: async function (payload: TypologyConfig, tenantId: string, client?: PoolClient): Promise<TypologyConfig> {
    payload.tenantId = tenantId;

    const dtTme = new Date().toISOString();
    payload.creDtTm = dtTme;
    payload.updDtTm = dtTme;

    const queryRes = await handlePostExecuteSqlStatement<{ configuration: TypologyConfig }>(
      {
        text: 'INSERT INTO typology (configuration) VALUES ($1) RETURNING configuration',
        values: [payload],
      } satisfies PgQueryConfig,
      'configuration',
      client,
    );
    return queryRes.rows[0].configuration;
  },

  update: async function ({ id, cfg, tenantId }, payload: TypologyConfig): Promise<TypologyConfig | null> {
    const dtTme = new Date().toISOString();
    payload.updDtTm = dtTme;
    payload.tenantId = tenantId;

    const queryRes = await handlePostExecuteSqlStatement<{ configuration: TypologyConfig }>(
      {
        text: 'UPDATE typology SET configuration = $1 WHERE typologyid = $2 AND typologycfg = $3 AND tenantid = $4 RETURNING configuration',
        values: [payload, id, cfg, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? queryRes.rows[0].configuration : null;
  },

  remove: async function ({ id, cfg, tenantId }): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: TypologyConfig }>(
      {
        text: 'DELETE FROM typology WHERE typologyid = $1 AND typologycfg = $2 AND tenantid = $3;',
        values: [id, cfg, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? true : false;
  },
};
