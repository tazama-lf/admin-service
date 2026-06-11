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
