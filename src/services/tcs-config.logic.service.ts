// SPDX-License-Identifier: Apache-2.0
import {
  ConfigStatus,
  ContentType,
  type FieldMapping,
  type FunctionDefinition,
  type JSONSchema,
  type Config,
  type AddMappingDto,
  type AddFunctionDto,
} from '@tazama-lf/tcs-lib';
import { loggerService } from '..';
import {
  createConfig,
  findConfigById,
  findConfigsByStatus,
  updateConfig,
  createTransactionTypeTable as repoCreateTransactionTypeTable,
  createTazamaDataModelTable as repoCreateTazamaDataModelTable,
  updateConfigByStatus as repoUpdateConfigByStatus,
  addMappingToConfig,
  removeMappingFromConfig,
  addFunctionToConfig,
  removeFunctionFromConfig,
} from '../repositories/configuration/tcs.config.repository';

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

    const updatedConfig = await updateConfig(id, tenantId, updates);

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

    const updatedConfig = await updateConfig(id, tenantId, { publishing_status: publishingStatus });

    loggerService.log(`[${tenantId}] Publishing status updated to '${publishingStatus}' for config ${id}`);

    return updatedConfig;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error: updating publishing status with error message: ${errorMessage.message}`, 'handleUpdatePublishingStatus');
    throw new Error(errorMessage.message);
  }
};

export const handleCreateTransactionTypeTable = async (transactionType: string): Promise<void> => {
  try {
    loggerService.log(`Creating table for transaction type: ${transactionType}`);

    if (!transactionType) {
      throw new Error('Transaction type is required');
    }

    await repoCreateTransactionTypeTable(transactionType);

    loggerService.log(`Successfully created table for transaction type: ${transactionType}`);
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error creating transaction type table: ${errorMessage.message}`, 'handleCreateTransactionTypeTable');
    throw new Error(errorMessage.message);
  }
};

export const handleCreateTazamaDataModelTable = async (tableName: string): Promise<void> => {
  try {
    loggerService.log(`Creating Tazama data model table: ${tableName}`);

    if (!tableName) {
      throw new Error('Table name is required');
    }

    await repoCreateTazamaDataModelTable(tableName);

    loggerService.log(`Successfully created Tazama data model table: ${tableName}`);
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error creating Tazama data model table: ${errorMessage.message}`, 'handleCreateTazamaDataModelTable');
    throw new Error(errorMessage.message);
  }
};

export const handleUpdateConfigByStatus = async (id: string, status?: string): Promise<number> => {
  try {
    loggerService.log(`Updating config ${id} status to: ${status}`);

    const updatedCount = await repoUpdateConfigByStatus(id, status);

    loggerService.log(`Successfully updated config ${id} status`);

    return updatedCount;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error updating config by status: ${errorMessage.message}`, 'handleUpdateConfigByStatus');
    throw new Error(errorMessage.message);
  }
};

export const handleAddMapping = async (id: number, tenantId: string, mappingDto: AddMappingDto): Promise<Config> => {
  try {
    loggerService.log(`Adding mapping to config ${id} for tenant ${tenantId}`);

    const normalizedSource = Array.isArray(mappingDto.source) ? mappingDto.source : mappingDto.source ? [mappingDto.source] : undefined;

    const newMapping: FieldMapping = {
      ...mappingDto,
      source: normalizedSource,
      destination: mappingDto.destination as string | string[],
      type: mappingDto.type,
    };

    const updatedConfig = await addMappingToConfig(id, tenantId, newMapping);

    loggerService.log(`Successfully added mapping to config ${id}`);
    return updatedConfig;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error adding mapping: ${errorMessage.message}`, 'handleAddMapping');
    throw new Error(errorMessage.message);
  }
};

export const handleRemoveMapping = async (id: number, tenantId: string, mappingIndex: number): Promise<Config> => {
  try {
    loggerService.log(`Removing mapping at index ${mappingIndex} from config ${id} for tenant ${tenantId}`);

    const updatedConfig = await removeMappingFromConfig(id, tenantId, mappingIndex);

    loggerService.log(`Successfully removed mapping from config ${id}`);
    return updatedConfig;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error removing mapping: ${errorMessage.message}`, 'handleRemoveMapping');
    throw new Error(errorMessage.message);
  }
};

export const handleAddFunction = async (id: number, tenantId: string, functionDto: AddFunctionDto): Promise<Config> => {
  try {
    loggerService.log(`Adding function to config ${id} for tenant ${tenantId}`);

    const newFunction: FunctionDefinition = {
      functionName: functionDto.functionName,
      params: functionDto.params ?? [],
      tableName: functionDto.tableName ?? '',
      columns: functionDto.columns ?? [],
    };

    const updatedConfig = await addFunctionToConfig(id, tenantId, newFunction);

    loggerService.log(`Successfully added function to config ${id}`);
    return updatedConfig;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error adding function: ${errorMessage.message}`, 'handleAddFunction');
    throw new Error(errorMessage.message);
  }
};

export const handleRemoveFunction = async (id: number, tenantId: string, functionIndex: number): Promise<Config> => {
  try {
    loggerService.log(`Removing function at index ${functionIndex} from config ${id} for tenant ${tenantId}`);

    const updatedConfig = await removeFunctionFromConfig(id, tenantId, functionIndex);

    loggerService.log(`Successfully removed function from config ${id}`);
    return updatedConfig;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error removing function: ${errorMessage.message}`, 'handleRemoveFunction');
    throw new Error(errorMessage.message);
  }
};
