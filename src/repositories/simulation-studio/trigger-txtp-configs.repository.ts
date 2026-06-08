// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type {
  SuiteTriggerTxtpConfig,
  CreateTriggerTxtpConfigDto,
  UpdateTriggerTxtpConfigDto,
} from '../../interface/suite-generation.interface';

const mapRow = (row: Record<string, unknown>): SuiteTriggerTxtpConfig => ({
  id: row.id as number,
  generation_id: row.generation_id as number,
  txtp: row.txtp as string,
  txtp_version: row.txtp_version as string,
  display_order: row.display_order as number,
  message_count: row.message_count as number,
  link_to_context_pairs: row.link_to_context_pairs as boolean,
  payload_template_json:
    typeof row.payload_template_json === 'string'
      ? (JSON.parse(row.payload_template_json) as Record<string, unknown>)
      : (row.payload_template_json as Record<string, unknown>),
  expected_independent_variable: row.expected_independent_variable as number | undefined,
  expected_result_band: row.expected_result_band as SuiteTriggerTxtpConfig['expected_result_band'],
  notes: row.notes as string | undefined,
  faker_seed: row.faker_seed as number | undefined,
  generator_profile:
    typeof row.generator_profile === 'string'
      ? (JSON.parse(row.generator_profile) as Record<string, unknown>)
      : (row.generator_profile as Record<string, unknown>),
  related_txtp_config_id: row.related_txtp_config_id != null ? (row.related_txtp_config_id as number) : null,
  created_at: new Date(row.created_at as string),
});

export const createTriggerTxtpConfigInDb = async (dto: CreateTriggerTxtpConfigDto): Promise<SuiteTriggerTxtpConfig> => {
  const query = `
    INSERT INTO trs_suite_trigger_txtp_configs (
      generation_id, txtp, txtp_version, display_order, message_count,
      payload_template_json, link_to_context_pairs,
      expected_independent_variable, expected_result_band, notes,
      faker_seed, generator_profile, related_txtp_config_id, created_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7,
      $8, $9, $10,
      $11, $12, $13, NOW()
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
        JSON.stringify(dto.payload_template_json),
        dto.link_to_context_pairs ?? false,
        dto.expected_independent_variable ?? null,
        dto.expected_result_band ?? null,
        dto.notes ?? null,
        dto.faker_seed ?? null,
        JSON.stringify(dto.generator_profile ?? {}),
        dto.related_txtp_config_id ?? null,
      ],
    } satisfies PgQueryConfig,
    'simulation',
  );

  return mapRow(result.rows[0]);
};

export const updateTriggerTxtpConfigInDb = async (id: number, dto: UpdateTriggerTxtpConfigDto): Promise<SuiteTriggerTxtpConfig | null> => {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (dto.message_count !== undefined) {
    updates.push(`message_count = $${idx++}`);
    values.push(dto.message_count);
  }
  if (dto.link_to_context_pairs !== undefined) {
    updates.push(`link_to_context_pairs = $${idx++}`);
    values.push(dto.link_to_context_pairs);
  }
  if (dto.payload_template_json !== undefined) {
    updates.push(`payload_template_json = $${idx++}`);
    values.push(JSON.stringify(dto.payload_template_json));
  }
  if (dto.expected_independent_variable !== undefined) {
    updates.push(`expected_independent_variable = $${idx++}`);
    values.push(dto.expected_independent_variable);
  }
  if (dto.expected_result_band !== undefined) {
    updates.push(`expected_result_band = $${idx++}`);
    values.push(dto.expected_result_band);
  }
  if (dto.notes !== undefined) {
    updates.push(`notes = $${idx++}`);
    values.push(dto.notes);
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
      { text: 'SELECT * FROM trs_suite_trigger_txtp_configs WHERE id = $1', values: [id] } satisfies PgQueryConfig,
      'simulation',
    );
    return existing.rows.length ? mapRow(existing.rows[0]) : null;
  }

  values.push(id);
  const query = `
    UPDATE trs_suite_trigger_txtp_configs
    SET ${updates.join(', ')}
    WHERE id = $${idx}
    RETURNING *
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: query, values } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows.length ? mapRow(result.rows[0]) : null;
};

export const deleteTriggerTxtpConfigInDb = async (id: number): Promise<boolean> => {
  const result = await handlePostExecuteSqlStatement<{ deleted_count: string | number }>(
    {
      text: `
        WITH target AS (
          SELECT id, related_txtp_config_id
          FROM trs_suite_trigger_txtp_configs
          WHERE id = $1
        ),
        to_delete AS (
          SELECT id FROM target
          UNION
          SELECT id FROM trs_suite_trigger_txtp_configs WHERE related_txtp_config_id = $1
          UNION
          SELECT related_txtp_config_id AS id FROM target WHERE related_txtp_config_id IS NOT NULL
        ),
        deleted AS (
          DELETE FROM trs_suite_trigger_txtp_configs
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

export const getTriggerTxtpConfigsByGenerationId = async (generationId: number): Promise<SuiteTriggerTxtpConfig[]> => {
  const query = `
    SELECT *
    FROM trs_suite_trigger_txtp_configs
    WHERE generation_id = $1
    ORDER BY display_order ASC
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: query, values: [generationId] } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows.map(mapRow);
};
