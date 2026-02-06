// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { ConfigStatus, ContentType, type FieldMapping, type FunctionDefinition, type JSONSchema } from '@tazama-lf/tcs-lib';
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
