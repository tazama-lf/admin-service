// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';

export const NetworkMapRepo: CrudRepository<NetworkMap> = {
  list: async function ({ limit, offset, sort, order, filters }): Promise<{ data: NetworkMap[]; total: number }> {
    sort ??= 'cfg';
    const filter: { field: string; value: string } = { field: 'cfg', value: '' };
    if (filters) {
      filter.field = filters[0];
      filter.value = filters[1];
    }
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: `SELECT configuration FROM network_map ($2 = '' OR configuration->>$1 = $2) ORDER BY configuration->>$3 ${order} OFFSET $4 LIMIT $5;`,
        values: [filter.field, filter.value, sort, offset, limit],
      } satisfies PgQueryConfig,
      'configuration',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.configuration), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },

  get: async function (id: string): Promise<NetworkMap | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'SELECT configuration FROM network_map WHERE configuration->>active = true;',
        values: [id],
      } satisfies PgQueryConfig,
      'configuration',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].configuration : null;
  },

  create: async function (payload: NetworkMap): Promise<NetworkMap> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'INSERT INTO network_map (configuration) VALUES ($1) RETURNING configuration',
        values: [payload],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rows[0].configuration;
  },

  update: async function (name: string, payload: NetworkMap): Promise<NetworkMap | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'UPDATE network_map SET configuration = $1 WHERE configuration->>name = $2 RETURNING configuration;',
        values: [payload, name],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? queryRes.rows[0].configuration : null;
  },
  remove: async function (name: string): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'DELETE FROM network_map WHERE configuration->>name = $1;',
        values: [name],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? true : false;
  },
};
