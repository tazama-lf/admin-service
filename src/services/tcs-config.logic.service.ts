// SPDX-License-Identifier: Apache-2.0
import { loggerService } from '..';
import {
  type Config,
  type AddMappingDto,
  type AddFunctionDto,
  ConfigStatus,
  ContentType,
  type FieldMapping,
  type FunctionDefinition,
} from '@tazama-lf/tcs-lib';
import {
  createConfig,
  findConfigById,
  findConfigsByStatus,
  updateConfig,
  createTransactionTypeTable,
  createTazamaDataModelTable,
  updateConfigByStatus,
  findAllTransactionTypes,
  getPayloadByTransactionType,
  getSchemaByTransactionType,
  getRelatedTransactions,
} from '../repositories/configuration/tcs.config.repository';
import type { ConfigData, ConfigInput, ConfigResponse } from '../interface/config.interface';

export const handlePostConfig = async (config: ConfigInput, tenantId: string): Promise<{ message: string; result: ConfigResponse }> => {
  try {
    const userId = config.createdBy ?? 'system';

    loggerService.log(`Started handling post request of config executed by ${userId}.`);

    const nowDateTime = new Date().toISOString();

    if (!config.msgFam || !config.transactionType || !config.endpointPath || !config.version || !config.schema) {
      throw new Error('Missing required fields: msgFam, transactionType, endpointPath, version, or schema');
    }

    const newConfig: ConfigData = {
      msgFam: config.msgFam,
      transactionType: config.transactionType,
      endpointPath: config.endpointPath,
      version: config.version,
      contentType: config.contentType ?? ContentType.JSON,
      schema: config.schema,
      mapping: config.mapping,
      functions: config.functions,
      status: config.status ?? ConfigStatus.IN_PROGRESS,
      tenantId,
      createdBy: userId,
      publishing_status: config.publishing_status ?? 'inactive',
      payload: config.payload,
      creDtTm: nowDateTime,
      relatedTransaction: config.relatedTransaction,
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
      status: newConfig.status ?? ConfigStatus.IN_PROGRESS,
      tenantId: newConfig.tenantId,
      createdBy: newConfig.createdBy,
      publishing_status: (newConfig.publishing_status ?? 'inactive') as 'active' | 'inactive',
    };

    loggerService.log('New config was saved successfully.');

    return {
      message: 'New config was saved successfully.',
      result: response,
    };
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: posting config with error message: ${errorMessage.message}`);
    throw new Error('Failed to create configuration');
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

    return config;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: getting config with error message: ${errorMessage.message}`);
    throw new Error('Failed to retrieve configuration');
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
    throw new Error('Failed to retrieve configurations');
  }
};

export const handleUpdateConfig = async (id: number, tenantId: string, updates: Partial<Config>): Promise<Config> => {
  try {
    loggerService.log(`Started handling update config request for ID: ${id}, tenant: ${tenantId}`);

    const existingConfig = await findConfigById(id, tenantId);
    if (!existingConfig) {
      loggerService.error(`Config with id ${id} not found for tenant ${tenantId}`, 'handleUpdateConfig');
      throw new Error('Configuration not found');
    }

    const updatedConfig = await updateConfig(id, tenantId, updates, existingConfig.updatedAt);

    loggerService.log(`Successfully updated config ID: ${id}`);
    return updatedConfig;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error: updating config with error message: ${errorMessage.message}`, 'handleUpdateConfig');
    throw new Error('Failed to update configuration');
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
      loggerService.error(`Config ${id} not found for tenant ${tenantId}`, 'handleUpdatePublishingStatus');
      throw new Error('Configuration not found');
    }

    const updatedConfig = await updateConfig(id, tenantId, { publishing_status: publishingStatus });

    loggerService.log(`[${tenantId}] Publishing status updated to '${publishingStatus}' for config ${id}`);

    return updatedConfig;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error: updating publishing status with error message: ${errorMessage.message}`, 'handleUpdatePublishingStatus');
    throw new Error('Failed to update publishing status');
  }
};

export const handleCreateTransactionTypeTable = async (transactionType: string): Promise<void> => {
  try {
    loggerService.log(`Creating table for transaction type: ${transactionType}`);

    if (!transactionType) {
      throw new Error('Transaction type is required');
    }

    await createTransactionTypeTable(transactionType);

    loggerService.log(`Successfully created table for transaction type: ${transactionType}`);
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error creating transaction type table: ${errorMessage.message}`, 'handleCreateTransactionTypeTable');
    throw new Error('Failed to create transaction type table');
  }
};

export const handleCreateTazamaDataModelTable = async (tableName: string): Promise<void> => {
  try {
    loggerService.log(`Creating Tazama data model table: ${tableName}`);

    if (!tableName) {
      throw new Error('Table name is required');
    }

    await createTazamaDataModelTable(tableName);

    loggerService.log(`Successfully created Tazama data model table: ${tableName}`);
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error creating Tazama data model table: ${errorMessage.message}`, 'handleCreateTazamaDataModelTable');
    throw new Error('Failed to create data model table');
  }
};

