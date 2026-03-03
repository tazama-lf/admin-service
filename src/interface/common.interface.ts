// SPDX-License-Identifier: Apache-2.0

export interface RepositoryFilter {
  field: string;
  value: string;
}

export interface ListResult<T> {
  data: T[];
  total: number;
}

export interface PaginatedListResult<T> extends ListResult<T> {
  limit: number;
  offset: number;
}

export interface OperationResult {
  success: boolean;
  message: string;
}

export interface RowCountResult {
  rowCount: number;
}

export interface CodeMessageResult {
  code: number;
  message: string;
}

export interface CodeResult<T = string> {
  code: number;
  result?: T;
}

export interface MessageResult<T> {
  message: string;
  result: T;
}

export interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  response?: {
    message: string;
    statusCode?: number;
  };
}

export interface QueryResult<T> {
  result: T;
}

export interface ConfigurationWrapper<T> {
  configuration: T | null;
}

/**
 * Tenant and timestamp result
 */
export interface TenantTimestampResult {
  tenant_id: string;
  updated_at: string;
}

export interface SchemaMapPayloadResult {
  schema: unknown;
  mapping: unknown;
  payload: unknown;
}

export interface CategoryFilter {
  category: string;
}
