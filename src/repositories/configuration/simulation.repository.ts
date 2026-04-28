// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';

const ALLOWED_SIMULATION_COLUMNS = new Set(['simulation_id', 'total_record', 'record_processed', 'sim_status', 'tenant_id']);

export const createSimulationInDB = async (data: Record<string, unknown>): Promise<number> => {
  const keys = Object.keys(data);
  const invalid = keys.filter((k) => !ALLOWED_SIMULATION_COLUMNS.has(k));
  if (invalid.length) throw new Error(`Invalid columns for trs_simulation insert: ${invalid.join(', ')}`);

  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

  const query = `
    INSERT INTO trs_simulation (${keys.join(', ')})
    VALUES (${placeholders})
    RETURNING id;
  `;

  const result = await handlePostExecuteSqlStatement<{ id: number }>({ text: query, values } satisfies PgQueryConfig, 'configuration');

  const insertedId = result.rows[0]?.id;
  if (!insertedId) throw new Error('Failed to insert simulation: No ID returned.');
  return insertedId;
};

export const countSimulationsInDB = async (tenantId: string): Promise<number> => {
  const query = `
    SELECT COUNT(*)
    FROM trs_simulation
    WHERE tenant_id = $1
  `;

  const result = await handlePostExecuteSqlStatement<{ count: string }>(
    { text: query, values: [tenantId] } satisfies PgQueryConfig,
    'configuration',
  );

  return parseInt(result.rows[0].count, 10) || 0;
};

export const findSimulationsInDB = async (tenantId: string, limit: number, offset: number): Promise<{ result: unknown }> => {
  const query = `
    SELECT
      id,
      simulation_id,
      total_record,
      record_processed,
      sim_status,
      created_at,
      updated_at
    FROM trs_simulation
    WHERE tenant_id = $1
    ORDER BY updated_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await handlePostExecuteSqlStatement<{ result: unknown }>(
    { text: query, values: [tenantId, limit, offset] } satisfies PgQueryConfig,
    'configuration',
  );

  return { result: result.rows };
};
