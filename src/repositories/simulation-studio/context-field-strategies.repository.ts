// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { ContextFieldStrategy, UpsertFieldStrategyDto } from '../../interface/simulation-studio/context-txtp.interface';

const mapRow = (row: Record<string, unknown>): ContextFieldStrategy => ({
  id: row.id as number,
  context_txtp_config_id: row.context_txtp_config_id as number,
  field_path: row.field_path as string,
  strategy_code: row.strategy_code as ContextFieldStrategy['strategy_code'],
  static_value: row.static_value ?? undefined,
  range_min: row.range_min as number | undefined,
  range_max: row.range_max as number | undefined,
  faker_semantic_type: row.faker_semantic_type as string | undefined,
  generator_options:
    typeof row.generator_options === 'string'
      ? (JSON.parse(row.generator_options) as Record<string, unknown>)
      : (row.generator_options as Record<string, unknown>),
  is_required_override: row.is_required_override as boolean | undefined,
  created_at: new Date(row.created_at as string),
});

/**
 * Upsert a single field strategy row.
 * ON CONFLICT (context_txtp_config_id, field_path) → update all strategy columns.
 */
export const upsertFieldStrategyInDb = async (contextTxtpConfigId: number, dto: UpsertFieldStrategyDto): Promise<ContextFieldStrategy> => {
  const query = `
    INSERT INTO trs_suite_context_field_strategies (
      context_txtp_config_id, field_path, strategy_code,
      static_value, range_min, range_max,
      faker_semantic_type, generator_options, is_required_override,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (context_txtp_config_id, field_path)
    DO UPDATE SET
      strategy_code        = EXCLUDED.strategy_code,
      static_value         = EXCLUDED.static_value,
      range_min            = EXCLUDED.range_min,
      range_max            = EXCLUDED.range_max,
      faker_semantic_type       = EXCLUDED.faker_semantic_type,
      generator_options    = EXCLUDED.generator_options,
      is_required_override = EXCLUDED.is_required_override
    RETURNING *
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: query,
      values: [
        contextTxtpConfigId,
        dto.field_path,
        dto.strategy_code,
        dto.static_value !== undefined ? JSON.stringify(dto.static_value) : null,
        dto.range_min ?? null,
        dto.range_max ?? null,
        dto.faker_semantic_type ?? null,
        JSON.stringify(dto.generator_options ?? {}),
        dto.is_required_override ?? null,
      ],
    } satisfies PgQueryConfig,
    'simulation',
  );

  return mapRow(result.rows[0]);
};

export const getFieldStrategiesByContextConfigId = async (contextTxtpConfigId: number): Promise<ContextFieldStrategy[]> => {
  const query = `
    SELECT * FROM trs_suite_context_field_strategies
    WHERE context_txtp_config_id = $1
    ORDER BY field_path ASC
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: query, values: [contextTxtpConfigId] } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows.map(mapRow);
};
