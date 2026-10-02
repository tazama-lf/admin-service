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
  findConfigsByMsgFam,
  updateConfig,
  createTransactionTypeTable,
  createTazamaDataModelTable,
  updateConfigByStatus,
  findAllTransactionTypes,
  getPayloadByTransactionType,
  getSchemaByTransactionType,
  getSchemaByTransactionTypew3,
  getRelatedTransactions,
} from '../repositories/configuration/tcs.config.repository';
import type { ConfigData, ConfigInput, ConfigResponse } from '../interface/config.interface';
import { HttpException, HttpStatus } from '../utils/error';
import { handleGetDataModelJson } from './data-model.logic.service';

const mappingsHaveSameComposite = (mapping: FieldMapping, newMapping: FieldMapping): boolean =>
  JSON.stringify(mapping.source) === JSON.stringify(newMapping.source) &&
  JSON.stringify(mapping.destination) === JSON.stringify(newMapping.destination);

const normalizeSource = (source?: string | string[]): string[] | undefined =>
  Array.isArray(source) ? source : source ? [source] : undefined;

const normalizeDestination = (destination?: string | string[]): string[] =>
  Array.isArray(destination) ? destination : destination ? [destination] : [];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const XML_TAG_REGEX = /<[^>]+>/g;

const addXmlPathToJson = (root: Record<string, unknown>, path: string[]): void => {
  let current = root;

  path.forEach((segment) => {
    const nextValue = current[segment];
    if (isRecord(nextValue)) {
      current = nextValue;
      return;
    }

    const nextObject: Record<string, unknown> = {};
    current[segment] = nextObject;
    current = nextObject;
  });
};

const getXmlElementName = (tag: string): string => {
  const content = tag.slice(1, -1).trim().replace(/^\//, '').replace(/\/$/, '').trim();
  const [name = ''] = content.split(/\s+/);
  const [, localName = name] = name.split(':');
  return localName;
};

const parseXmlFieldTree = (xml: string): Record<string, unknown> => {
  const root: Record<string, unknown> = {};
  const stack: string[] = [];
  const sanitizedXml = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const tags = sanitizedXml.match(XML_TAG_REGEX) ?? [];

  for (const tag of tags) {
    if (tag.startsWith('<!') || tag.startsWith('</')) {
      if (tag.startsWith('</')) stack.pop();
      continue;
    }

    const elementName = getXmlElementName(tag);
    if (!elementName) continue;

    const currentPath = [...stack, elementName];
    addXmlPathToJson(root, currentPath);

    if (!tag.endsWith('/>')) stack.push(elementName);
  }

  return root;
};

interface MappingValidationConfig {
  contentType?: ContentType;
  payload?: unknown;
}

const getPayloadForSourceValidation = (config: MappingValidationConfig): { payload: unknown; label: string } => {
  if (config.contentType !== ContentType.XML) {
    return { payload: config.payload, label: 'payload_json' };
  }

  if (typeof config.payload !== 'string') {
    throw new HttpException('payload_xml not found', HttpStatus.BAD_REQUEST);
  }

  return { payload: parseXmlFieldTree(config.payload), label: 'payload_xml' };
};

const jsonPathExistsAtAnyLayer = (json: unknown, path: string): boolean => {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) return false;

  const hasPath = (value: unknown, remainingSegments: string[]): boolean => {
    if (remainingSegments.length === 0) {
      if (Array.isArray(value)) {
        return value.some((item) => isRecord(item));
      }
      return true;
    }

    if (Array.isArray(value)) {
      return value.some((item) => hasPath(item, remainingSegments));
    }

    if (!isRecord(value)) return false;

    const [nextSegment, ...rest] = remainingSegments;
    if (!Object.prototype.hasOwnProperty.call(value, nextSegment)) return false;

    return hasPath(value[nextSegment], rest);
  };

  const hasPathAtAnyLayer = (value: unknown): boolean => {
    if (hasPath(value, segments)) return true;

    if (Array.isArray(value)) {
      return value.some(hasPathAtAnyLayer);
    }

    if (!isRecord(value)) return false;

    return Object.values(value).some(hasPathAtAnyLayer);
  };

  return hasPathAtAnyLayer(json);
};

