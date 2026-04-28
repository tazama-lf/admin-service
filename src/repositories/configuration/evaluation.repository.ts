import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';

export interface EvaluationRow {
  evaluation: Record<string, unknown>;
  messageid: string;
  tenantid: string;
  credttm: Date;
  upddttm: Date;
}

export const fetchAllEvaluations = async (): Promise<EvaluationRow[]> => {
  const query = `
    SELECT evaluation, messageid, tenantid, credttm, upddttm
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
