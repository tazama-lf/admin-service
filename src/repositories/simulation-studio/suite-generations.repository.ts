// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { SuiteGeneration, CreateSuiteGenerationDto } from '../../interface/simulation-studio/suite-generation.interface';

const mapRowToGeneration = (row: Record<string, unknown>): SuiteGeneration => ({
  id: row.id as number,
  suite_id: row.suite_id as number,
  generation_number: row.generation_number as number,
  status: row.status as SuiteGeneration['status'],
  simulation_type: row.simulation_type as SuiteGeneration['simulation_type'],
  rule_name: row.rule_name as string | undefined,
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
  run_count: row.run_count !== undefined ? Number(row.run_count) : undefined,
  run_result_count: row.run_result_count !== undefined ? Number(row.run_result_count) : undefined,
  outcome: (row.last_outcome ?? row.outcome ?? null) as string | null,
});

export const createSuiteGenerationInDb = async (
  dto: CreateSuiteGenerationDto,
  userId: string,
  userEmail?: string,
): Promise<SuiteGeneration> => {
  const query = `
    WITH lock_row AS (
      SELECT pg_advisory_xact_lock($1::bigint)
    ),
    next_num AS (
      SELECT COALESCE(MAX(generation_number), 0) + 1 AS generation_number
      FROM trs_suite_generations
      WHERE suite_id = $1
    )
    INSERT INTO trs_suite_generations (
      suite_id, generation_number, status, simulation_type,
      rule_name, rule_version,
      context_count, trigger_count, enrichment_table_count,
      generated_context_count, generated_trigger_count, generated_enrichment_row_count,
      context_field_config_count, trigger_field_config_count, enrichment_field_config_count,
      wizard_snapshot, generation_metadata,
      created_by, created_by_email, created_at, updated_at
    )
    SELECT
      $1, next_num.generation_number, 'DRAFT', $2,
      $3, $4,
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,
      $5, $6,
      $7, $8, NOW(), NOW()
    FROM next_num, lock_row
    RETURNING *
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: query,
      values: [
        dto.suite_id,
        dto.simulation_type ?? 'SINGLE_RULE',
        dto.rule_name ?? null,
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
    SELECT
      g.*,
      COALESCE(r.run_count, 0) AS run_count,
      COALESCE(r.run_result_count, 0) AS run_result_count,
      r.last_outcome
    FROM trs_suite_generations g
    LEFT JOIN (
      SELECT
        runs.generation_id,
        COUNT(DISTINCT runs.id)::int AS run_count,
        COUNT(res.id)::int AS run_result_count,
        (ARRAY_AGG(runs.outcome ORDER BY runs.id DESC))[1] AS last_outcome
      FROM trs_simulation_runs runs
      LEFT JOIN trs_simulation_run_results res ON res.run_id = runs.id
      GROUP BY runs.generation_id
    ) r ON r.generation_id = g.id
    WHERE g.suite_id = $1
    ORDER BY g.generation_number ASC
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: query, values: [suiteId] } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows.map(mapRowToGeneration);
};

export const getGenerationByIdFromDb = async (generationId: number): Promise<SuiteGeneration | null> => {
  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: 'SELECT * FROM trs_suite_generations WHERE id = $1', values: [generationId] } satisfies PgQueryConfig,
    'simulation',
  );
  if (result.rows.length === 0) return null;
  return mapRowToGeneration(result.rows[0]);
};

/**
 * Clones a generation (and all its child data) into a new generation under targetSuiteId.
 * Copies: context_txtp_configs + field_strategies, trigger_txtp_configs + field_overrides,
 * enrichment_tables. Returns the new generation.
 *
 * Shared by both cloneGeneration and cloneSuite.
 */
export const cloneGenerationDataInDb = async (
  sourceGenerationId: number,
  targetSuiteId: number,
  targetGenerationNumber: number,
  userId: string,
  userEmail?: string,
): Promise<SuiteGeneration> => {
  // 1. Clone the generation row
  const newGenResult = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: `
        INSERT INTO trs_suite_generations (
          suite_id, generation_number, status, simulation_type,
          rule_name, rule_version,
          context_count, trigger_count, enrichment_table_count,
          generated_context_count, generated_trigger_count, generated_enrichment_row_count,
          context_field_config_count, trigger_field_config_count, enrichment_field_config_count,
          wizard_snapshot, generation_metadata, created_by, created_by_email, created_at, updated_at
        )
        SELECT
          $1, $2, 'DRAFT', simulation_type,
          rule_name, rule_version,
          context_count, trigger_count, enrichment_table_count,
          0, 0, 0,
          context_field_config_count, trigger_field_config_count, enrichment_field_config_count,
          wizard_snapshot, generation_metadata, $3, $4, NOW(), NOW()
        FROM trs_suite_generations WHERE id = $5
        RETURNING *
      `,
      values: [targetSuiteId, targetGenerationNumber, userId, userEmail ?? null, sourceGenerationId],
    } satisfies PgQueryConfig,
    'simulation',
  );
  const newGen = mapRowToGeneration(newGenResult.rows[0]);

  // 2. Clone context txtp configs and their field strategies
  const ctxRows = await handlePostExecuteSqlStatement<{ old_id: number; new_id: number }>(
    {
      text: `
        WITH inserted AS (
          INSERT INTO trs_suite_context_txtp_configs (
            generation_id, txtp, txtp_version, display_order, message_count,
            schema_snapshot, sample_payload_snapshot, faker_seed, generator_profile, created_at
          )
          SELECT $1, txtp, txtp_version, display_order, message_count,
                 schema_snapshot, sample_payload_snapshot, faker_seed, generator_profile, NOW()
          FROM trs_suite_context_txtp_configs WHERE generation_id = $2
          RETURNING id
        ),
        source AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY display_order ASC) AS rn
          FROM trs_suite_context_txtp_configs WHERE generation_id = $2
        ),
        target AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY id ASC) AS rn FROM inserted
        )
        SELECT source.id AS old_id, target.id AS new_id
        FROM source JOIN target ON source.rn = target.rn
      `,
      values: [newGen.id, sourceGenerationId],
    } satisfies PgQueryConfig,
    'simulation',
  );

  if (ctxRows.rows.length > 0) {
    await Promise.all(
      ctxRows.rows.map(async ({ old_id: oldId, new_id: newId }) => {
        await handlePostExecuteSqlStatement<Record<string, unknown>>(
          {
            text: `
              INSERT INTO trs_suite_context_field_strategies (
                context_txtp_config_id, field_path, strategy_code,
                static_value, range_min, range_max,
                faker_semantic_type, generator_options, is_required_override, created_at
              )
              SELECT $1, field_path, strategy_code,
                     static_value, range_min, range_max,
                     faker_semantic_type, generator_options, is_required_override, NOW()
              FROM trs_suite_context_field_strategies WHERE context_txtp_config_id = $2
            `,
            values: [newId, oldId],
          } satisfies PgQueryConfig,
          'simulation',
        );
      }),
    );
  }

  // 3. Clone trigger txtp configs and their field overrides
  const trigRows = await handlePostExecuteSqlStatement<{ old_id: number; new_id: number }>(
    {
      text: `
        WITH inserted AS (
          INSERT INTO trs_suite_trigger_txtp_configs (
            generation_id, txtp, txtp_version, display_order, message_count,
            payload_template_json, link_to_context_pairs,
            expected_independent_variable, expected_result_band, notes,
            faker_seed, generator_profile, created_at
          )
          SELECT $1, txtp, txtp_version, display_order, message_count,
                 payload_template_json, link_to_context_pairs,
                 expected_independent_variable, expected_result_band, notes,
                 faker_seed, generator_profile, NOW()
          FROM trs_suite_trigger_txtp_configs WHERE generation_id = $2
          RETURNING id
        ),
        source AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY display_order ASC) AS rn
          FROM trs_suite_trigger_txtp_configs WHERE generation_id = $2
        ),
        target AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY id ASC) AS rn FROM inserted
        )
        SELECT source.id AS old_id, target.id AS new_id
        FROM source JOIN target ON source.rn = target.rn
      `,
      values: [newGen.id, sourceGenerationId],
    } satisfies PgQueryConfig,
    'simulation',
  );

  if (trigRows.rows.length > 0) {
    await Promise.all(
      trigRows.rows.map(async ({ old_id: oldId, new_id: newId }) => {
        await handlePostExecuteSqlStatement<Record<string, unknown>>(
          {
            text: `
              INSERT INTO trs_suite_trigger_field_strategies (
                trigger_txtp_config_id, field_path, strategy_code,
                static_value, range_min, range_max,
                faker_semantic_type, generator_options, created_at
              )
              SELECT $1, field_path, strategy_code,
                     static_value, range_min, range_max,
                     faker_semantic_type, generator_options, NOW()
              FROM trs_suite_trigger_field_strategies WHERE trigger_txtp_config_id = $2
            `,
            values: [newId, oldId],
          } satisfies PgQueryConfig,
          'simulation',
        );
      }),
    );
  }

  // 4. Clone enrichment tables
  await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: `
        INSERT INTO trs_suite_enrichment_tables (
          generation_id, table_name, table_order, row_count,
          payload_template_json, schema_template_json, faker_profile, created_at
        )
        SELECT $1, table_name, table_order, row_count,
               payload_template_json, schema_template_json, faker_profile, NOW()
        FROM trs_suite_enrichment_tables WHERE generation_id = $2
      `,
      values: [newGen.id, sourceGenerationId],
    } satisfies PgQueryConfig,
    'simulation',
  );

  return newGen;
};

export const updateWizardProgressInDb = async (generationId: number, currentStep: number, completedSteps: number[]): Promise<void> => {
  await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: `
        UPDATE trs_suite_generations
        SET wizard_snapshot = jsonb_set(
              jsonb_set(
                wizard_snapshot,
                '{currentStep}',
                to_jsonb($1::int)
              ),
              '{completedSteps}',
              $2::jsonb
            ),
            updated_at = NOW()
        WHERE id = $3
      `,
      values: [currentStep, JSON.stringify(completedSteps), generationId],
    } satisfies PgQueryConfig,
    'simulation',
  );
};

export const updateGenerationCountsInDb = async (
  generationId: number,
  counts: { context_count?: number; trigger_count?: number; enrichment_table_count?: number },
): Promise<void> => {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (counts.context_count !== undefined) {
    updates.push(`context_count = $${idx++}`);
    values.push(counts.context_count);
  }
  if (counts.trigger_count !== undefined) {
    updates.push(`trigger_count = $${idx++}`);
    values.push(counts.trigger_count);
  }
  if (counts.enrichment_table_count !== undefined) {
    updates.push(`enrichment_table_count = $${idx++}`);
    values.push(counts.enrichment_table_count);
  }

  if (updates.length === 0) return;

  values.push(generationId);
  await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: `UPDATE trs_suite_generations SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
      values,
    } satisfies PgQueryConfig,
    'simulation',
  );
};