const validateMappingSourcesExistInPayload = (payload: unknown, source: string[] | undefined, payloadLabel: string): void => {
  if (!source?.length) return;

  const missingSources = source.filter((sourcePath) => !jsonPathExistsAtAnyLayer(payload, sourcePath));
  if (missingSources.length > 0) {
    throw new HttpException(`Mapping source does not exist in ${payloadLabel}: ${missingSources.join(', ')}`, HttpStatus.BAD_REQUEST);
  }
};

const validateMappingDestinationsExistInDataModel = (
  dataModelJson: Record<string, unknown> | null,
  destination?: string | string[],
): void => {
  const destinations = normalizeDestination(destination);
  if (destinations.length === 0) return;

  if (dataModelJson === null) {
    throw new HttpException('Data model JSON not found', HttpStatus.BAD_REQUEST);
  }

  const missingDestinations = destinations.filter((destinationPath) => !jsonPathExistsAtAnyLayer(dataModelJson, destinationPath));
  if (missingDestinations.length > 0) {
    throw new HttpException(
      `Mapping destination does not exist in data model JSON: ${missingDestinations.join(', ')}`,
      HttpStatus.BAD_REQUEST,
    );
  }
};

const validateMappingIsUnique = (existingMappings: FieldMapping[], newMapping: FieldMapping): void => {
  const newDestinations = normalizeDestination(newMapping.destination);
  const alreadyMappedDestinations = new Set<string>();

  for (const mapping of existingMappings) {
    if (mappingsHaveSameComposite(mapping, newMapping)) {
      throw new HttpException('Mapping with the same source and destination already exists', HttpStatus.CONFLICT);
    }

    normalizeDestination(mapping.destination).forEach((destination) => {
      if (newDestinations.includes(destination)) alreadyMappedDestinations.add(destination);
    });
  }

  if (alreadyMappedDestinations.size > 0) {
    throw new HttpException(`Mapping destination is already mapped: ${[...alreadyMappedDestinations].join(', ')}`, HttpStatus.CONFLICT);
  }
};

const validateMappings = async (mappings: FieldMapping[] | undefined, config: MappingValidationConfig, tenantId: string): Promise<void> => {
  if (!mappings?.length) return;

  const existingMappings: FieldMapping[] = [];
  const sourceValidationPayload = getPayloadForSourceValidation(config);
  const dataModelJson = await handleGetDataModelJson(tenantId);

  for (const mapping of mappings) {
    const normalizedMapping: FieldMapping = {
      ...mapping,
      source: normalizeSource(mapping.source as string | string[] | undefined),
    };

    validateMappingIsUnique(existingMappings, normalizedMapping);
    validateMappingSourcesExistInPayload(sourceValidationPayload.payload, normalizedMapping.source, sourceValidationPayload.label);
    validateMappingDestinationsExistInDataModel(dataModelJson, normalizedMapping.destination);

    existingMappings.push(normalizedMapping);
  }
};

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
      related_transaction: config.related_transaction,
    };

    await validateMappings(newConfig.mapping, newConfig, tenantId);

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
      related_transaction: newConfig.related_transaction,
    };

    loggerService.log('New config was saved successfully.');

    return {
      message: 'New config was saved successfully.',
      result: response,
    };
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }
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

