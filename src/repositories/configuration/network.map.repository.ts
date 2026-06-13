// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { ConfigVersion, CrudRepository } from '../repository.base';
import { listConfiguration, type ConfigListDescriptor } from './config-list.shared';

const networkMapListDescriptor: ConfigListDescriptor = {
  table: 'network_map',
  sortColumns: { cfg: 'cfg' },
  defaultSort: 'cfg',
  uniqueKeyOrder: ['cfg'],
  filters: [
    { key: 'active', column: 'active', cast: '::boolean' },
    { key: 'cfg', column: 'cfg' },
  ],
};

export const NetworkMapRepo: CrudRepository<NetworkMap, ConfigVersion> = {
  list: async function (params): Promise<{ data: NetworkMap[]; total: number }> {
    return await listConfiguration<NetworkMap>(networkMapListDescriptor, params);
  },

  get: async function ({ cfg, tenantId }): Promise<NetworkMap | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'SELECT configuration FROM network_map WHERE cfg = $1 AND tenantId = $2;',
        values: [cfg, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].configuration : null;
  },

  create: async function (payload: NetworkMap, tenantId: string): Promise<NetworkMap> {
    payload.tenantId = tenantId;

    const dtTme = new Date().toISOString();
    payload.creDtTm = dtTme;
    payload.updDtTm = dtTme;

    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'INSERT INTO network_map (configuration) VALUES ($1) RETURNING configuration',
        values: [payload],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rows[0].configuration;
  },

  update: async function ({ cfg, tenantId }, payload: NetworkMap): Promise<NetworkMap | null> {
    const dtTme = new Date().toISOString();
    payload.updDtTm = dtTme;
    payload.tenantId = tenantId;

    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'UPDATE network_map SET configuration = $1 WHERE cfg = $2 AND tenantId = $3 RETURNING configuration;',
        values: [payload, cfg, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? queryRes.rows[0].configuration : null;
  },
  remove: async function ({ cfg, tenantId }): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'DELETE FROM network_map WHERE cfg = $1 AND tenantId = $2;',
        values: [cfg, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? true : false;
  },
};