export interface GenerationSummary {
  generation_id: number;
  generation_number: number;
  status: string;
  suite_name: string;
  associated_rule: string | null;
  primary_txtp: string | null;
  context_txtp_configs: Array<{ txtp: string; txtp_version: string; message_count: number }>;
  enrichment_table_names: string[];
  context_count: number;
  trigger_count: number;
  enrichment_table_count: number;
  iteration_number: number;
}

export const getGenerationSummaryFromDb = async (generationId: number): Promise<GenerationSummary | null> => {
  const genResult = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: `
        SELECT
          g.id AS generation_id,
          g.generation_number,
          g.status,
          g.context_count,
          g.trigger_count,
          g.enrichment_table_count,
          s.name AS suite_name,
          s.rule_name AS associated_rule,
          s.primary_txtp,
          s.iteration_count AS iteration_number
        FROM trs_suite_generations g
        JOIN trs_simulation_suites s ON s.id = g.suite_id
        WHERE g.id = $1
      `,
      values: [generationId],
    } satisfies PgQueryConfig,
    'simulation',
  );

  if (genResult.rows.length === 0) return null;
  const [gen] = genResult.rows;

  const ctxResult = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: 'SELECT txtp, txtp_version, message_count FROM trs_suite_context_txtp_configs WHERE generation_id = $1 ORDER BY display_order ASC',
      values: [generationId],
    } satisfies PgQueryConfig,
    'simulation',
  );

  const enrichResult = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: 'SELECT table_name FROM trs_suite_enrichment_tables WHERE generation_id = $1 ORDER BY table_order ASC',
      values: [generationId],
    } satisfies PgQueryConfig,
    'simulation',
  );

  return {
    generation_id: gen.generation_id as number,
    generation_number: gen.generation_number as number,
    status: gen.status as string,
    suite_name: gen.suite_name as string,
    associated_rule: gen.associated_rule as string | null,
    primary_txtp: gen.primary_txtp as string | null,
    context_txtp_configs: ctxResult.rows.map((r) => ({
      txtp: r.txtp as string,
      txtp_version: r.txtp_version as string,
      message_count: r.message_count as number,
    })),
    enrichment_table_names: enrichResult.rows.map((r) => r.table_name as string),
    context_count: gen.context_count as number,
    trigger_count: gen.trigger_count as number,
    enrichment_table_count: gen.enrichment_table_count as number,
    iteration_number: gen.iteration_number as number,
  };
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

export const resumeGenerationInDb = async (suiteId: number, generationId: number): Promise<SuiteGeneration | null> => {
  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: "Select * FROM trs_suite_generations WHERE suite_id = $1 AND status IN ('DRAFT') AND id = $2 ORDER BY generation_number DESC LIMIT 1",
      values: [suiteId, generationId],
    } satisfies PgQueryConfig,
    'simulation',
  );

  if (result.rows.length === 0) return null;
  return mapRowToGeneration(result.rows[0]);
};

export const updateGenerationStatusInDb = async (generationId: number, status: string): Promise<SuiteGeneration | null> => {
  const query = `
    UPDATE trs_suite_generations
    SET status = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: query,
      values: [status, generationId],
    } satisfies PgQueryConfig,
    'simulation',
  );

  if (result.rows.length === 0) return null;
  return mapRowToGeneration(result.rows[0]);
};
