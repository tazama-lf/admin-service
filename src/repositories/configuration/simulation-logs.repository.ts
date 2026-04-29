import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { IRecordCount, SimulationLog, SimulationLogQueryOptions, SimulationMessage } from '../../interface/simulattionLogs.interface';
import pgFormat from 'pg-format';

type SortField = 'created_at' | 'updated_at';

export const getSimulationLogsFromDb = async (options: SimulationLogQueryOptions): Promise<SimulationLog[]> => {
  const { ruleId, tenantId, category, sortBy = 'created_at', sortOrder = 'desc', limit, offset } = options;
  const params: Array<string | number> = [];
  let paramIndex = 1;

  const allowedSortFields: Record<SortField, string> = {
    created_at: 'created_at',
    updated_at: 'updated_at',
  };

  const sortField = allowedSortFields[sortBy as SortField] ?? allowedSortFields.created_at;

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

export const createSimulationLogsInDb = async (
  userId: string,
  tenantId: string,
  ruleId: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  description: string,
  category: string,
  createdByEmail?: string,
): Promise<void> => {
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

export const getSimulationMessagesFromDb = async (tenantId: string, tableName: string): Promise<SimulationMessage[]> => {
  const result = await handlePostExecuteSqlStatement<{ payload: SimulationMessage }>(
    {
      text: pgFormat('SELECT payload FROM %I WHERE tenantId = $1 order by credttm', tableName),
      values: [tenantId],
    } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows.map((row) => row.payload);
};

export const fetchCountFromDlh = async (queries: Array<Record<string, unknown>>, token: string): Promise<IRecordCount> => {
  const DLH_ENDPOINT = process.env.DLH_URL;
  if (!DLH_ENDPOINT) {
    throw new Error('DLH endpoint is not defined');
  }
  const response = await fetch(`${DLH_ENDPOINT}/count`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(queries),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch count from DLH: ${response.statusText}`);
  }

  const data = (await response.json()) as { results?: number[] };

  const rowCount = data.results ? data.results.reduce((acc: number, current: number) => acc + current, 0) : 0;

  return { row_count: rowCount };
};

export const fetchDataFromDlh = async (queries: Array<Record<string, unknown>>, token: string): Promise<Record<string, unknown>> => {
  const DLH_ENDPOINT = process.env.DLH_URL;
  if (!DLH_ENDPOINT) {
    throw new Error('DLH endpoint is not defined');
  }
  const response = await fetch(DLH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(queries),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch data from DLH: ${response.statusText}`);
  }

  const result = (await response.json()) as Record<string, unknown>;

  const results = result.results as Array<{ data: Array<{ document: Record<string, unknown> }> }> | undefined;
  if (Array.isArray(results)) {
    const tableCountResult = await handlePostExecuteSqlStatement<{ count: string }>(
      {
        text: "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'sim%'",
        values: [],
      } satisfies PgQueryConfig,
      'simulation',
    );

    const tableCount = parseInt(tableCountResult.rows[0]?.count ?? '0', 10);
    const nextTableName = `sim${String(tableCount + 1).padStart(3, '0')}`;

    await handlePostExecuteSqlStatement(
      {
        text: pgFormat(
          `CREATE TABLE IF NOT EXISTS %I (
            id SERIAL PRIMARY KEY,
            payload JSONB NOT NULL,
            credttm TEXT,
            "endpointPath" TEXT,
            "tenantId" TEXT,
            msgid TEXT
          )`,
          nextTableName,
        ),
        values: [],
      } satisfies PgQueryConfig,
      'simulation',
    );

    const documents = results.flatMap((r) => (Array.isArray(r.data) ? r.data.map((item) => item.document) : []));
    if (documents.length > 0) {
      const serialized = documents.map((doc) => JSON.stringify(doc));
      const placeholders = serialized.map((_, i) => `($${i + 1})`).join(', ');
      await handlePostExecuteSqlStatement(
        {
          text: pgFormat(`INSERT INTO %I (payload) VALUES ${placeholders}`, nextTableName),
          values: serialized,
        } satisfies PgQueryConfig,
        'simulation',
      );
    }

    return { ...result, tableName: nextTableName };
  }

  return result;
};
