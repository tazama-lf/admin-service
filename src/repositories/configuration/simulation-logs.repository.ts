import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { IRecordCount, SimulationLog, SimulationLogQueryOptions, SimulationMessage } from '../../interface/simulattionLogs.interface';
import pgFormat from 'pg-format';

export interface SimulationItemRow {
  payload: Record<string, unknown>;
  endpointPath: string | null;
  credttm: string | null;
  tenantId: string | null;
  msgid: string | null;
}

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

export const fetchSimulationItemsFromTable = async (tableName: string): Promise<SimulationItemRow[]> => {
  const result = await handlePostExecuteSqlStatement<{
    payload: Record<string, unknown>;
    endpointPath: string | null;
    credttm: string | null;
    tenantId: string | null;
    msgid: string | null;
  }>(
    {
      text: pgFormat('SELECT payload, "endpointPath", credttm, "tenantId", msgid FROM %I ORDER BY credttm ASC', tableName),
      values: [],
    } satisfies PgQueryConfig,
    'simulation',
  );

  return result.rows.map((row) => ({
    payload: row.payload,
    endpointPath: row.endpointPath,
    credttm: row.credttm,
    tenantId: row.tenantId,
    msgid: row.msgid,
  }));
};

// not being used now
export const getSimulationMessagesFromDb = async (tenantId: string, tableName: string): Promise<SimulationMessage[]> => {
  const result = await handlePostExecuteSqlStatement<{ payload: SimulationMessage }>(
    {
      text: pgFormat('SELECT payload FROM %I WHERE "tenantId" = $1 order by credttm', tableName),
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

  const data = (await response.json()) as { results?: Array<{ row_count?: number }> };

  const rowCount = data.results ? data.results.reduce((acc: number, current) => acc + (current?.row_count ?? 0), 0) : 0;

  return { rowCount };
};

export const stageItemsInSimTable = async (items: Array<Record<string, unknown>>): Promise<{ tableName: string | null }> => {
  if (items.length === 0) {
    return { tableName: null };
  }

  await handlePostExecuteSqlStatement(
    {
      text: 'CREATE SEQUENCE IF NOT EXISTS sim_table_seq',
      values: [],
    } satisfies PgQueryConfig,
    'simulation',
  );

  const seqResult = await handlePostExecuteSqlStatement<{ id: string }>(
    {
      text: "SELECT NEXTVAL('sim_table_seq') AS id",
      values: [],
    } satisfies PgQueryConfig,
    'simulation',
  );

  const seqId = parseInt(seqResult.rows[0]?.id ?? '1', 10);
  const nextTableName = `sim${String(seqId).padStart(3, '0')}`;

  await handlePostExecuteSqlStatement(
    {
      text: pgFormat(
        'CREATE TABLE IF NOT EXISTS %I (id SERIAL PRIMARY KEY, payload JSONB NOT NULL, credttm TEXT, "endpointPath" TEXT, "tenantId" TEXT, "msgid" TEXT)',
        nextTableName,
      ),
      values: [],
    } satisfies PgQueryConfig,
    'simulation',
  );

  const rows = items.map((doc) => {
    const { endpointPath, _credttm, _tenantId, _msgid, ...rest } = doc;
    return {
      payload: JSON.stringify(rest),
      endpointPath: typeof endpointPath === 'string' ? endpointPath : null,
      credttm: typeof _credttm === 'string' ? _credttm : null,
      tenantId: typeof _tenantId === 'string' ? _tenantId : null,
      msgid: typeof _msgid === 'string' ? _msgid : null,
    };
  });
  const placeholders = rows.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(', ');
  const values = rows.flatMap(({ payload, endpointPath, credttm, tenantId, msgid }) => [payload, endpointPath, credttm, tenantId, msgid]);
  await handlePostExecuteSqlStatement(
    {
      text: pgFormat(`INSERT INTO %I (payload, "endpointPath", credttm, "tenantId", msgid) VALUES ${placeholders}`, nextTableName),
      values,
    } satisfies PgQueryConfig,
    'simulation',
  );

  return { tableName: nextTableName };
};

export const truncateEvaluationResultsInDb = async (): Promise<void> => {
  const query = 'TRUNCATE TABLE evaluation;';
  await handlePostExecuteSqlStatement(
    {
      text: query,
      values: [],
    } satisfies PgQueryConfig,
    'evaluation',
  );
};

export const saveRecordInTrsSimulationInDb = async (simulationData: {
  simulationId: string | undefined;
  totalRecord: number;
  recordProcessed: number;
  simStatus: string;
  tenantId: string;
}): Promise<void> => {
  const { simulationId, totalRecord, recordProcessed, simStatus, tenantId } = simulationData;
  const query = `
    INSERT INTO trs_simulation (simulation_id, total_record, record_processed, sim_status, tenant_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    ON CONFLICT (simulation_id) DO UPDATE SET
      record_processed = EXCLUDED.record_processed,
      sim_status = EXCLUDED.sim_status,
      updated_at = NOW();
  `;

  await handlePostExecuteSqlStatement(
    {
      text: query,
      values: [simulationId, totalRecord, recordProcessed, simStatus, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );
};
