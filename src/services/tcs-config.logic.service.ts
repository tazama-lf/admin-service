// SPDX-License-Identifier: Apache-2.0
import { ConfigStatus, ContentType, type FieldMapping, type FunctionDefinition, type JSONSchema } from '@tazama-lf/tcs-lib';
import { loggerService } from '..';
import { createConfig } from '../repositories/configuration/tcs.config.repository';

export interface ConfigRequest {
  msgFam: string;
  transactionType: string;
  endpointPath: string;
  version: string;
  contentType?: ContentType;
  schema: JSONSchema;
  mapping?: FieldMapping[];
  functions?: FunctionDefinition[];
  createdBy: string;
  publishing_status?: string;
  payload?: string | object;
}

export interface ConfigResponse {
  id: number;
  msgFam: string;
  transactionType: string;
  endpointPath: string;
  version: string;
  contentType: ContentType;
  schema: JSONSchema;
  mapping?: FieldMapping[];
  functions?: FunctionDefinition[];
  status: ConfigStatus;
  tenantId: string;
  createdBy: string;
  creDtTm: string;
  publishing_status: string;
}

export const handlePostConfig = async (
  config: Record<string, unknown>,
  tenantId: string,
): Promise<{ message: string; result: ConfigResponse }> => {
  try {
    const userId = (config.createdBy as string) || 'system';

    loggerService.log(`Started handling post request of config executed by ${userId}.`);

    const nowDateTime = new Date().toISOString();

    const newConfig = {
      msgFam: config.msgFam as string,
      transactionType: config.transactionType as string,
      endpointPath: config.endpointPath as string,
      version: config.version as string,
      contentType: (config.contentType as ContentType) ?? ContentType.JSON,
      schema: config.schema as JSONSchema,
      mapping: config.mapping as FieldMapping[] | undefined,
      functions: config.functions as FunctionDefinition[] | undefined,
      status: ConfigStatus.IN_PROGRESS,
      tenantId,
      createdBy: userId,
      publishing_status: (config.publishing_status as string) ?? 'inactive',
      payload: config.payload as string | object | undefined,
      creDtTm: nowDateTime,
    };

    const createdConfigId = await createConfig(newConfig);

    if (!createdConfigId) {
      throw new Error('Failed to create config - no ID returned');
    }

    const response: ConfigResponse = {
      id: createdConfigId,
      msgFam: newConfig.msgFam,
      transactionType: newConfig.transactionType,
      endpointPath: newConfig.endpointPath,
      version: newConfig.version,
      contentType: newConfig.contentType,
      schema: newConfig.schema,
      mapping: newConfig.mapping,
      functions: newConfig.functions,
      status: newConfig.status,
      tenantId: newConfig.tenantId,
      createdBy: newConfig.createdBy,
      creDtTm: newConfig.creDtTm,
      publishing_status: newConfig.publishing_status,
    };

    loggerService.log('New config was saved successfully.');

    return {
      message: 'New config was saved successfully.',
      result: response,
    };
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: posting config with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};
// export const handleFindConfigByID = async (
//   configId: number,
//   tenantId: string,
// ): Promise<ConfigResponse | null> => {
//   try {
//     loggerService.log(`Started handling get request for config ID: ${configId} for tenant: ${tenantId}.`);
//   }
//   }
