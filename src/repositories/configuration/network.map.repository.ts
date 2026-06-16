// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement, withConfigurationTransaction } from '../../services/database.logic.service';
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

  // Promote one network map to active and demote the current active map in a single
  // atomic swap. `active` is a generated STORED column derived from the JSON, so the flag
  // is flipped by rewriting `configuration` via jsonb_set (a direct UPDATE of `active` is
  // rejected). The partial unique index `idx_networkmap_active_tenant` (one active map per
  // tenant) is non-deferrable and checked per-row, so the demote MUST happen before the
  // promote inside one transaction - otherwise two rows are transiently active and the
  // insert/update fails with 23505 depending on physical row order. The existence check
  // runs first and outside the transaction: a missing target returns null with no writes,
  // so no rollback is ever needed.
  activate: async function ({ cfg, tenantId }): Promise<NetworkMap | null> {
    const existence = await handlePostExecuteSqlStatement<{ exists: number }>(
      {
        text: 'SELECT 1 FROM network_map WHERE cfg = $1 AND tenantId = $2;',
        values: [cfg, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );
    if (!existence.rowCount) return null;

    const dtTme = new Date().toISOString();
    return await withConfigurationTransaction(async (client) => {
      // Demote the currently-active map (if any) first - bumping updDtTm for data-warehouse deltas.
      await client.query(
        "UPDATE network_map SET configuration = jsonb_set(jsonb_set(configuration, '{active}', 'false'), '{updDtTm}', to_jsonb($1::text)) WHERE tenantId = $2 AND active = true AND cfg <> $3;",
        [dtTme, tenantId, cfg],
      );
      // Promote the target and return its new state.
      const activated = await client.query<{ configuration: NetworkMap }>(
        "UPDATE network_map SET configuration = jsonb_set(jsonb_set(configuration, '{active}', 'true'), '{updDtTm}', to_jsonb($1::text)) WHERE tenantId = $2 AND cfg = $3 RETURNING configuration;",
        [dtTme, tenantId, cfg],
      );
      return activated.rows[0].configuration;
    });
  },

  // Set a single network map inactive. Zero active maps is a legal state, so this is one
  // atomic statement with no transaction and no unique-index concern. Returns null when the
  // target does not exist.
  deactivate: async function ({ cfg, tenantId }): Promise<NetworkMap | null> {
    const dtTme = new Date().toISOString();
    const queryRes = await handlePostExecuteSqlStatement<{ configuration: NetworkMap }>(
      {
        text: "UPDATE network_map SET configuration = jsonb_set(jsonb_set(configuration, '{active}', 'false'), '{updDtTm}', to_jsonb($1::text)) WHERE cfg = $2 AND tenantId = $3 RETURNING configuration;",
        values: [dtTme, cfg, tenantId],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return queryRes.rowCount ? queryRes.rows[0].configuration : null;
  },
};
