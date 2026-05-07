// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { TypologyConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces/processor-files/TypologyConfig';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { ConfigVersion, CrudRepository } from '../repository.base';

export const TypologyConfigRepo: CrudRepository<TypologyConfig, ConfigVersion> = {
  list: async function ({ filters, limit, offset, order, sort, tenantId }): Promise<{ data: TypologyConfig[]; total: number }> {
    sort ??= 'cfg';
    const filter: { field: string; value: string } = { field: 'typologyid', value: '' };
    if (filters) {
      const [field, value] = Object.entries(filters)[0];
      filter.field = field;
      filter.value = value;
    }

    const queryRes = await handlePostExecuteSqlStatement<{ configuration: TypologyConfig }>(
      {
        text: `SELECT configuration FROM typology WHERE ($2 = '' OR configuration->>$1 = $2) AND tenantId = $6 ORDER BY configuration->>$5 ${order} OFFSET $3 LIMIT $4;`,
        values: [filter.field, filter.value, offset, limit, sort, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.configuration), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },

  get: async function ({ cfg, tenantId }): Promise<TypologyConfig | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: TypologyConfig }>(
      {
        text: 'SELECT configuration FROM typology WHERE typologycfg = $1 AND tenantid = $2;',
        values: [cfg, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );

    return queryRes.rowCount ? queryRes.rows[0].configuration : null;
  },

  create: async function (payload: TypologyConfig, tenantId: string): Promise<TypologyConfig> {
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
    );
    return queryRes.rows[0].configuration;
  },

  update: async function ({ cfg, tenantId }, payload: TypologyConfig): Promise<TypologyConfig | null> {
    const dtTme = new Date().toISOString();
    payload.updDtTm = dtTme;
    payload.tenantId = tenantId;

    const queryRes = await handlePostExecuteSqlStatement<{ configuration: TypologyConfig }>(
      {
        text: 'UPDATE typology SET configuration = $1 WHERE typologycfg = $2 AND tenantid = $3 RETURNING configuration',
        values: [payload, cfg, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? queryRes.rows[0].configuration : null;
  },

  remove: async function ({ cfg, tenantId }): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: TypologyConfig }>(
      {
        text: 'DELETE FROM typology WHERE typologycfg = $1 AND tenantid = $2;',
        values: [cfg, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? true : false;
  },
};
