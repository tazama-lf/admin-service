import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';

export const updateRuleStatusInDB = async (
  ruleId: string,
  tenantId: string,
  status: string,
  reason: string,
): Promise<{ rowCount: number }> => {
  const query = `
      UPDATE trs_rules
      SET status = $1, comments = $2, updated_at = NOW()
      WHERE id = $3 AND tenant_id = $4
    `;

  const result = await handlePostExecuteSqlStatement(
    {
      text: query,
      values: [status, reason, ruleId, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  return { rowCount: result.rowCount ?? 0 };
};
