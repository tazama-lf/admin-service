import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CrudRepository } from '../repository.base';

//npx ts2typebox -i "node_modules\@tazama-lf\frms-coe-lib\lib\interfaces\NetworkMap.d.ts" -o "src\schemas\NetworkMapEntity.ts"

export const NetworkMapRepo: CrudRepository<NetworkMap> = {
  list: async function ({ limit, offset }): Promise<{ data: NetworkMap[]; total: number }> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'SELECT configuration FROM network_map WHERE configuration->>active = true OFFSET $1 LIMIT $2;',
        values: [offset, limit],
      },
      'configuration',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.configuration), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },
  get: async function (id: string): Promise<NetworkMap | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'SELECT configuration FROM network_map WHERE configuration->>cfg = $1;',
        values: [id],
      },
      'configuration',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].configuration : null;
  },
  create: async function (payload: NetworkMap): Promise<NetworkMap> {
    const query: PgQueryConfig = {
      text: 'INSERT INTO network_map (configuration) VALUES ($1) RETURNING configuration',
      values: [payload],
    };
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(query, 'configuration');
    return queryRes.rows[0].configuration;
  },
  update: async function (name: string, payload: NetworkMap): Promise<NetworkMap | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'UPDATE network_map SET configuration = $1 WHERE configuration->>name = $2',
        values: [payload, name],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? queryRes.rows[0].configuration : null;
  },
  remove: async function (name: string): Promise<boolean> {
    await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: 'DELETE FROM network_map WHERE configuration->>name = $1',
        values: [name],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return true;
  },
};
