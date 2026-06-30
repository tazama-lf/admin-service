import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { SimulationLog, SimulationLogQueryOptions } from '../../interface/simulattionLogs.interface';

type SortField = 'created_at' | 'updated_at';

export const getSimulationLogsFromDb = async (options: SimulationLogQueryOptions): Promise<SimulationLog[]> => {
  const { ruleId, tenantId, category, sortBy = 'created_at', sortOrder = 'desc', limit, offset } = options;
  const params: Array<string | number> = [];
  let paramIndex = 1;

  const allowedSortFields: Record<SortField, string> = {
    created_at: 'created_at',
    updated_at: 'updated_at',
  };

  const sortField = allowedSortFields[sortBy] ?? allowedSortFields.created_at;

  const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

  let query = `
      SELECT id, created_by, tenant_id, rule_id, old_data, new_data, description, category, created_by_email, created_at, updated_at
      FROM simulation_logs
      WHERE rule_id = $${paramIndex++} AND tenant_id = $${paramIndex++}
    `;
  params.push(ruleId, tenantId);

  if (category) {
    query += ` AND category = $${paramIndex++}`;
    params.push(category);
  }

  query += ` ORDER BY ${sortField} ${order}`;

  if (typeof limit === 'number') {
    query += ` LIMIT $${paramIndex++}`;
    params.push(limit);
  }

  if (typeof offset === 'number') {
    query += ` OFFSET $${paramIndex++}`;
    params.push(offset);
  }

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

export interface CreateSimulationLogDbPayload {
  userId: string;
  tenantId: string;
  ruleId: string;
  oldData: Record<string, unknown>;
  newData: Record<string, unknown>;
  description: string;
  category: string;
  createdByEmail?: string;
}

export const createSimulationLogsInDb = async ({
  userId,
  tenantId,
  ruleId,
  oldData,
  newData,
  description,
  category,
  createdByEmail,
}: CreateSimulationLogDbPayload): Promise<void> => {
  const columns = [
    'created_by',
    'tenant_id',
    'rule_id',
    'old_data',
    'new_data',
    'category',
    'description',
    'created_by_email',
    'created_at',
    'updated_at',
  ];

  const values = [
    userId,
    tenantId,
    parseInt(ruleId, 10),
    JSON.stringify(oldData),
    JSON.stringify(newData),
    category,
    description,
    createdByEmail,
    'NOW()',
    'NOW()',
  ];

  const valuePlaceholders = values.map((_, index) => (index < 8 ? `$${index + 1}` : `${values[index]}`)).join(', ');

  const query = `
      INSERT INTO simulation_logs (${columns.join(', ')}) 
      VALUES (${valuePlaceholders}) 
      RETURNING id, created_by, tenant_id, rule_id, old_data, new_data, category, description, created_by_email, created_at, updated_at;
    `;

  await handlePostExecuteSqlStatement(
    {
      text: query,
      values: values.slice(0, 8),
    } satisfies PgQueryConfig,
    'configuration',
  );
};
