// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { configuration, loggerService, server } from '../..';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';

export const NetworkMapRepo: CrudRepository<NetworkMap> = {
  list: async function ({ limit, offset, sort, order, filters, tenantId }): Promise<{ data: NetworkMap[]; total: number }> {
    sort ??= 'cfg';
    const filter: { field: string; value: string } = { field: 'cfg', value: '' };
    if (filters) {
      filter.field = filters[0];
      filter.value = filters[1];
    }
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: `SELECT configuration FROM network_map WHERE ($2 = '' OR configuration->>$1 = $2) ORDER BY configuration->>$3 ${order} OFFSET $4 LIMIT $5;`,
        values: [filter.field, filter.value, sort, offset, limit],
      } satisfies PgQueryConfig,
      tenantId,
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.configuration), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },

  get: async function ({ id, cfg, tenantId }): Promise<NetworkMap | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'SELECT configuration FROM network_map WHERE configuration->>name = $1, configuration->>cfg = $2;',
        values: [id, cfg],
      } satisfies PgQueryConfig,
      tenantId,
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].configuration : null;
  },

  create: async function (payload: NetworkMap, tenantId: string): Promise<NetworkMap> {
    payload.tenantId = tenantId;
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'INSERT INTO network_map (configuration) VALUES ($1) RETURNING configuration',
        values: [payload],
      } satisfies PgQueryConfig,
      tenantId,
    );
    return queryRes.rows[0].configuration;
  },

  update: async function ({ id, cfg, tenantId }, payload: NetworkMap): Promise<NetworkMap | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: "UPDATE network_map SET configuration = $1::jsonb WHERE configuration->>'cfg' = $2 RETURNING configuration;",
        values: [payload, cfg],
      } satisfies PgQueryConfig,
      tenantId,
    );

    try {
      const result = queryRes.rowCount ? queryRes.rows[0].configuration : null;
      if (server.handleResponseCommandChannel && result) {
        await server.handleResponseCommandChannel(
          result,
          [configuration.COMMAND_CHANNEL_STREAM_SUBJECT],
          [{ key: 'config-type', value: 'network-map' }],
        );
      }
      return result;
    } catch (error) {
      loggerService.error('Error in NetworkMapRepo.update while sending command channel message', error);
      throw error;
    }
  },
  remove: async function ({ id, cfg, tenantId }): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'DELETE FROM network_map WHERE configuration->>name = $1 AND configuration->>cfg = $2;',
        values: [id, cfg],
      } satisfies PgQueryConfig,
      tenantId,
    );
    return queryRes.rowCount ? true : false;
  },
};
