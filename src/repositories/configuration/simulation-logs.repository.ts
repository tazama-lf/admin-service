import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { SimulationLog } from '../../interface/simulattionLogs.interface';

export const fetchSimulationLogs = async (options: {
  ruleId: string;
  tenantId: string;
  category?: string;
  sortBy?: 'created_at' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}): Promise<SimulationLog[]> => {
  const { ruleId, tenantId, category, sortBy = 'created_at', sortOrder = 'desc', limit, offset } = options;
  const params: Array<string | number> = [ruleId, tenantId];
  let query = `
      SELECT id, created_by, tenant_id, rule_id, old_data, new_data, description, category, created_by_email, created_at, updated_at
      FROM simulation_logs
      WHERE rule_id = $1 AND tenant_id = $2
    `;

  if (category) {
    query += ' AND category = $3';
    params.push(category);
  }

  query += `
      ORDER BY ${sortBy} ${sortOrder}
      ${limit ? `LIMIT ${limit}` : ''}
      ${offset ? `OFFSET ${offset}` : ''}
    `;

  const result = await handlePostExecuteSqlStatement<SimulationLog>(
    {
      text: query,
      values: params,
    } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows.map((row) => ({
    ...row,
    old_data: typeof row.old_data === 'string' ? (JSON.parse(row.old_data) as Record<string, unknown>) : row.old_data,
    new_data: typeof row.new_data === 'string' ? (JSON.parse(row.new_data) as Record<string, unknown>) : row.new_data,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  }));
};

export const insertSimulationLogToDB = async (
  userId: string,
  tenantId: string,
  ruleId: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  description: string,
  category: string,
  createdByEmail?: string,
): Promise<void> => {
  const query = `
      INSERT INTO simulation_logs (
        created_by,
        tenant_id,
        rule_id,
        old_data,
        new_data,
        category,
        description,
        created_by_email,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING id, created_by, tenant_id, rule_id, old_data, new_data, category, description, created_by_email, created_at, updated_at;
    `;
  await handlePostExecuteSqlStatement(
    {
      text: query,
      values: [
        userId,
        tenantId,
        parseInt(ruleId, 10),
        JSON.stringify(oldData),
        JSON.stringify(newData),
        category,
        description,
        createdByEmail,
      ],
    } satisfies PgQueryConfig,
    'configuration',
  );
};
