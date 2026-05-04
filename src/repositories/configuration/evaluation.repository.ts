import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import pgFormat from 'pg-format';

export interface EvaluationRow {
  evaluation: Record<string, unknown>;
  messageid: string;
  tenantid: string;
  credttm: Date;
  upddttm: Date;
}

export const saveEvaluationsInDb = async (evaluations: EvaluationRow[], tableName?: string): Promise<void> => {
  if (evaluations.length === 0) return;

  if (!tableName) {
    throw new Error('tableName is required');
  }

  const resultsTableName = `${tableName}_results`;
  await handlePostExecuteSqlStatement(
    {
      text: pgFormat(
        `CREATE TABLE IF NOT EXISTS %I (
          evaluation JSONB,
          messageid TEXT PRIMARY KEY,
          tenantid TEXT,
          credttm TIMESTAMP,
          upddttm TIMESTAMP
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
    values.push(JSON.stringify(row.evaluation), row.messageid, row.tenantid, row.credttm, row.upddttm);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  await handlePostExecuteSqlStatement(
    {
      text: pgFormat(
        `INSERT INTO %I (evaluation, messageid, tenantid, credttm, upddttm) VALUES ${placeholders.join(', ')} ON CONFLICT (messageid) DO NOTHING`,
        resultsTableName,
      ),
      values,
    } satisfies PgQueryConfig,
    'simulation',
  );
};

export const fetchAllEvaluations = async (): Promise<EvaluationRow[]> => {
  const query = `
    SELECT evaluation, messageid, tenantid, credttm, upddttm, tenantid
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