export const handleGetConfigsByMsgFam = async (
  msgFam: string,
  tenantId: string,
  limit: number,
  offset: number,
  transactionType?: string,
): Promise<{ data: string[]; total: number; limit: number; offset: number }> => {
  try {
    loggerService.log(`Started handling get configs by msg_fam request for tenant: ${tenantId} with msg_fam: ${msgFam}`);

    const result = await findConfigsByMsgFam(msgFam, tenantId, limit, offset, transactionType);

    loggerService.log(`Successfully retrieved ${result.data.length} endpoint paths out of ${result.total} total for msg_fam: ${msgFam}`);

    return result;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error: getting configs by msg_fam with error message: ${errorMessage.message}`, 'handleGetConfigsByMsgFam');
    throw new Error('Failed to retrieve configurations by msg_fam');
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

    const mergedConfig = { ...existingConfig, ...updates };
    if (updates.mapping !== undefined || updates.payload !== undefined || updates.contentType !== undefined) {
      await validateMappings(mergedConfig.mapping, mergedConfig, tenantId);
    }

    const updatedConfig = await updateConfig(id, tenantId, updates, existingConfig.revision);
    loggerService.log(`Successfully updated config ID: ${id}`);
    return updatedConfig;
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }
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
    if (error instanceof HttpException) {
      loggerService.warn(`Conflict creating Tazama data model table "${tableName}": ${error.message}`, 'handleCreateTazamaDataModelTable');
      throw error;
    }
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

    const existingMappings = config.mapping ?? [];
    const normalizedSource = normalizeSource(mappingDto.source as string | string[] | undefined);

    const newMapping: FieldMapping = {
      ...mappingDto,
      source: normalizedSource,
      destination: mappingDto.destination as string | string[],
      type: mappingDto.type,
    };

    const updatedMappings = [...existingMappings, newMapping];
    await validateMappings(updatedMappings, config, tenantId);

    const updatedConfig = await updateConfig(id, tenantId, { mapping: updatedMappings }, config.revision);
    loggerService.log(`Successfully added mapping to config ${id}`);
    return updatedConfig;
  } catch (error) {
    if (error instanceof HttpException) throw error;
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

    const updatedConfig = await updateConfig(id, tenantId, { mapping: updatedMappings.length > 0 ? updatedMappings : [] }, config.revision);

    loggerService.log(`Successfully removed mapping from config ${id}`);
    return updatedConfig;
  } catch (error) {
    if (error instanceof HttpException) throw error;
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

    const updatedConfig = await updateConfig(id, tenantId, { functions: updatedFunctions }, config.revision);

    loggerService.log(`Successfully added function to config ${id}`);
    return updatedConfig;
  } catch (error) {
    if (error instanceof HttpException) throw error;
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

    const updatedConfig = await updateConfig(
      id,
      tenantId,
      { functions: updatedFunctions.length > 0 ? updatedFunctions : [] },
      config.revision,
    );
    loggerService.log(`Successfully removed function from config ${id}`);
    return updatedConfig;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    const errorMessage = error as { message: string };
    loggerService.error(`Error removing function: ${errorMessage.message}`, 'handleRemoveFunction');
    throw new Error('Failed to remove function');
  }
};

export const handleGetAllTransactionTypes = async (tenantId: string): Promise<Array<Record<string, unknown>>> => {
  try {
    loggerService.log(`Getting all transaction types for tenant: ${tenantId}`);

    const transactiondetails = await findAllTransactionTypes(tenantId);

    loggerService.log(`Successfully retrieved ${transactiondetails.length} transaction types`);
    return transactiondetails;
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

    const payload = (config.content_type as ContentType) === ContentType.XML ? config.payload_xml : config.payload_json;

    return {
      schema: config.schema,
      mapping: config.mapping,
      payload,
    };
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(
      `No config found for txtp: ${transactionType}, version: ${version}, tenant: ${tenantId}. Error: ${errorMessage.message}`,
      'handleGetConfigByTransactionType',
    );
    throw new Error('Configuration not found');
  }
};

export const handleGetConfigByTransactionTypew3 = async (transactionType: string, version: string, tenantId: string): Promise<unknown> => {
  try {
    loggerService.log(`Getting config for transaction type: ${transactionType}, version: ${version}, tenant: ${tenantId}`);

    const config = await getSchemaByTransactionTypew3(transactionType, version, tenantId);

    return config;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(
      `No config found for txtp: ${transactionType}, version: ${version}, tenant: ${tenantId}. Error: ${errorMessage.message}`,
      'handleGetConfigByTransactionTypew3',
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
