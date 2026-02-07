// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { ConfigStatus, ContentType, type FieldMapping, type FunctionDefinition, type JSONSchema, type Config } from '@tazama-lf/tcs-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';

export interface ConfigData {
  id?: number;
  msgFam: string;
  transactionType: string;
  endpointPath: string;
  version: string;
  contentType: ContentType;
  schema: JSONSchema;
  mapping?: FieldMapping[];
  functions?: FunctionDefinition[];
  status?: ConfigStatus;
  tenantId: string;
  createdBy: string;
  publishing_status?: string;
  payload?: string | object;
  creDtTm?: string;
}

const convertStatusToDatabase = (status: ConfigStatus): string => status.toLowerCase().replace('_', '-');

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
        convertStatusToDatabase(config.status ?? ConfigStatus.IN_PROGRESS),
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
        convertStatusToDatabase(config.status ?? ConfigStatus.IN_PROGRESS),
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

  const result = await handlePostExecuteSqlStatement<Config>(
    {
      text: query,
      values,
    } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
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

  // Count query
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

  // Data query with pagination
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

  const dataResult = await handlePostExecuteSqlStatement<Config>(
    {
      text: dataQuery,
      values: [...queryParams, limit, offset] as Array<string | string[] | number>,
    } satisfies PgQueryConfig,
    'configuration',
  );

  return {
    data: dataResult.rows,
    total,
    limit,
    offset,
  };
};

export const updateConfig = async (id: number, tenantId: string, updates: Partial<Config>): Promise<void> => {
  const setClauses: string[] = [];
  const values: Array<string | number | object> = [];
  let paramIndex = 1;

  // Build dynamic SET clause
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      setClauses.push(`${key} = $${paramIndex}`);
      // Handle JSON fields
      if (typeof value === 'object' && value !== null) {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    return; // No updates to perform
  }

  // Add updated_at timestamp
  setClauses.push('updated_at = NOW()');

  const query = `
    UPDATE tcs_config
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
  `;

  values.push(id, tenantId);

  await handlePostExecuteSqlStatement({ text: query, values } satisfies PgQueryConfig, 'configuration');
};

export const findAllTransactionTypes = async (tenantId: string): Promise<string[]> => {
  const query = `
    SELECT DISTINCT transaction_type
    FROM tcs_config
    WHERE tenant_id = $1
    ORDER BY transaction_type
  `;

  const result = await handlePostExecuteSqlStatement<{ transaction_type: string }>(
    { text: query, values: [tenantId] } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows.map((row) => row.transaction_type);
};
