import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import type { CrudRepository, ListQuery } from './repository.base';
import { handlePostExecuteSqlStatement } from '../services/database.logic.service';
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';

//npx ts2typebox -i "node_modules\@tazama-lf\frms-coe-lib\lib\interfaces\NetworkMap.d.ts" -o "src\schemas\NetworkMapEntity.ts"

export const NetworkMapRepo: CrudRepository<NetworkMap> = {
    list: async function ({ limit = 20, offset = 0, sort = 'createdAt', order = 'asc', q }: ListQuery): Promise<{ data: NetworkMap[]; total: number; }> {
        const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(`
            SELECT 
                configuration
            FROM
                network_map
            WHERE
                configuration->>'active' = 'true';
            `, 'configuration');

        return queryRes.rows.length > 0
            ? { data: queryRes.rows.map((values) => values.configuration), total: queryRes.rowCount! }
            : { data: [], total: 0 };
    },
    get: async function (id: string): Promise<NetworkMap | null> {
        const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(`
            SELECT 
                configuration
            FROM
                network_map
            WHERE
                configuration->>'active' = true;
            `, 'configuration');

        return queryRes.rows.length > 0 ? queryRes.rows[0].configuration : null;
    },
    create: async function (payload: NetworkMap): Promise<NetworkMap> {
        const query: PgQueryConfig = {
            text: `INSERT INTO network_map
              (configuration)
            VALUES
              ($1)
              RETURNING configuration`,
            values: [payload],
        };
        const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(query, 'configuration')
        return queryRes.rows[0].configuration;
    },
    update: async function (id: string, payload: NetworkMap): Promise<NetworkMap | null> {
        throw new Error('Function not implemented.');
    },
    remove: async function (id: string): Promise<boolean> {
        throw new Error('Function not implemented.');
    }
}