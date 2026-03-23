// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';

export const getDataModelJson = async (tenantId: string): Promise<Record<string, unknown> | null> => {
  const query = `
    SELECT data_model_json
    FROM tazama_data_model_json
    WHERE LOWER(tenant_id) = LOWER($1)
  `;

  const result = await handlePostExecuteSqlStatement<{ data_model_json: Record<string, unknown> }>(
    {
      text: query,
      values: [tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].data_model_json;
};

export const upsertDataModelJson = async (
  tenantId: string,
  dataModelJson: Record<string, unknown>,
): Promise<{ tenant_id: string; updated_at: string }> => {
  const query = `
    INSERT INTO tazama_data_model_json (tenant_id, data_model_json, created_at, updated_at)
    VALUES ($1, $2::jsonb, NOW(), NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      data_model_json = $2::jsonb,
      updated_at = NOW()
    RETURNING tenant_id, updated_at
  `;

  const result = await handlePostExecuteSqlStatement<{ tenant_id: string; updated_at: string }>(
    {
      text: query,
      values: [tenantId, JSON.stringify(dataModelJson)],
    } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to upsert data model JSON');
  }

  return result.rows[0];
};
