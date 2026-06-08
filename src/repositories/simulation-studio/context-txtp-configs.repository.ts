// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type {
  SuiteContextTxtpConfig,
  CreateContextTxtpConfigDto,
  UpdateContextTxtpConfigDto,
} from '../../interface/suite-generation.interface';

const mapRowToContextConfig = (row: Record<string, unknown>): SuiteContextTxtpConfig => ({
  id: row.id as number,
  generation_id: row.generation_id as number,
  txtp: row.txtp as string,
  txtp_version: row.txtp_version as string,
  display_order: row.display_order as number,
  message_count: row.message_count as number,
  schema_snapshot:
    typeof row.schema_snapshot === 'string'
      ? (JSON.parse(row.schema_snapshot) as Record<string, unknown>)
      : (row.schema_snapshot as Record<string, unknown>),
  sample_payload_snapshot: row.sample_payload_snapshot
    ? typeof row.sample_payload_snapshot === 'string'
      ? (JSON.parse(row.sample_payload_snapshot) as Record<string, unknown>)
      : (row.sample_payload_snapshot as Record<string, unknown>)
    : undefined,
  faker_seed: row.faker_seed as number | undefined,
  generator_profile:
    typeof row.generator_profile === 'string'
      ? (JSON.parse(row.generator_profile) as Record<string, unknown>)
      : (row.generator_profile as Record<string, unknown>),
  related_txtp_config_id: row.related_txtp_config_id != null ? (row.related_txtp_config_id as number) : null,
  created_at: new Date(row.created_at as string),
});

export const createContextTxtpConfigInDb = async (dto: CreateContextTxtpConfigDto): Promise<SuiteContextTxtpConfig> => {
  const query = `
    INSERT INTO trs_suite_context_txtp_configs (
      generation_id, txtp, txtp_version, display_order, message_count,
      schema_snapshot, sample_payload_snapshot, faker_seed, generator_profile,
      related_txtp_config_id, created_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, NOW()
    )
    RETURNING *
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: query,
      values: [
        dto.generation_id,
        dto.txtp,
        dto.txtp_version,
        dto.display_order,
        dto.message_count,
        JSON.stringify(dto.schema_snapshot),
        dto.sample_payload_snapshot ? JSON.stringify(dto.sample_payload_snapshot) : null,
        dto.faker_seed ?? null,
        JSON.stringify(dto.generator_profile ?? {}),
        dto.related_txtp_config_id ?? null,
      ],
    } satisfies PgQueryConfig,
    'simulation',
  );

  return mapRowToContextConfig(result.rows[0]);
};

export const updateContextTxtpConfigInDb = async (id: number, dto: UpdateContextTxtpConfigDto): Promise<SuiteContextTxtpConfig | null> => {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (dto.message_count !== undefined) {
    updates.push(`message_count = $${idx++}`);
    values.push(dto.message_count);
  }
  if (dto.faker_seed !== undefined) {
    updates.push(`faker_seed = $${idx++}`);
    values.push(dto.faker_seed);
  }
  if (dto.generator_profile !== undefined) {
    updates.push(`generator_profile = $${idx++}`);
    values.push(JSON.stringify(dto.generator_profile));
  }

  if (updates.length === 0) {
    const existing = await handlePostExecuteSqlStatement<Record<string, unknown>>(
      { text: 'SELECT * FROM trs_suite_context_txtp_configs WHERE id = $1', values: [id] } satisfies PgQueryConfig,
      'simulation',
    );
    return existing.rows.length ? mapRowToContextConfig(existing.rows[0]) : null;
  }

  values.push(id);
  const query = `
    UPDATE trs_suite_context_txtp_configs
    SET ${updates.join(', ')}
    WHERE id = $${idx}
    RETURNING *
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: query, values } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows.length ? mapRowToContextConfig(result.rows[0]) : null;
};

export const deleteContextTxtpConfigInDb = async (id: number): Promise<boolean> => {
  const result = await handlePostExecuteSqlStatement<{ deleted_count: string | number }>(
    {
      text: `
        WITH target AS (
          SELECT id, related_txtp_config_id
          FROM trs_suite_context_txtp_configs
          WHERE id = $1
        ),
        to_delete AS (
          SELECT id FROM target
          UNION
          SELECT id FROM trs_suite_context_txtp_configs WHERE related_txtp_config_id = $1
          UNION
          SELECT related_txtp_config_id AS id FROM target WHERE related_txtp_config_id IS NOT NULL
        ),
        deleted AS (
          DELETE FROM trs_suite_context_txtp_configs
          WHERE id IN (SELECT id FROM to_delete)
          RETURNING id
        )
        SELECT COUNT(*) AS deleted_count FROM deleted
      `,
      values: [id],
    } satisfies PgQueryConfig,
    'simulation',
  );

  const deletedCount = parseInt(String(result.rows[0]?.deleted_count ?? '0'), 10);
  return deletedCount > 0;
};

export const getContextTxtpConfigsByGenerationId = async (generationId: number): Promise<SuiteContextTxtpConfig[]> => {
  const query = `
    SELECT *
    FROM trs_suite_context_txtp_configs
    WHERE generation_id = $1
    ORDER BY display_order ASC
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: query, values: [generationId] } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows.map(mapRowToContextConfig);
};
