import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import pgFormat from 'pg-format';

export interface EvaluationRow {
  iteration: number;
  evaluation: Record<string, unknown>;
  messageid: string;
  tenantid: string;
  credttm: Date;
}

export const saveEvaluationsInDb = async (evaluations: EvaluationRow[], tableName?: string): Promise<void> => {
  if (evaluations.length === 0) return;

  if (!tableName) {
    throw new Error('tableName is required');
  }

  const resultsTableName = `${tableName}_results`;

  // Check if the results table already exists in the simulation DB
  const tableExistsResult = await handlePostExecuteSqlStatement<{ exists: boolean }>(
    {
      text: `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      ) AS exists`,
      values: [resultsTableName],
    } satisfies PgQueryConfig,
    'simulation',
  );

  const tableExists = tableExistsResult.rows[0]?.exists ?? false;

  let nextIteration = 1;
  if (tableExists) {
    const maxIterationResult = await handlePostExecuteSqlStatement<{ max_iteration: number }>(
      {
        text: pgFormat('SELECT COALESCE(MAX(iteration), 0) AS max_iteration FROM %I', resultsTableName),
        values: [],
      } satisfies PgQueryConfig,
      'simulation',
    );
    nextIteration = parseInt(String(maxIterationResult.rows[0]?.max_iteration ?? '0'), 10) + 1;
  }

  await handlePostExecuteSqlStatement(
    {
      text: pgFormat(
        `CREATE TABLE IF NOT EXISTS %I (
          evaluation JSONB,
          iteration NUMERIC,
          messageid TEXT,
          tenantid TEXT,
          credttm TIMESTAMP,
          PRIMARY KEY (messageid, tenantid, iteration)
        )`,
        resultsTableName,
      ),
      values: [],
    } satisfies PgQueryConfig,
    'simulation',
  );

  const values: unknown[] = [];
  const placeholders = evaluations.map((row, i) => {
    const base = i * 5;
    values.push(JSON.stringify(row.evaluation), nextIteration, row.messageid, row.tenantid, row.credttm);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  await handlePostExecuteSqlStatement(
    {
      text: pgFormat(
        `INSERT INTO %I (evaluation, iteration, messageid, tenantid, credttm) VALUES ${placeholders.join(', ')} ON CONFLICT (messageid, tenantid, iteration) DO NOTHING`,
        resultsTableName,
      ),
      values,
    } satisfies PgQueryConfig,
    'simulation',
  );
};

export const fetchAllEvaluations = async (): Promise<EvaluationRow[]> => {
  const query = `
    SELECT evaluation, messageid, tenantid, credttm
    FROM evaluation;
  `;

  const result = await handlePostExecuteSqlStatement<EvaluationRow>(
    {
      text: query,
      values: [],
    } satisfies PgQueryConfig,
    'evaluation',
  );

  return result.rows;
};
