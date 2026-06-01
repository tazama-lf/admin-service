import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import { databaseManager } from '../..';
import pgFormat from 'pg-format';

export interface EvaluationRow {
  iteration: number;
  evaluation: Record<string, unknown>;
  messageid: string;
  tenantid: string;
  credttm: Date;
}

export interface EvaluationSourceRow {
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

  // Acquire a dedicated client so all statements share the same SERIALIZABLE transaction.
  // This prevents two concurrent callers from reading the same MAX(iteration) and silently
  // dropping each other's rows via ON CONFLICT DO NOTHING.
  const client = await databaseManager._simulation.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    await client.query(
      pgFormat(
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
    );

    // Compute the next iteration number inside the same transaction so no concurrent
    // caller can observe the same MAX value before we commit our own rows.
    const maxIterationResult = await client.query<{ max_iteration: string }>(
      pgFormat('SELECT COALESCE(MAX(iteration), 0) AS max_iteration FROM %I', resultsTableName),
    );
    const nextIteration = parseInt(maxIterationResult.rows[0]?.max_iteration ?? '0', 10) + 1;

    const values: unknown[] = [];
    const placeholders = evaluations.map((row, i) => {
      const base = i * 5;
      values.push(JSON.stringify(row.evaluation), nextIteration, row.messageid, row.tenantid, row.credttm);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });

    await client.query(
      pgFormat(`INSERT INTO %I (evaluation, iteration, messageid, tenantid, credttm) VALUES ${placeholders.join(', ')}`, resultsTableName),
      values,
    );

    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // keep original failure as root cause
    }
    throw err;
  } finally {
    client.release();
  }
};

export const fetchAllEvaluations = async (tenantId: string): Promise<EvaluationSourceRow[]> => {
  const query = `
    SELECT evaluation, messageid, tenantid, credttm
    FROM evaluation
    WHERE tenantid = $1;
  `;

  const result = await handlePostExecuteSqlStatement<EvaluationSourceRow>(
    {
      text: query,
      values: [tenantId],
    } satisfies PgQueryConfig,
    'evaluation',
  );

  return result.rows;
};
