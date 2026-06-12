// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';

export interface RunResultEntry {
  id: number;
  trigger_id: number | null;
  rule_result: unknown;
  independent_variable: string | null;
  sub_rule_ref: string;
}

export interface SimulationRunResult {
  run_id: number;
  generation_id: number;
  rule_name: string;
  rule_version: string;
  trigger_count: number | null;
  outcome: string;
  triggers: RunResultEntry[];
}

export interface SuiteResultRow {
  suite_id: number;
  results: SimulationRunResult[];
}

interface RunRow {
  id: number;
  generation_id: number;
  outcome: string;
  rule_version: string;
  rule_name: string;
  trigger_count: number | null;
}

interface ResultRow {
  id: number;
  run_id: number;
  trigger_id: number | null;
  rule_result: unknown;
  independent_variable: string | null;
  sub_rule_ref: string;
}

interface RuleResultPayload {
  subRuleRef?: string;
  indpdntVarbl?: number;
  [key: string]: unknown;
}

export interface SaveRunResultDto {
  gen_id: number;
  trigger_id: number | null;
  rule_result: RuleResultPayload;
}

interface GenerationLookupRow {
  suite_id: number;
  rule_version: string | null;
  trigger_count: number;
  rule_name: string | null;
}

interface RunInsertRow {
  id: number;
}

export const saveRunResultInDb = async (dto: SaveRunResultDto): Promise<{ run_id: number; result_id: number; outcome: string }> => {
  const genQuery: PgQueryConfig = {
    text: `
      SELECT g.suite_id, g.rule_version, g.trigger_count, s.rule_name
      FROM trs_suite_generations g
      JOIN trs_simulation_suites s ON s.id = g.suite_id
      WHERE g.id = $1
    `,
    values: [dto.gen_id],
  };

  const genResult = await handlePostExecuteSqlStatement<GenerationLookupRow>(genQuery, 'simulation');

  if (!genResult.rowCount) {
    throw new Error(`Generation not found for gen_id: ${dto.gen_id}`);
  }

  const gen = genResult.rows[0];

  const existingRunQuery: PgQueryConfig = {
    text: 'SELECT id FROM trs_simulation_runs WHERE generation_id = $1 LIMIT 1',
    values: [dto.gen_id],
  };

  const existingRunResult = await handlePostExecuteSqlStatement<RunInsertRow>(existingRunQuery, 'simulation');

  let runId: number;

  const subRuleRef = dto.rule_result.subRuleRef ?? 'none';
  const independentVariable = dto.rule_result.indpdntVarbl ?? null;
  const runResultOutcome = subRuleRef.toLowerCase().includes('err') ? 'FAILED' : 'SUCCESS';

  if (existingRunResult.rowCount) {
    runId = existingRunResult.rows[0].id;
  } else {
    const insertRunQuery: PgQueryConfig = {
      text: `
        INSERT INTO trs_simulation_runs (suite_id, generation_id, rule_name, rule_version, trigger_count, outcome)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      values: [gen.suite_id, dto.gen_id, gen.rule_name, gen.rule_version, gen.trigger_count, 'SUCCESS'],
    };

    const insertRunResult = await handlePostExecuteSqlStatement<RunInsertRow>(insertRunQuery, 'simulation');
    runId = insertRunResult.rows[0].id;
  }

  const insertResultQuery: PgQueryConfig = {
    text: `
      INSERT INTO trs_simulation_run_results (run_id, trigger_id, rule_result, sub_rule_ref, independent_variable, outcome)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `,
    values: [runId, dto.trigger_id, JSON.stringify(dto.rule_result), subRuleRef, independentVariable, runResultOutcome],
  };

  const insertResultResult = await handlePostExecuteSqlStatement<RunInsertRow>(insertResultQuery, 'simulation');

  return { run_id: runId, result_id: insertResultResult.rows[0].id, outcome: runResultOutcome };
};

export const getSuiteResultFromDb = async (suiteId: number): Promise<SuiteResultRow | null> => {
  const runsQuery: PgQueryConfig = {
    text: `
      SELECT id, generation_id, outcome, rule_version, rule_name, trigger_count
      FROM trs_simulation_runs
      WHERE suite_id = $1
      ORDER BY id ASC
    `,
    values: [suiteId],
  };

  const runsResult = await handlePostExecuteSqlStatement<RunRow>(runsQuery, 'simulation');

  if (!runsResult.rowCount) return null;

  const runIds = runsResult.rows.map((r) => r.id);

  const resultsQuery: PgQueryConfig = {
    text: `
      SELECT id, run_id, trigger_id, rule_result, independent_variable, sub_rule_ref
      FROM trs_simulation_run_results
      WHERE run_id = ANY($1::bigint[])
      ORDER BY run_id ASC, id ASC
    `,
    values: [runIds],
  };

  const resultsResult = await handlePostExecuteSqlStatement<ResultRow>(resultsQuery, 'simulation');

  const resultsByRunId = new Map<number, ResultRow[]>();
  for (const row of resultsResult.rows) {
    const existing = resultsByRunId.get(row.run_id) ?? [];
    existing.push(row);
    resultsByRunId.set(row.run_id, existing);
  }

  const results: SimulationRunResult[] = runsResult.rows.map((run) => ({
    run_id: run.id,
    generation_id: run.generation_id,
    rule_name: run.rule_name,
    rule_version: run.rule_version,
    trigger_count: run.trigger_count,
    outcome: run.outcome,
    triggers: (resultsByRunId.get(run.id) ?? []).map((r) => ({
      id: r.id,
      trigger_id: r.trigger_id,
      rule_result: r.rule_result,
      independent_variable: r.independent_variable,
      sub_rule_ref: r.sub_rule_ref,
    })),
  }));

  return {
    suite_id: suiteId,
    results,
  };
};
