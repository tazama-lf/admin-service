// SPDX-License-Identifier: Apache-2.0
import type { Config, ContentType, FieldMapping, FunctionDefinition, JSONSchema, ConfigStatus } from '@tazama-lf/tcs-lib';

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
  relatedTransaction?: string;
}

export interface ConfigRow {
  id: number;
  msg_fam: string;
  transaction_type: string;
  endpoint_path: string;
  version: string;
  content_type: ContentType;
  schema: string | JSONSchema;
  mapping?: string | FieldMapping[];
  functions?: string | FunctionDefinition[];
  status: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  comments: string;
  publishing_status: 'active' | 'inactive';
  payload_xml?: string;
  payload_json?: Record<string, unknown>;
  related_transaction?: string;
}

export type ConfigInput = Partial<ConfigData>;
export type ConfigResponse = Config;
