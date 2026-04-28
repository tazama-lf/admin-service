// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { ConfigStatus, ContentType, type FieldMapping, type FunctionDefinition, type JSONSchema, type Config } from '@tazama-lf/tcs-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { ConfigData, ConfigRow } from '../../interface/config.interface';
import { validateTableName } from '../../utils/enrichment-utils';

export type { ConfigData, ConfigRow };

const mapRowToConfig = (row: ConfigRow): Config => {
  const mapped = {
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
    relatedTransaction: row.related_transaction,
  };

  return mapped as unknown as Config;
};

export const createConfig = async (config: ConfigData, id?: number): Promise<number> => {
  const isXml = config.contentType === ContentType.XML;
  const payloadColumn = isXml ? 'payload_xml' : 'payload_json';
  const payloadPlaceholder = isXml ? '$15::xml' : '$15';
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
        schema, mapping, functions, status, tenant_id, created_by, publishing_status, related_transaction, ${payloadColumn}
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, ${payloadPlaceholder})
      RETURNING id
    `
    : `
      INSERT INTO tcs_config (
        msg_fam, transaction_type, endpoint_path, version, content_type,
        schema, mapping, functions, status, tenant_id, created_by, publishing_status, related_transaction, ${payloadColumn}
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, ${isXml ? '$14::xml' : '$14'})
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
        config.relatedTransaction ?? null,
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
        config.relatedTransaction ?? null,
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
      payload_xml, payload_json, created_at, updated_at, comments, related_transaction
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
       payload_xml, payload_json, created_at, updated_at, comments, related_transaction
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
  return {
    data: dataResult.rows.map(mapRowToConfig),
    total,
    limit,
    offset,
  };
};