export const handleUpdateConfigByStatus = async (id: string, status: string, tenantId: string): Promise<number> => {
  try {
    loggerService.log(`Updating config ${id} status to: ${status} for tenant: ${tenantId}`);

    const updatedCount = await updateConfigByStatus(id, status, tenantId);
    loggerService.log(`Successfully updated config ${id} status`);

    return updatedCount;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error updating config by status: ${errorMessage.message}`, 'handleUpdateConfigByStatus');
    throw new Error('Failed to update configuration status');
  }
};

export const handleAddMapping = async (id: number, tenantId: string, mappingDto: AddMappingDto): Promise<Config> => {
  try {
    loggerService.log(`Adding mapping to config ${id} for tenant ${tenantId}`);

    const config = await findConfigById(id, tenantId);

    if (!config) {
      throw new Error('Config not found');
    }

    const normalizedSource = Array.isArray(mappingDto.source) ? mappingDto.source : mappingDto.source ? [mappingDto.source] : undefined;

    const newMapping: FieldMapping = {
      ...mappingDto,
      source: normalizedSource,
      destination: mappingDto.destination as string | string[],
      type: mappingDto.type,
    };

    const updatedMappings = [...(config.mapping ?? []), newMapping];

    const updatedConfig = await updateConfig(id, tenantId, { mapping: updatedMappings }, config.updatedAt);

    loggerService.log(`Successfully added mapping to config ${id}`);
    return updatedConfig;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error adding mapping: ${errorMessage.message}`, 'handleAddMapping');
    throw new Error('Failed to add mapping');
  }
};

export const handleRemoveMapping = async (id: number, tenantId: string, mappingIndex: number): Promise<Config> => {
  try {
    loggerService.log(`Removing mapping at index ${mappingIndex} from config ${id} for tenant ${tenantId}`);

    const config = await findConfigById(id, tenantId);

    if (!config) {
      throw new Error('Config not found');
    }

    if (!config.mapping || mappingIndex < 0 || mappingIndex >= config.mapping.length) {
      throw new Error('Invalid mapping index');
    }

    const updatedMappings = config.mapping.filter((_item, idx) => idx !== mappingIndex);

    const updatedConfig = await updateConfig(id, tenantId, { mapping: updatedMappings.length > 0 ? updatedMappings : [] }, config.updatedAt);

    loggerService.log(`Successfully removed mapping from config ${id}`);
    return updatedConfig;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error removing mapping: ${errorMessage.message}`, 'handleRemoveMapping');
    throw new Error('Failed to remove mapping');
  }
};

export const handleAddFunction = async (id: number, tenantId: string, functionDto: AddFunctionDto): Promise<Config> => {
  try {
    loggerService.log(`Adding function to config ${id} for tenant ${tenantId}`);

    const config = await findConfigById(id, tenantId);

    if (!config) {
      throw new Error('Config not found');
    }

    const newFunction: FunctionDefinition = {
      functionName: functionDto.functionName,
      params: functionDto.params ?? [],
      tableName: functionDto.tableName ?? '',
      columns: functionDto.columns ?? [],
    };

    const updatedFunctions = [...(config.functions ?? []), newFunction];

    const updatedConfig = await updateConfig(id, tenantId, { functions: updatedFunctions }, config.updatedAt);

    loggerService.log(`Successfully added function to config ${id}`);
    return updatedConfig;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error adding function: ${errorMessage.message}`, 'handleAddFunction');
    throw new Error('Failed to add function');
  }
};

export const handleRemoveFunction = async (id: number, tenantId: string, functionIndex: number): Promise<Config> => {
  try {
    loggerService.log(`Removing function at index ${functionIndex} from config ${id} for tenant ${tenantId}`);

    const config = await findConfigById(id, tenantId);

    if (!config) {
      throw new Error('Config not found');
    }

    if (!config.functions || functionIndex < 0 || functionIndex >= config.functions.length) {
      throw new Error('Invalid function index');
    }

    const updatedFunctions = config.functions.filter((_item, idx) => idx !== functionIndex);

    const updatedConfig = await updateConfig(id, tenantId, { functions: updatedFunctions.length > 0 ? updatedFunctions : [] }, config.updatedAt);

    loggerService.log(`Successfully removed function from config ${id}`);
    return updatedConfig;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error removing function: ${errorMessage.message}`, 'handleRemoveFunction');
    throw new Error('Failed to remove function');
  }
};

export const handleGetAllTransactionTypes = async (tenantId: string): Promise<string[]> => {
  try {
    loggerService.log(`Getting all transaction types for tenant: ${tenantId}`);

    const transactionTypes = await findAllTransactionTypes(tenantId);

    loggerService.log(`Successfully retrieved ${transactionTypes.length} transaction types`);
    return transactionTypes;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error getting transaction types: ${errorMessage.message}`, 'handleGetAllTransactionTypes');
    throw new Error('Failed to retrieve transaction types');
  }
};

export const handleGetPayloadByTransactionType = async (transactionType: string, tenantId: string, version: string): Promise<unknown> => {
  try {
    loggerService.log(`Getting payload for transaction type: ${transactionType}, tenant: ${tenantId}, version: ${version}`);

    const payload = await getPayloadByTransactionType(transactionType, tenantId, version);

    loggerService.log(`Successfully retrieved payload for transaction type: ${transactionType}`);
    return payload;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error getting payload by transaction type: ${errorMessage.message}`, 'handleGetPayloadByTransactionType');
    throw new Error('Failed to retrieve payload');
  }
};

export const handleGetConfigByTransactionType = async (transactionType: string, version: string, tenantId: string): Promise<unknown> => {
  try {
    loggerService.log(`Getting config for transaction type: ${transactionType}, version: ${version}, tenant: ${tenantId}`);

    const config = await getSchemaByTransactionType(transactionType, version, tenantId);

    
    return config;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(
      `No config found for txtp: ${transactionType}, version: ${version}, tenant: ${tenantId}. Error: ${errorMessage.message}`,
      'handleGetConfigByTransactionType',
    );
    throw new Error('Configuration not found');
  }
};

export const handleGetRelatedTransactions = async (tenantId: string): Promise<string[]> => {
  try {
    loggerService.log(`Started handling get related transactions request for tenant ${tenantId}.`);

    const relatedTransactions = await getRelatedTransactions(tenantId);

    loggerService.log('Related transactions retrieved successfully.');

    return relatedTransactions;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: getting related transactions with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};
