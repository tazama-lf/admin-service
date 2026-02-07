// SPDX-License-Identifier: Apache-2.0
import { ConfigStatus, ContentType, type FieldMapping, type FunctionDefinition, type JSONSchema, type Config } from '@tazama-lf/tcs-lib';
import { loggerService } from '..';
import { createConfig, findConfigById, findConfigsByStatus, updateConfig } from '../repositories/configuration/tcs.config.repository';

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
export const handleFindConfigByID = async (id: string, tenantId: string): Promise<ConfigResponse> => {
  try {
    const configId = parseInt(id);

    loggerService.log(`Started handling get request for config ID: ${configId} for tenant: ${tenantId}.`);

    const config = await findConfigById(configId, tenantId);

    if (!config) {
      throw new Error('Failed to get config - no config found');
    }

    loggerService.log('Config was retrieved successfully.');

    return config as ConfigResponse;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: getting config with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleGetAllConfigs = async (
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
  try {
    loggerService.log(`Started handling get all configs request for tenant: ${tenantId} with limit: ${limit}, offset: ${offset}`);

    const result = await findConfigsByStatus(limit, offset, filters, tenantId);

    loggerService.log(`Successfully retrieved ${result.data.length} configs out of ${result.total} total`);

    return result;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error: getting all configs with error message: ${errorMessage.message}`, 'handleGetAllConfigs');
    throw new Error(errorMessage.message);
  }
};

export const handleUpdateConfig = async (id: number, tenantId: string, updates: Partial<Config>): Promise<Config> => {
  try {
    loggerService.log(`Started handling update config request for ID: ${id}, tenant: ${tenantId}`);

    const existingConfig = await findConfigById(id, tenantId);
    if (!existingConfig) {
      throw new Error(`Config with id ${id} not found`);
    }

    await updateConfig(id, tenantId, updates);
    const updatedConfig = await findConfigById(id, tenantId);

    if (!updatedConfig) {
      throw new Error('Failed to retrieve updated config');
    }

    loggerService.log(`Successfully updated config ID: ${id}`);
    return updatedConfig;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error: updating config with error message: ${errorMessage.message}`, 'handleUpdateConfig');
    throw new Error(errorMessage.message);
  }
};

export const handleUpdatePublishingStatus = async (
  id: number,
  tenantId: string,
  publishingStatus: 'active' | 'inactive',
): Promise<Config> => {
  try {
    loggerService.log(`[${tenantId}] Started updating publishing status to '${publishingStatus}' for config ${id}`);

    const existingConfig = await findConfigById(id, tenantId);
    if (!existingConfig) {
      throw new Error(`Config ${id} not found. Publishers can only manage configs from their own tenant (${tenantId}).`);
    }

    await updateConfig(id, tenantId, { publishing_status: publishingStatus });

    loggerService.log(`[${tenantId}] Publishing status updated to '${publishingStatus}' for config ${id}`);

    return { ...existingConfig, publishing_status: publishingStatus };
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error: updating publishing status with error message: ${errorMessage.message}`, 'handleUpdatePublishingStatus');
    throw new Error(errorMessage.message);
  }
};
