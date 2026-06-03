// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { EnrichmentFieldStrategy, UpsertEnrichmentFieldStrategyDto } from '../../interface/suite-generation.interface';

const mapRow = (row: Record<string, unknown>): EnrichmentFieldStrategy => ({
  id: row.id as number,
  enrichment_table_id: row.enrichment_table_id as number,
  column_name: row.column_name as string,
  column_type: row.column_type as string | undefined,
  strategy_code: row.strategy_code as EnrichmentFieldStrategy['strategy_code'],
  static_value: row.static_value ?? undefined,
  range_min: row.range_min as number | undefined,
  range_max: row.range_max as number | undefined,
  generator_type: row.generator_type as string | undefined,
  generator_options:
    typeof row.generator_options === 'string'
      ? (JSON.parse(row.generator_options) as Record<string, unknown>)
      : (row.generator_options as Record<string, unknown>),
  created_at: new Date(row.created_at as string),
});

export const upsertEnrichmentFieldStrategyInDb = async (
  enrichmentTableId: number,
  dto: UpsertEnrichmentFieldStrategyDto,
): Promise<EnrichmentFieldStrategy> => {
  const query = `
    INSERT INTO trs_suite_enrichment_field_strategies (
      enrichment_table_id, column_name, column_type, strategy_code,
      static_value, range_min, range_max,
      generator_type, generator_options, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (enrichment_table_id, column_name)
    DO UPDATE SET
      column_type       = EXCLUDED.column_type,
      strategy_code     = EXCLUDED.strategy_code,
      static_value      = EXCLUDED.static_value,
      range_min         = EXCLUDED.range_min,
      range_max         = EXCLUDED.range_max,
      generator_type    = EXCLUDED.generator_type,
      generator_options = EXCLUDED.generator_options
    RETURNING *
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: query,
      values: [
        enrichmentTableId,
        dto.column_name,
        dto.column_type ?? null,
        dto.strategy_code,
        dto.static_value !== undefined ? JSON.stringify(dto.static_value) : null,
        dto.range_min ?? null,
        dto.range_max ?? null,
        dto.generator_type ?? null,
        JSON.stringify(dto.generator_options ?? {}),
      ],
    } satisfies PgQueryConfig,
    'simulation',
  );

  return mapRow(result.rows[0]);
};

export const getEnrichmentFieldStrategiesByTableId = async (enrichmentTableId: number): Promise<EnrichmentFieldStrategy[]> => {
  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: 'SELECT * FROM trs_suite_enrichment_field_strategies WHERE enrichment_table_id = $1 ORDER BY column_name ASC',
      values: [enrichmentTableId],
    } satisfies PgQueryConfig,
    'simulation',
  );
  return result.rows.map(mapRow);
};
