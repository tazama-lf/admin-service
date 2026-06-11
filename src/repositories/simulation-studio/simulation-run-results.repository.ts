// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';

export interface TriggerConfig {
  id: number;
  generation_id: number;
  txtp: string;
  txtp_version: string;
  display_order: number;
  message_count: number;
  link_to_context_pairs: boolean;
  payload_template_json: Record<string, unknown>;
  expected_independent_variable: number | null;
  expected_result_band: string | null;
  notes: string | null;
  faker_seed: number | null;
  generator_profile: Record<string, unknown>;
  related_txtp_config_id: number | null;
  related_transaction: string | null;
}

export interface RunResultEntry {
  id: number;
  outcome: string | null;
  independent_variable: string | null;
  sub_rule_ref: string;
  rule_result: unknown;
  trigger: TriggerConfig | null;
}

export interface SimulationRunResult {
  id: number;
  outcome: string;
  rule_version: string;
  rule_name: string;
  triggers: RunResultEntry[];
}

export interface SuiteResultRow {
  suite_id: number;
  total_runs: number;
  results: SimulationRunResult[];
}

interface RunRow {
  id: number;
  outcome: string;
  rule_version: string;
  rule_name: string;
  trigger_count: number | null;
}

interface ResultJoinRow {
  id: number;
  run_id: number;
  outcome: string | null;
  independent_variable: string | null;
  sub_rule_ref: string;
  rule_result: unknown;
  // joined trigger config columns (prefixed)
  tc_id: number | null;
  tc_generation_id: number | null;
  tc_txtp: string | null;
  tc_txtp_version: string | null;
  tc_display_order: number | null;
  tc_message_count: number | null;
  tc_link_to_context_pairs: boolean | null;
  tc_payload_template_json: unknown;
  tc_expected_independent_variable: number | null;
  tc_expected_result_band: string | null;
  tc_notes: string | null;
  tc_faker_seed: number | null;
  tc_generator_profile: unknown;
  tc_related_txtp_config_id: number | null;
  tc_related_transaction: string | null;
}

const mapTriggerConfig = (row: ResultJoinRow): TriggerConfig | null => {
  if (row.tc_id == null) return null;
  return {
    id: row.tc_id,
    generation_id: row.tc_generation_id!,
    txtp: row.tc_txtp!,
    txtp_version: row.tc_txtp_version!,
    display_order: row.tc_display_order!,
    message_count: row.tc_message_count!,
    link_to_context_pairs: row.tc_link_to_context_pairs!,
    payload_template_json:
      typeof row.tc_payload_template_json === 'string'
        ? (JSON.parse(row.tc_payload_template_json) as Record<string, unknown>)
        : (row.tc_payload_template_json as Record<string, unknown>),
    expected_independent_variable: row.tc_expected_independent_variable,
    expected_result_band: row.tc_expected_result_band,
    notes: row.tc_notes,
    faker_seed: row.tc_faker_seed,
    generator_profile:
      typeof row.tc_generator_profile === 'string'
        ? (JSON.parse(row.tc_generator_profile) as Record<string, unknown>)
        : (row.tc_generator_profile as Record<string, unknown>),
    related_txtp_config_id: row.tc_related_txtp_config_id,
    related_transaction: row.tc_related_transaction,
  };
};

export const getSuiteResultFromDb = async (suiteId: number): Promise<SuiteResultRow | null> => {
  const runsQuery: PgQueryConfig = {
    text: `
      SELECT id, outcome, rule_version, rule_name, trigger_count
      FROM trs_simulation_runs
      WHERE suite_id = $1
      ORDER BY id ASC
    `,
    values: [suiteId],
  };

  const runsResult = await handlePostExecuteSqlStatement<RunRow>(runsQuery, 'simulation');

  if (runsResult.rowCount === 0) return null;

  const runIds = runsResult.rows.map((r) => r.id);

  const resultsQuery: PgQueryConfig = {
    text: `
      SELECT
        rr.id,
        rr.run_id,
        rr.outcome,
        rr.independent_variable,
        rr.sub_rule_ref,
        rr.rule_result,
        tc.id                           AS tc_id,
        tc.generation_id                AS tc_generation_id,
        tc.txtp                         AS tc_txtp,
        tc.txtp_version                 AS tc_txtp_version,
        tc.display_order                AS tc_display_order,
        tc.message_count                AS tc_message_count,
        tc.link_to_context_pairs        AS tc_link_to_context_pairs,
        tc.payload_template_json        AS tc_payload_template_json,
        tc.expected_independent_variable AS tc_expected_independent_variable,
        tc.expected_result_band         AS tc_expected_result_band,
        tc.notes                        AS tc_notes,
        tc.faker_seed                   AS tc_faker_seed,
        tc.generator_profile            AS tc_generator_profile,
        tc.related_txtp_config_id       AS tc_related_txtp_config_id,
        tc.related_transaction          AS tc_related_transaction
      FROM trs_simulation_run_results rr
      LEFT JOIN trs_suite_trigger_txtp_configs tc ON tc.id = rr.trigger_id
      WHERE rr.run_id = ANY($1::bigint[])
      ORDER BY rr.run_id ASC, rr.id ASC
    `,
    values: [runIds],
  };

  const resultsResult = await handlePostExecuteSqlStatement<ResultJoinRow>(resultsQuery, 'simulation');

  const resultsByRunId = new Map<number, ResultJoinRow[]>();
  for (const row of resultsResult.rows) {
    const existing = resultsByRunId.get(row.run_id) ?? [];
    existing.push(row);
    resultsByRunId.set(row.run_id, existing);
  }

  const results: SimulationRunResult[] = runsResult.rows.map((run) => ({
    id: run.id,
    outcome: run.outcome,
    rule_version: run.rule_version,
    rule_name: run.rule_name,
    triggers: (resultsByRunId.get(run.id) ?? []).map((r) => ({
      id: r.id,
      outcome: r.outcome,
      independent_variable: r.independent_variable,
      sub_rule_ref: r.sub_rule_ref,
      rule_result: r.rule_result,
      trigger: mapTriggerConfig(r),
    })),
  }));

  return {
    suite_id: suiteId,
    total_runs: runsResult.rowCount ?? 0,
    results,
  };
};
