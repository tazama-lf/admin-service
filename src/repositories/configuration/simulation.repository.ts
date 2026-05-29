// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type {
  SimulationStats,
  SimulationResultsFilters,
  SimulationResultRow,
  SimulationResultsResponse,
} from '../../interface/simulation.interface';

const ALLOWED_SIMULATION_COLUMNS = new Set([
  'simulation_id',
  'total_record',
  'record_processed',
  'sim_status',
  'tenant_id',
  'total_iterations',
]);

export const createSimulationInDB = async (data: Record<string, unknown>): Promise<string> => {
  const keys = Object.keys(data);
  if (keys.length === 0) throw new Error('Empty payload for createSimulationInDB');
  const invalid = keys.filter((k) => !ALLOWED_SIMULATION_COLUMNS.has(k));
  if (invalid.length) throw new Error(`Invalid columns for trs_simulation insert: ${invalid.join(', ')}`);

  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

  const query = `
    INSERT INTO trs_simulation (${keys.join(', ')})
    VALUES (${placeholders})
    RETURNING simulation_id;
  `;

  const result = await handlePostExecuteSqlStatement<{ simulation_id: string }>(
    { text: query, values } satisfies PgQueryConfig,
    'configuration',
  );

  const simulationId = result.rows[0]?.simulation_id;
  if (!simulationId) throw new Error('Failed to insert simulation: No simulation_id returned.');
  return simulationId;
};

export const countSimulationsInDB = async (tenantId: string): Promise<number> => {
  const query = `
    SELECT COUNT(*)
    FROM trs_simulation
    WHERE tenant_id = $1
  `;

  const result = await handlePostExecuteSqlStatement<{ count: string }>(
    { text: query, values: [tenantId] } satisfies PgQueryConfig,
    'configuration',
  );

  return parseInt(result.rows[0].count, 10) || 0;
};

export const findSimulationsInDB = async (tenantId: string, limit: number, offset: number): Promise<{ result: unknown }> => {
  const query = `
    SELECT
      simulation_id,
      total_record,
      record_processed,
      sim_status,
      total_iterations,
      created_at,
      updated_at
    FROM trs_simulation
    WHERE tenant_id = $1
    ORDER BY updated_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await handlePostExecuteSqlStatement<{ result: unknown }>(
    { text: query, values: [tenantId, limit, offset] } satisfies PgQueryConfig,
    'configuration',
  );

  return { result: result.rows };
};

const validateSimTableName = (name: string): void => {
  if (!/^[a-z0-9][a-z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid simulation table name: "${name}". Names must start with a lowercase letter or digit and may contain lowercase letters, digits, and underscores.`,
    );
  }
};

export const getSimulationStatsFromDB = async (sim: string, iterationNo: string, tenantId: string): Promise<SimulationStats> => {
  validateSimTableName(sim);
  const simResults = `${sim}_results`;

  const totalQuery = `SELECT COUNT(*) AS cnt FROM "${sim}" WHERE "tenantId" = $1`;
  const totalResult = await handlePostExecuteSqlStatement<{ cnt: string }>(
    { text: totalQuery, values: [tenantId] } satisfies PgQueryConfig,
    'simulation',
  );
  const totalNoOfRecords = parseInt(totalResult.rows[0]?.cnt ?? '0', 10);

  const evaluatedQuery = `
    SELECT COUNT(*) AS cnt
    FROM "${simResults}"
    WHERE iteration_no = $1
      AND tenant_id = $2
  `;
  const evaluatedResult = await handlePostExecuteSqlStatement<{ cnt: string }>(
    { text: evaluatedQuery, values: [iterationNo, tenantId] } satisfies PgQueryConfig,
    'simulation',
  );
  const recordsEvaluated = parseInt(evaluatedResult.rows[0]?.cnt ?? '0', 10);

  const naltQuery = `
    SELECT COUNT(*) AS cnt
    FROM "${simResults}"
    WHERE iteration_no = $1
      AND tenant_id = $2
      AND evaluation->'report'->>'status' = 'NALT'
  `;
  const naltResult = await handlePostExecuteSqlStatement<{ cnt: string }>(
    { text: naltQuery, values: [iterationNo, tenantId] } satisfies PgQueryConfig,
    'simulation',
  );
  const alertsNotGenerated = parseInt(naltResult.rows[0]?.cnt ?? '0', 10);

  const alertsGenerated = recordsEvaluated - alertsNotGenerated;

  const iterationRecordQuery = `
    SELECT elem->>'run_date_and_time' AS run_date_and_time
    FROM trs_simulation,
         jsonb_array_elements(iteration_records) AS elem
    WHERE LOWER(REPLACE(simulation_id, '-', '')) = $1
      AND (elem->>'iteration_no')::int = $2
    LIMIT 1
  `;
  const iterationRecordResult = await handlePostExecuteSqlStatement<{ run_date_and_time: string | null }>(
    { text: iterationRecordQuery, values: [sim, parseInt(iterationNo, 10)] } satisfies PgQueryConfig,
    'configuration',
  );
  const rawRunDateTime = iterationRecordResult.rows[0]?.run_date_and_time ?? null;

  let runDateTime: string | null = null;
  if (rawRunDateTime) {
    const d = new Date(rawRunDateTime);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    runDateTime = `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }

  const timingQuery = `
    SELECT
      MIN(credttm) AS first_ts,
      MAX(credttm) AS last_ts
    FROM "${sim}"
    WHERE "tenantId" = $1
  `;
  const timingResult = await handlePostExecuteSqlStatement<{ first_ts: string | null; last_ts: string | null }>(
    { text: timingQuery, values: [tenantId] } satisfies PgQueryConfig,
    'simulation',
  );
  const firstTs = timingResult.rows[0]?.first_ts ?? null;
  const lastTs = timingResult.rows[0]?.last_ts ?? null;

  let replayDuration: string | null = null;
  if (firstTs && lastTs) {
    const diffMs = new Date(lastTs).getTime() - new Date(firstTs).getTime();
    const totalSec = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours > 0) {
      replayDuration = `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      replayDuration = `${minutes}m ${seconds}s`;
    } else {
      replayDuration = `${seconds}s`;
    }
  }

  return {
    total_no_of_records: totalNoOfRecords,
    records_evaluated: recordsEvaluated,
    alerts_generated: alertsGenerated,
    alerts_not_generated: alertsNotGenerated,
    run_date_time: runDateTime,
    replay_duration: replayDuration,
  };
};

