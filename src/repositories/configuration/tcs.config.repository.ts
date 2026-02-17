// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { ConfigStatus, ContentType, type FieldMapping, type FunctionDefinition, type JSONSchema, type Config } from '@tazama-lf/tcs-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { ConfigData, ConfigRow } from '../../interface/config.interface';
import { loggerService } from '../../index';

export type { ConfigData, ConfigRow };

const mapRowToConfig = (row: ConfigRow): Config => ({
  id: row.id,
  msgFam: row.msg_fam,
  transactionType: row.transaction_type,
  endpointPath: row.endpoint_path,
  version: row.version,
  contentType: row.content_type,
  schema: typeof row.schema === 'string' ? (JSON.parse(row.schema) as JSONSchema) : row.schema,
  mapping: row.mapping ? (typeof row.mapping === 'string' ? (JSON.parse(row.mapping) as FieldMapping[]) : row.mapping) : undefined,
  functions: row.functions
    ? typeof row.functions === 'string'
      ? (JSON.parse(row.functions) as FunctionDefinition[])
      : row.functions
    : undefined,
  status: row.status as ConfigStatus,
  tenantId: row.tenant_id,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  comments: row.comments,
  publishing_status: row.publishing_status,
  payload: row.content_type === ContentType.XML ? row.payload_xml : row.payload_json,
});

