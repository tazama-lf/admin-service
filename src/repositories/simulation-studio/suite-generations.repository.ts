// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { SuiteGeneration, CreateSuiteGenerationDto } from '../../interface/suite-generation.interface';

const mapRowToGeneration = (row: Record<string, unknown>): SuiteGeneration => ({
  id: row.id as number,
  suite_id: row.suite_id as number,
  generation_number: row.generation_number as number,
  status: row.status as SuiteGeneration['status'],
  simulation_type: row.simulation_type as SuiteGeneration['simulation_type'],
  rule_repo: row.rule_repo as string | undefined,
  rule_version: row.rule_version as string | undefined,
  context_count: row.context_count as number,
  trigger_count: row.trigger_count as number,
  enrichment_table_count: row.enrichment_table_count as number,
  generated_context_count: row.generated_context_count as number,
  generated_trigger_count: row.generated_trigger_count as number,
  generated_enrichment_row_count: row.generated_enrichment_row_count as number,
  context_field_config_count: row.context_field_config_count as number,
  trigger_field_config_count: row.trigger_field_config_count as number,
  enrichment_field_config_count: row.enrichment_field_config_count as number,
  wizard_snapshot:
    typeof row.wizard_snapshot === 'string'
      ? (JSON.parse(row.wizard_snapshot) as Record<string, unknown>)
      : (row.wizard_snapshot as Record<string, unknown>),
  generation_metadata:
    typeof row.generation_metadata === 'string'
      ? (JSON.parse(row.generation_metadata) as Record<string, unknown>)
      : (row.generation_metadata as Record<string, unknown>),
  created_by: row.created_by as string,
  created_by_email: row.created_by_email as string | undefined,
  created_at: new Date(row.created_at as string),
  updated_at: new Date(row.updated_at as string),
});

export const createSuiteGenerationInDb = async (
  dto: CreateSuiteGenerationDto,
  generationNumber: number,
  userId: string,
  userEmail?: string,
): Promise<SuiteGeneration> => {
  const query = `
    INSERT INTO trs_suite_generations (
      suite_id, generation_number, status, simulation_type,
      rule_repo, rule_version,
      context_count, trigger_count, enrichment_table_count,
      generated_context_count, generated_trigger_count, generated_enrichment_row_count,
      context_field_config_count, trigger_field_config_count, enrichment_field_config_count,
      wizard_snapshot, generation_metadata,
      created_by, created_by_email, created_at, updated_at
    ) VALUES (
      $1, $2, 'DRAFT', $3,
      $4, $5,
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,
      $6, $7,
      $8, $9, NOW(), NOW()
    )
    RETURNING *
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: query,
      values: [
        dto.suite_id,
        generationNumber,
        dto.simulation_type ?? 'SINGLE_RULE',
        dto.rule_repo ?? null,
        dto.rule_version ?? null,
        JSON.stringify(dto.wizard_snapshot ?? {}),
        JSON.stringify(dto.generation_metadata ?? {}),
        userId,
        userEmail ?? null,
      ],
    } satisfies PgQueryConfig,
    'simulation',
  );

  return mapRowToGeneration(result.rows[0]);
};

export const getNextGenerationNumber = async (suiteId: number): Promise<number> => {
  const query = `
    SELECT COALESCE(MAX(generation_number), 0) + 1 AS next_num
    FROM trs_suite_generations
    WHERE suite_id = $1
  `;

  const result = await handlePostExecuteSqlStatement<{ next_num: number }>(
    { text: query, values: [suiteId] } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows[0].next_num;
};

export const getGenerationsBySuiteId = async (suiteId: number): Promise<SuiteGeneration[]> => {
  const query = `
    SELECT *
    FROM trs_suite_generations
    WHERE suite_id = $1
    ORDER BY generation_number ASC
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: query, values: [suiteId] } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows.map(mapRowToGeneration);
};

export const getLatestGenerationBySuiteId = async (suiteId: number): Promise<SuiteGeneration | null> => {
  const query = `
    SELECT *
    FROM trs_suite_generations
    WHERE suite_id = $1
    ORDER BY generation_number DESC
    LIMIT 1
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: query, values: [suiteId] } satisfies PgQueryConfig,
    'simulation',
  );

  if (result.rows.length === 0) return null;
  return mapRowToGeneration(result.rows[0]);
};