export const getSimulationResultsFromDB = async (
  sim: string,
  iterationNo: string,
  tenantId: string,
  limit: number,
  offset: number,
  filters: SimulationResultsFilters = {},
): Promise<SimulationResultsResponse> => {
  validateSimTableName(sim);
  const simResults = `${sim}_results`;

  const filterValues: unknown[] = [];
  const filterClauses: string[] = [];
  let paramIdx = 3;

  if (filters.msg_id) {
    filterClauses.push(`s.msgid ILIKE $${paramIdx}`);
    filterValues.push(`%${filters.msg_id}%`);
    paramIdx++;
  }

  if (filters.msg_type) {
    filterClauses.push(`s.payload->>'TxTp' ILIKE $${paramIdx}`);
    filterValues.push(`%${filters.msg_type}%`);
    paramIdx++;
  }

  if (filters.outcome === 'Hit') {
    filterClauses.push("(r.msg_id IS NOT NULL AND r.evaluation->'report'->>'status' != 'NALT')");
  } else if (filters.outcome === 'No-Hit') {
    filterClauses.push("(r.msg_id IS NULL OR r.evaluation->'report'->>'status' = 'NALT')");
  }

  const filterSQL = filterClauses.length > 0 ? `AND ${filterClauses.join(' AND ')}` : '';

  const countQuery = `
    SELECT COUNT(*) AS cnt
    FROM "${sim}" s
    LEFT JOIN "${simResults}" r
      ON s.msgid = r.msg_id
      AND r.iteration_no = $1
      AND r.tenant_id = $2
    WHERE s."tenantId" = $2
    ${filterSQL}
  `;
  const countResult = await handlePostExecuteSqlStatement<{ cnt: string }>(
    { text: countQuery, values: [iterationNo, tenantId, ...filterValues] } satisfies PgQueryConfig,
    'simulation',
  );
  const total = parseInt(countResult.rows[0]?.cnt ?? '0', 10);

  const limitIdx = paramIdx;
  const offsetIdx = paramIdx + 1;
  const query = `
    SELECT
      s.msgid AS msg_id,
      s.payload->>'TxTp' AS msg_type,
      CASE WHEN r.msg_id IS NOT NULL AND r.evaluation->'report'->>'status' != 'NALT' THEN 'Hit' ELSE 'No-Hit' END AS outcome,
      s.credttm AS time,
      r.evaluation AS evaluation
    FROM "${sim}" s
    LEFT JOIN "${simResults}" r
      ON s.msgid = r.msg_id
      AND r.iteration_no = $1
      AND r.tenant_id = $2
    WHERE s."tenantId" = $2
    ${filterSQL}
    ORDER BY s.id ASC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const result = await handlePostExecuteSqlStatement<{
    msg_id: string;
    msg_type: string;
    outcome: string;
    time: string | null;
    evaluation: Record<string, unknown> | null;
  }>({ text: query, values: [iterationNo, tenantId, ...filterValues, limit, offset] } satisfies PgQueryConfig, 'simulation');

  const data: SimulationResultRow[] = result.rows.map((row) => {
    const { evaluation } = row;
    const report = evaluation?.report as Record<string, unknown> | undefined;
    const tadpResult = report?.tadpResult as Record<string, unknown> | undefined;
    const typologyResults = (tadpResult?.typologyResult ?? []) as Array<Record<string, unknown>>;

    const triggeredRules: Array<Record<string, unknown>> = [];
    for (const typo of typologyResults) {
      const ruleResults = (typo.ruleResults ?? []) as Array<Record<string, unknown>>;
      triggeredRules.push(...ruleResults);
    }

    const triggeredTypologies = typologyResults.map((typo) => ({
      name: typo.id as string,
      score: (typo.result as number) ?? 0,
      rules: ((typo.ruleResults ?? []) as Array<Record<string, unknown>>).map((r) => ({
        ruleId: r.id as string,
        weight: (r.wght as number) ?? 0,
        subRef: (r.subRuleRef as string) ?? '',
      })),
    }));

    return {
      msg_id: row.msg_id,
      msg_type: row.msg_type ?? '',
      outcome: row.outcome,
      time: row.time ?? null,
      triggered_rules: triggeredRules,
      triggered_typologies: triggeredTypologies,
    };
  });

  return { data, total, limit, offset };
};