export const updateConfig = async (
  id: number,
  tenantId: string,
  updates: Partial<Config> & { relatedTransaction?: string; related_transaction?: string },
): Promise<Config> => {
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
  if (updates.schema !== undefined) {
    setClauses.push(`schema = $${paramIndex++}`);
    values.push(JSON.stringify(updates.schema));
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
  const relatedTransactionUpdate = updates.relatedTransaction ?? updates.related_transaction;
  if (relatedTransactionUpdate !== undefined) {
    setClauses.push(`related_transaction = $${paramIndex++}`);
    values.push(relatedTransactionUpdate);
  }

  if (setClauses.length === 0) {
    throw new Error('No fields to update');
  }

  setClauses.push('updated_at = NOW()');

  // Optimistic lock: update only when updated_at still matches the token returned by the previous read.
  const whereClause = `WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} AND updated_at = $${paramIndex + 2}::timestamptz`;

  const query = `
    UPDATE tcs_config
    SET ${setClauses.join(', ')}
    ${whereClause}
    RETURNING id, msg_fam, transaction_type, endpoint_path, version, content_type,
              schema, payload_xml, payload_json, comments, mapping, functions,
              status, publishing_status, created_at, updated_at, tenant_id, created_by, related_transaction
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
    related_transaction?: string;
  }

  const result = await handlePostExecuteSqlStatement<UpdateConfigRow>({ text: query, values } satisfies PgQueryConfig, 'configuration');

  if (result.rows.length === 0) {
    throw new Error('Configuration not found');
  }

  const [row] = result.rows;
  const updatedConfig = {
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
    relatedTransaction: row.related_transaction,
  };

  return updatedConfig as unknown as Config;
};

export const findAllTransactionTypes = async (tenantId: string): Promise<Array<Record<string, unknown>>> => {
  const query = `
    SELECT DISTINCT transaction_type, endpoint_path
    FROM tcs_config
    WHERE tenant_id = $1
      AND (
        (status = 'STATUS_04_APPROVED') 
        OR 
        (status = 'STATUS_06_EXPORTED')
      )
    ORDER BY transaction_type
  `;

  const result = await handlePostExecuteSqlStatement<{ transaction_type: string; endpoint_path: string }>(
    { text: query, values: [tenantId] } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows.map((row) => row);
};

export const getPayloadByTransactionType = async (transactionType: string, tenantId: string, version: string): Promise<unknown> => {
  if (!transactionType || !tenantId || !version) {
    throw new Error('Transaction type, tenant ID, and version are required');
  }
  const query = `
    SELECT 
      content_type,
      payload_xml,
      payload_json
    FROM tcs_config
    WHERE transaction_type = $1 AND tenant_id = $2 AND version = $3
  `;

  const result = await handlePostExecuteSqlStatement<{ content_type: ContentType; payload_xml: string | null; payload_json: unknown }>(
    { text: query, values: [transactionType, tenantId, version] } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    throw new Error('Configuration not found');
  }
  return result.rows[0].content_type === ContentType.XML ? result.rows[0].payload_xml : result.rows[0].payload_json;
};

export const getSchemaByTransactionType = async (
  transactionType: string,
  version: string,
  tenantId: string,
): Promise<{ schema: unknown; mapping: unknown; content_type: string; payload_xml: string | null; payload_json: unknown }> => {
  if (!transactionType || !version || !tenantId) {
    throw new Error('Transaction type, version, and tenant ID are required');
  }

  const query = `
    SELECT 
      schema, 
      mapping, 
      content_type,
      payload_xml,
      payload_json
    FROM tcs_config
    WHERE transaction_type = $1 AND version = $2 AND tenant_id = $3
  `;

  const result = await handlePostExecuteSqlStatement<{
    schema: unknown;
    mapping: unknown;
    content_type: string;
    payload_xml: string | null;
    payload_json: unknown;
  }>({ text: query, values: [transactionType, version, tenantId] } satisfies PgQueryConfig, 'configuration');

  if (result.rows.length === 0) {
    throw new Error('Configuration not found');
  }

  return {
    schema: result.rows[0].schema,
    mapping: result.rows[0].mapping,
    content_type: result.rows[0].content_type,
    payload_xml: result.rows[0].payload_xml,
    payload_json: result.rows[0].payload_json,
  };
};

export const createTransactionTypeTable = async (transactionType: string): Promise<void> => {
  const safeTableName = transactionType.replace(/[^a-zA-Z0-9_]/g, '_');
  validateTableName(safeTableName);
  const query = `
    CREATE TABLE IF NOT EXISTS "${safeTableName}" (
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
  const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
  validateTableName(safeTableName);
  const query = `
    CREATE TABLE IF NOT EXISTS "${safeTableName}" (
      _key text PRIMARY KEY,
      data jsonb NOT NULL,
      tenantId text,
      creDtTm text
    );
  `;

  await handlePostExecuteSqlStatement({ text: query, values: [] } satisfies PgQueryConfig, 'event_history');
};

export const updateConfigByStatus = async (id: string, status: string, tenantId: string): Promise<number> => {
  if (!status) {
    throw new Error('Status is required and cannot be null or undefined');
  }

  const query = `
    UPDATE tcs_config
    SET status = $1, updated_at = NOW()
    WHERE id = $2 AND tenant_id = $3
    RETURNING id;
  `;

  const result = await handlePostExecuteSqlStatement<{ id: number }>(
    { text: query, values: [status, id, tenantId] } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    throw new Error('Configuration not found');
  }

  return result.rows.length;
};

export const getRelatedTransactions = async (tenantId: string): Promise<string[]> => {
  const query = `
    SELECT DISTINCT related_transaction
    FROM tcs_config
    WHERE tenant_id = $1
      AND related_transaction IS NOT NULL
  `;

  const result = await handlePostExecuteSqlStatement<{ related_transaction: string }>(
    { text: query, values: [tenantId] } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows.map((row) => row.related_transaction);
};

export interface MaskTuple {
  tenant_id: string;
  txtp: string;
  txtp_version: string;
  endpoint_path: string;
}

export const findActiveConfigsByTuples = async (tuples: MaskTuple[]): Promise<MaskTuple[]> => {
  if (tuples.length === 0) return [];

  const values: string[] = [];
  const rowPlaceholders = tuples.map((t, i) => {
    const base = i * 3;
    values.push(t.tenant_id, t.txtp, t.txtp_version);
    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  });

  const query = `
    SELECT DISTINCT tenant_id, transaction_type AS txtp, version AS txtp_version, endpoint_path
    FROM tcs_config
    WHERE publishing_status = 'active'
      AND (tenant_id, transaction_type, version) IN (${rowPlaceholders.join(', ')})
  `;

  const result = await handlePostExecuteSqlStatement<MaskTuple>({ text: query, values } satisfies PgQueryConfig, 'configuration');

  return result.rows;
};
