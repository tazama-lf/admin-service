// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { TriggerFieldOverride, UpsertTriggerFieldOverrideDto } from '../../interface/simulation-studio/suite-generation.interface';

const mapRow = (row: Record<string, unknown>): TriggerFieldOverride => ({
  id: row.id as number,
  trigger_txtp_config_id: row.trigger_txtp_config_id as number,
  field_path: row.field_path as string,
  override_type: row.override_type as TriggerFieldOverride['override_type'],
  static_value: row.static_value ?? undefined,
  range_min: row.range_min as number | undefined,
  range_max: row.range_max as number | undefined,
  faker_semantic_type: row.faker_semantic_type as string | undefined,
  generator_options:
    typeof row.generator_options === 'string'
      ? (JSON.parse(row.generator_options) as Record<string, unknown>)
      : (row.generator_options as Record<string, unknown>),
  created_at: new Date(row.created_at as string),
});

export const upsertTriggerFieldOverrideInDb = async (
  triggerTxtpConfigId: number,
  dto: UpsertTriggerFieldOverrideDto,
): Promise<TriggerFieldOverride> => {
  const query = `
    INSERT INTO trs_suite_trigger_field_overrides (
      trigger_txtp_config_id, field_path, override_type,
      static_value, range_min, range_max,
      faker_semantic_type, generator_options,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (trigger_txtp_config_id, field_path)
    DO UPDATE SET
      override_type     = EXCLUDED.override_type,
      static_value      = EXCLUDED.static_value,
      range_min         = EXCLUDED.range_min,
      range_max         = EXCLUDED.range_max,
      faker_semantic_type    = EXCLUDED.faker_semantic_type,
      generator_options = EXCLUDED.generator_options
    RETURNING *
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: query,
      values: [
        triggerTxtpConfigId,
        dto.field_path,
        dto.override_type,
        dto.static_value !== undefined ? JSON.stringify(dto.static_value) : null,
        dto.range_min ?? null,
        dto.range_max ?? null,
        dto.faker_semantic_type ?? null,
        JSON.stringify(dto.generator_options ?? {}),
      ],
    } satisfies PgQueryConfig,
    'simulation',
  );

  return mapRow(result.rows[0]);
};

export const getTriggerFieldOverridesByConfigId = async (triggerTxtpConfigId: number): Promise<TriggerFieldOverride[]> => {
  const query = `
    SELECT * FROM trs_suite_trigger_field_overrides
    WHERE trigger_txtp_config_id = $1
    ORDER BY field_path ASC
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: query, values: [triggerTxtpConfigId] } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows.map(mapRow);
};