export const createConfig = async (config: ConfigData, id?: number): Promise<number> => {
  const isXml = config.contentType === ContentType.XML;
  const payloadColumn = isXml ? 'payload_xml' : 'payload_json';
  const payloadPlaceholder = isXml ? '$14::xml' : '$14';
  const payloadValue = isXml
    ? typeof config.payload === 'string'
      ? config.payload
      : null
    : config.payload && typeof config.payload === 'object'
      ? config.payload
      : null;

  const query = id
    ? `
      INSERT INTO tcs_config (
        id, msg_fam, transaction_type, endpoint_path, version, content_type,
        schema, mapping, functions, status, tenant_id, created_by, publishing_status, ${payloadColumn}
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, ${payloadPlaceholder})
      RETURNING id
    `
    : `
      INSERT INTO tcs_config (
        msg_fam, transaction_type, endpoint_path, version, content_type,
        schema, mapping, functions, status, tenant_id, created_by, publishing_status, ${payloadColumn}
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, ${isXml ? '$13::xml' : '$13'})
      RETURNING id
    `;

  const values = id
    ? [
        id,
        config.msgFam,
        config.transactionType,
        config.endpointPath,
        config.version,
        config.contentType,
        JSON.stringify(config.schema),
        config.mapping ? JSON.stringify(config.mapping) : null,
        config.functions ? JSON.stringify(config.functions) : null,
        config.status ?? ConfigStatus.IN_PROGRESS,
        config.tenantId,
        config.createdBy,
        config.publishing_status ?? 'inactive',
        payloadValue,
      ]
    : [
        config.msgFam,
        config.transactionType,
        config.endpointPath,
        config.version,
        config.contentType,
        JSON.stringify(config.schema),
        config.mapping ? JSON.stringify(config.mapping) : null,
        config.functions ? JSON.stringify(config.functions) : null,
        config.status ?? ConfigStatus.IN_PROGRESS,
        config.tenantId,
        config.createdBy,
        config.publishing_status ?? 'inactive',
        payloadValue,
      ];

  const result = await handlePostExecuteSqlStatement<{ id: number }>(
    {
      text: query,
      values,
    } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows[0].id;
};

export const findConfigById = async (id: number, tenantId: string): Promise<Config | null> => {
  const query = `
    SELECT
      id, msg_fam, transaction_type, endpoint_path, version, content_type,
      schema, mapping, functions, status, tenant_id, created_by, publishing_status,
      payload_xml, payload_json, created_at, updated_at, comments
    FROM tcs_config
    WHERE id = $1 AND tenant_id = $2
  `;

  const values = [id, tenantId];

  const result = await handlePostExecuteSqlStatement<ConfigRow>(
    {
      text: query,
      values,
    } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToConfig(result.rows[0]);
};

export const findConfigsByStatus = async (
  limit: number,
  offset: number,
  filters: Record<string, string>,
  tenantId: string,
): Promise<{
  data: Config[];
  total: number;
  limit: number;
  offset: number;
}> => {
  const { status, endpointPath, createdAt } = filters;

  // Build dynamic WHERE clauses
  const whereClauses: string[] = ['tenant_id = $1'];
  const queryParams: Array<string | string[]> = [tenantId];
  let paramIndex = 2;

  if (status) {
    const statusArray = status.split(',').map((s) => s.trim());
    whereClauses.push(`status = ANY($${paramIndex})`);
    queryParams.push(statusArray);
    paramIndex += 1;
  }

  if (endpointPath) {
    whereClauses.push(`endpoint_path LIKE $${paramIndex}`);
    queryParams.push(`%${endpointPath}%`);
    paramIndex += 1;
  }

  if (createdAt) {
    whereClauses.push(`DATE(created_at) = $${paramIndex}`);
    queryParams.push(createdAt);
    paramIndex += 1;
  }

  const whereClause = whereClauses.join(' AND ');

  const countQuery = `
    SELECT COUNT(*) as total
    FROM tcs_config
    WHERE ${whereClause}
  `;

  const countResult = await handlePostExecuteSqlStatement<{ total: string }>(
    {
      text: countQuery,
      values: queryParams,
    } satisfies PgQueryConfig,
    'configuration',
  );

  const total = parseInt(countResult.rows[0].total, 10);

  // Data query with pagination  // hot fix by ahmad and adeel
  const dataQuery = `
     SELECT
       id, msg_fam, transaction_type, endpoint_path, version, content_type,
       schema, mapping, functions, status, tenant_id, created_by, publishing_status,
       payload_xml, payload_json, created_at, updated_at, comments
     FROM tcs_config
     WHERE ${whereClause}
     ORDER BY updated_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;


  const dataResult = await handlePostExecuteSqlStatement<ConfigRow>(
    {
      text: dataQuery,
      values: [...queryParams, limit, offset] as Array<string | string[] | number>,
    } satisfies PgQueryConfig,
    'configuration',
  );
  loggerService.log(`findConfigsByStatus - Found ${dataQuery},${countQuery},${queryParams.map(i=>i)} configs`, 'tcs.config.repository');
  return {
    data: dataResult.rows.map(mapRowToConfig),
    total,
    limit,
    offset,
  };
};

export const updateConfig = async (id: number, tenantId: string, updates: Partial<Config>): Promise<Config> => {
  const setClauses: string[] = [];
  const values: Array<string | number | object> = [];
  let paramIndex = 1;

  if (updates.msgFam !== undefined) {
    setClauses.push(`msg_fam = $${paramIndex++}`);
    values.push(updates.msgFam);
  }
  if (updates.transactionType !== undefined) {
    setClauses.push(`transaction_type = $${paramIndex++}`);
    values.push(updates.transactionType);
  }
  if (updates.contentType !== undefined) {
    setClauses.push(`content_type = $${paramIndex++}`);
    values.push(updates.contentType);

    if (updates.contentType === ContentType.XML && updates.payload !== undefined) {
      setClauses.push(`payload_xml = $${paramIndex++}::xml`);
      values.push(updates.payload as string);
      setClauses.push('payload_json = NULL');
    } else if (updates.payload !== undefined) {
      setClauses.push(`payload_json = $${paramIndex++}`);
      values.push(JSON.stringify(updates.payload));
      setClauses.push('payload_xml = NULL');
    }
  } else if (updates.payload !== undefined) {
    setClauses.push(`payload_json = $${paramIndex++}`);
    values.push(JSON.stringify(updates.payload));
  }
  if (updates.comments !== undefined) {
    setClauses.push(`comments = $${paramIndex++}`);
    values.push(updates.comments);
  }
  if (updates.publishing_status !== undefined) {
    setClauses.push(`publishing_status = $${paramIndex++}`);
    values.push(updates.publishing_status);
  }
  if (updates.mapping !== undefined) {
    setClauses.push(`mapping = $${paramIndex++}`);
    values.push(JSON.stringify(updates.mapping));
  }
  if (updates.functions !== undefined) {
    setClauses.push(`functions = $${paramIndex++}`);
    values.push(JSON.stringify(updates.functions));
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }

  if (setClauses.length === 0) {
    throw new Error('No fields to update');
  }

  setClauses.push('updated_at = NOW()');

  const query = `
    UPDATE tcs_config
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
    RETURNING id, msg_fam, transaction_type, endpoint_path, version, content_type,
              schema, payload_xml, payload_json, comments, mapping, functions,
              status, publishing_status, created_at, updated_at, tenant_id, created_by
  `;

  values.push(id, tenantId);

  interface UpdateConfigRow {
    id: number;
    msg_fam: string;
    transaction_type: string;
    endpoint_path: string;
    version: string;
    content_type: ContentType;
    schema: JSONSchema;
    payload_xml: string | null;
    payload_json: Record<string, unknown> | null;
    comments: string;
    mapping: FieldMapping[];
    functions: FunctionDefinition[];
    status: ConfigStatus;
    publishing_status: 'active' | 'inactive';
    created_at: string;
    updated_at: string;
    tenant_id: string;
    created_by: string;
  }

  const result = await handlePostExecuteSqlStatement<UpdateConfigRow>({ text: query, values } satisfies PgQueryConfig, 'configuration');

  if (result.rows.length === 0) {
    throw new Error(`Config with id ${id} not found or not authorized`);
  }

  const [row] = result.rows;
  return {
    id: row.id,
    msgFam: row.msg_fam,
    transactionType: row.transaction_type,
    endpointPath: row.endpoint_path,
    version: row.version,
    contentType: row.content_type,
    schema: row.schema,
    payload: (row.content_type === ContentType.XML ? row.payload_xml : row.payload_json)!,
    comments: row.comments,
    mapping: row.mapping,
    functions: row.functions,
    status: row.status,
    publishing_status: row.publishing_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tenantId: row.tenant_id,
    createdBy: row.created_by,
  };
};

export const findAllTransactionTypes = async (tenantId: string): Promise<string[]> => {
  const query = `
    SELECT DISTINCT transaction_type
    FROM tcs_config
    WHERE tenant_id = $1
      AND (
        (status = 'STATUS_04_APPROVED') 
        OR 
        (status = 'STATUS_06_EXPORTED')
      )
    ORDER BY transaction_type
  `;

  const result = await handlePostExecuteSqlStatement<{ transaction_type: string }>(
    { text: query, values: [tenantId] } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows.map((row) => row.transaction_type);
};

export const getPayloadByTransactionType = async (transactionType: string, tenantId: string): Promise<unknown> => {
  if (!transactionType || !tenantId) {
    throw new Error('Transaction type and tenant ID are required');
  }

  const query = `
    SELECT payload_json
    FROM tcs_config
    WHERE transaction_type = $1 AND tenant_id = $2
    LIMIT 1
  `;

  const result = await handlePostExecuteSqlStatement<{ payload_json: unknown }>(
    { text: query, values: [transactionType, tenantId] } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    throw new Error(`No payload found for transaction type: ${transactionType}`);
  }

  return result.rows[0].payload_json;
};

export const getSchemaByTransactionType = async (
  transactionType: string,
  tenantId: string,
): Promise<{ schema: unknown; mapping: unknown }> => {
  if (!transactionType || !tenantId) {
    throw new Error('Transaction type and tenant ID are required');
  }

  const query = `
    SELECT schema, mapping
    FROM tcs_config
    WHERE transaction_type = $1 AND tenant_id = $2
  `;

  const result = await handlePostExecuteSqlStatement<{ schema: unknown; mapping: unknown }>(
    { text: query, values: [transactionType, tenantId] } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    throw new Error(`No config found for transaction type: ${transactionType}`);
  }

  return { schema: result.rows[0].schema, mapping: result.rows[0].mapping };
};

export const createTransactionTypeTable = async (transactionType: string): Promise<void> => {
  const query = `
    CREATE TABLE IF NOT EXISTS "${transactionType}" (
      document JSONB NOT NULL,
      creDtTm TEXT,
      messageId TEXT,
      endToEndId TEXT,
      debtorAccountId TEXT,
      creditorAccountId TEXT,
      tenantId TEXT
    );
  `;

  await handlePostExecuteSqlStatement({ text: query, values: [] } satisfies PgQueryConfig, 'raw_history');
};

export const createTazamaDataModelTable = async (tableName: string): Promise<void> => {
  const query = `
    CREATE TABLE IF NOT EXISTS "${tableName}" (
      _key text PRIMARY KEY,
      data jsonb NOT NULL,
      tenantId text,
      creDtTm text
    );
  `;

  await handlePostExecuteSqlStatement({ text: query, values: [] } satisfies PgQueryConfig, 'event_history');
};

export const updateConfigByStatus = async (id: string, status?: string): Promise<number> => {
  const query = `
    UPDATE tcs_config
    SET status = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING id;
  `;

  const result = await handlePostExecuteSqlStatement<{ id: number }>(
    { text: query, values: [status, id] } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    throw new Error(`No config found with id: ${id}`);
  }

  return result.rows.length;
};
