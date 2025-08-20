

//npx ts2typebox -i "node_modules\@tazama-lf\frms-coe-lib\lib\interfaces\rule\RuleConfig.d.ts" -o "src\schemas\RuleConfigEntity.ts"

import type { RuleConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import type { CrudRepository, ListQuery } from './repository.base';
import { handlePostExecuteSqlStatement } from '../services/database.logic.service';

export const RuleConfigRepo: CrudRepository<RuleConfig> = {
    list: async function (params: ListQuery): Promise<{ data: RuleConfig[]; total: number; }> {
        let filter = '';
        let limit = '';
        if (params.filters) {
            filter = `WHERE configuration->>'${params.filters[0]}' = "${params.filters[1]}"`;
        }
        if (params.limit)
            {limit = `LIMIT ${params.limit}`;}

        const queryRes = await handlePostExecuteSqlStatement<{ configuration: RuleConfig }>(`
            SELECT 
                configuration
            FROM
                rule
            ${filter}
            ${limit};
            `, 'configuration');

        return queryRes.rows.length > 0
            ? { data: queryRes.rows.map((values) => values.configuration), total: queryRes.rowCount! }
            : { data: [], total: 0 };
    },
    get: async function (id: string): Promise<RuleConfig | null> {
        throw new Error('Function not implemented.');
    },
    create: async function (payload: RuleConfig): Promise<RuleConfig> {
        throw new Error('Function not implemented.');
    },
    update: async function (id: string, payload: RuleConfig): Promise<RuleConfig | null> {
        throw new Error('Function not implemented.');
    },
    remove: async function (id: string): Promise<boolean> {
        throw new Error('Function not implemented.');
    }
}
