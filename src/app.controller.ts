import type { AccountCondition, EntityCondition } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config, AddMappingDto, AddFunctionDto } from '@tazama-lf/tcs-lib';
import * as util from 'node:util';
import { configuration, loggerService } from '.';
import type { ConditionRequest } from './interface/query';
import type { ITenantRequest } from './interface/ITenantRequest';
import {
  handleGetConditionsForAccount,
  handleGetConditionsForEntity,
  handlePostConditionAccount,
  handlePostConditionEntity,
  handleRefreshCache,
  handleUpdateExpiryDateForConditionsOfAccount,
  handleUpdateExpiryDateForConditionsOfEntity,
} from './services/event-flow.logic.service';
import {
  handlePostConfig,
  handleFindConfigByID,
  handleGetAllConfigs,
  handleUpdateConfig,
  handleUpdatePublishingStatus,
  handleCreateTransactionTypeTable,
  handleCreateTazamaDataModelTable,
  handleUpdateConfigByStatus,
  handleAddMapping,
  handleRemoveMapping,
  handleAddFunction,
  handleRemoveFunction,
} from './services/tcs-config.logic.service';

import { handleGetReportRequestByMsgId } from './services/report.logic.service';

import {
  handleGetAllCollections,
  handleGetCollectionFields,
  handleCreateDestinationType,
  handleDestinationTypeExists,
  handleAddFieldToDestinationType,
} from './services/data-model.logic.service';
import {
  handlePostCron,
  handleGetCronById,
  handleUpdateCron,
  handleGetAllCrons,
  handleGetCronByStatus,
  handleUpdateCronStatus,
} from './services/cron.logic.service';
import type { JobStatus } from './interface/data-enrichment.interface';

export const reportRequestHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle report request');
  try {
    const { tenantId } = req as ITenantRequest;
    const request = req.query as { msgid: string };
    const data = await handleGetReportRequestByMsgId(request.msgid, tenantId);
    const body = {
      message: 'Report was found',
      data,
    };
    reply.status(data ? 200 : 204);
    reply.send(body);
  } catch (err) {
    const failMessage = `Failed to process execution request. \n${util.inspect(err)}`;
    reply.status(500);
    reply.send(failMessage);
  } finally {
    loggerService.log('End - Handle report request');
  }
};

export const postConditionHandlerEntity = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle saving entity condition request');
  try {
    const condition = req.body as EntityCondition;
    const { tenantId } = req as ITenantRequest;
    const data = await handlePostConditionEntity(condition, tenantId);

    reply.status(200);
    reply.send(data);
  } catch (err) {
    reply.status(500);
    reply.send(err);
  } finally {
    loggerService.log('End - Handle saving entity condition request');
  }
};

export const postConditionHandlerAccount = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle saving account condition request');
  try {
    const condition = req.body as AccountCondition;
    const { tenantId } = req as ITenantRequest;
    const data = await handlePostConditionAccount(condition, tenantId);

    reply.status(200);
    reply.send(data);
  } catch (err) {
    reply.status(500);
    reply.send(err);
  } finally {
    loggerService.log('End - Handle saving account condition request');
  }
};

export const putRefreshCache = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle cache refresh');
  try {
    const { tenantId } = req as ITenantRequest;
    const ttl = configuration.redisConfig.distributedCacheTTL!;
    const activeOnly = configuration.ACTIVE_CONDITIONS_ONLY;
    await handleRefreshCache(activeOnly, tenantId, ttl);
    reply.status(204);
  } catch (err) {
    reply.status(500);
    reply.send(err);
  } finally {
    loggerService.log('End - Handle cache refresh');
  }
};

export const handleHealthCheck = (): { status: string } => ({
  status: 'UP',
});

export const getEntityConditionHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.trace('getting conditions for an entity');
  try {
    const { tenantId } = req as ITenantRequest;
    const { code, result } = await handleGetConditionsForEntity(req.query as ConditionRequest, tenantId);

    reply.status(code);
    reply.send(result);
  } catch (err) {
    loggerService.error(err as Error);
    reply.status(500);
    reply.send(err);
  } finally {
    loggerService.trace('End - get condition for an entity');
  }
};

export const getAccountConditionsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get account condition request');
  try {
    const { tenantId } = req as ITenantRequest;
    const { code, result } = await handleGetConditionsForAccount(req.query as ConditionRequest, tenantId);

    reply.status(code);
    reply.send(result);
  } catch (err) {
    loggerService.error(err as Error);
    reply.status(500);
    reply.send(err);
  } finally {
    loggerService.log('End - Handle get account condition request');
  }
};

export const updateAccountConditionExpiryDateHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle update condition for account request');
  const expiryDate = (req.body as { xprtnDtTm?: string }).xprtnDtTm;
  try {
    const { tenantId } = req as ITenantRequest;
    const { code, message } = await handleUpdateExpiryDateForConditionsOfAccount(req.query as ConditionRequest, tenantId, expiryDate);

    reply.status(code);
    if (code !== 200) throw Error(message);
    reply.send(message);
  } catch (err) {
    reply.send(err);
  } finally {
    loggerService.log('End - Handle update condition for account request');
  }
};

export const updateEntityConditionExpiryDateHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle update condition for entity request');
  const expiryDate = (req.body as { xprtnDtTm?: string }).xprtnDtTm;
  try {
    const { tenantId } = req as ITenantRequest;
    const { code, message } = await handleUpdateExpiryDateForConditionsOfEntity(req.query as ConditionRequest, tenantId, expiryDate);

    reply.status(code);
    if (code !== 200) throw Error(message);
    reply.send(message);
  } catch (err) {
    reply.send(err);
  } finally {
    loggerService.log('End - Handle update condition for entity request');
  }
};
export const createConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle create config request');
  try {
    const { tenantId } = req as ITenantRequest;
    const configData = req.body as Record<string, unknown>;
    const response = await handlePostConfig(configData, tenantId);
    reply.code(201).send({ success: true, message: response.message, config: { id: response.result.id, ...configData } });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create config';
    loggerService.error(`Failed to create config: ${errorMessage}`, 'createConfigHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle create config request');
  }
};
export const getConfigByIdHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get config by id request');
  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const config = await handleFindConfigByID(id, tenantId);
    reply.code(200).send({ success: true, config });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get config';
    loggerService.error(`Failed to get config: ${errorMessage}`, 'getConfigByIdHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle get config by id request');
  }
};
export const getAllConfigsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { tenantId } = req as ITenantRequest;
    const body = req.body as Record<string, string>;
    const { offset = '0', limit = '10' } = req.params as { offset?: string; limit?: string };
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    const result = await handleGetAllConfigs(parsedLimit, parsedOffset, body, tenantId);
    reply.code(200).send({
      success: true,
      configs: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      pages: Math.ceil(result.total / result.limit),
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get configs';
    loggerService.error(`Failed to get configs: ${errorMessage}`, 'getAllConfigsHandler');
    reply.code(500).send({ success: false, message: errorMessage });
  }
};

export const writeConfigUpdateHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle write config update request');
  try {
    const { id } = req.params as { id: string };
    const updateData = req.body as Record<string, unknown>;
    const { tenantId } = req as ITenantRequest;

    const updatedConfig = await handleUpdateConfig(parseInt(id), tenantId, updateData as Partial<Config>);
    reply.code(200).send({ success: true, message: 'Config updated successfully', config: updatedConfig });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update config';
    loggerService.error(`Failed to update config: ${errorMessage}`, 'writeConfigUpdateHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle write config update request');
  }
};

export const updatePublishingStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle update publishing status request');
  try {
    const { id } = req.params as { id: string };
    const { publishing_status: publishingStatus } = req.body as { publishing_status?: 'active' | 'inactive' };
    const { tenantId } = req as ITenantRequest;
    const configId = parseInt(id);

    if (isNaN(configId)) {
      reply.status(400).send({ success: false, message: `Invalid config ID: ${id}. Must be a valid number.` });
      return;
    }

    if (!publishingStatus) {
      reply.status(400).send({ success: false, message: 'publishing_status must be either "active" or "inactive"' });
      return;
    }

    const updatedConfig = await handleUpdatePublishingStatus(configId, tenantId, publishingStatus);
    reply.code(200).send({
      success: true,
      message: `Publishing status updated to ${publishingStatus}`,
      config: updatedConfig,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update publishing status';
    loggerService.error(`Failed to update publishing status: ${errorMessage}`, 'updatePublishingStatusHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle update publishing status request');
  }
};

export const createTransactionTypeTableHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle create transaction type table request');
  try {
    const { transactionType } = req.body as { transactionType: string };

    if (!transactionType) {
      reply.status(400).send({ success: false, message: 'Transaction type is required' });
      return;
    }

    await handleCreateTransactionTypeTable(transactionType);

    reply.code(201).send({
      success: true,
      message: `Table for transaction type '${transactionType}' created successfully`,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create transaction type table';
    loggerService.error(`Failed to create transaction type table: ${errorMessage}`, 'createTransactionTypeTableHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle create transaction type table request');
  }
};

export const createTazamaDataModelTableHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle create Tazama data model table request');
  try {
    const { tableName } = req.body as { tableName: string };

    if (!tableName) {
      reply.status(400).send({ success: false, message: 'Table name is required' });
      return;
    }

    await handleCreateTazamaDataModelTable(tableName);

    reply.code(201).send({
      success: true,
      message: `Table '${tableName}' created successfully`,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create Tazama data model table';
    loggerService.error(`Failed to create Tazama data model table: ${errorMessage}`, 'createTazamaDataModelTableHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle create Tazama data model table request');
  }
};

export const updateConfigByStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle update config by status request');
  try {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status?: string };

    const updatedCount = await handleUpdateConfigByStatus(id, status);

    reply.code(200).send({
      success: true,
      message: `Publishing status updated successfully (${updatedCount} row(s) affected).`,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update config publishing status';
    loggerService.error(`Failed to update config by status: ${errorMessage}`, 'updateConfigByStatusHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle update config by status request');
  }
};

export const addMappingHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle add mapping request');
  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const mappingDto = req.body as AddMappingDto;

    const updatedConfig = await handleAddMapping(Number(id), tenantId, mappingDto);

    reply.status(200).send({
      success: true,
      message: 'Mapping added successfully',
      config: updatedConfig,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to add mapping';
    loggerService.error(`Failed to add mapping: ${errorMessage}`, 'addMappingHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle add mapping request');
  }
};

export const removeMappingHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle remove mapping request');
  try {
    const { id, index } = req.params as { id: string; index: string };
    const { tenantId } = req as ITenantRequest;
    const mappingIndex = Number(index);

    const updatedConfig = await handleRemoveMapping(Number(id), tenantId, mappingIndex);

    reply.status(200).send({
      success: true,
      message: 'Mapping removed successfully',
      config: updatedConfig,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to remove mapping';
    loggerService.error(`Failed to remove mapping: ${errorMessage}`, 'removeMappingHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle remove mapping request');
  }
};

export const addFunctionHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle add function request');
  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const functionDto = req.body as AddFunctionDto;

    const updatedConfig = await handleAddFunction(Number(id), tenantId, functionDto);

    reply.status(200).send({
      success: true,
      message: 'Function added successfully',
      config: updatedConfig,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to add function';
    loggerService.error(`Failed to add function: ${errorMessage}`, 'addFunctionHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle add function request');
  }
};

export const removeFunctionHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle remove function request');
  try {
    const { id, index } = req.params as { id: string; index: string };
    const { tenantId } = req as ITenantRequest;
    const functionIndex = Number(index);

    const updatedConfig = await handleRemoveFunction(Number(id), tenantId, functionIndex);

    reply.status(200).send({
      success: true,
      message: 'Function removed successfully',
      config: updatedConfig,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to remove function';
    loggerService.error(`Failed to remove function: ${errorMessage}`, 'removeFunctionHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle remove function request');
  }
};

// ==================== DATA MODEL HANDLERS ====================

export const getAllCollectionsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get all collections request');
  try {
    const { tenantId } = req.params as { tenantId: string };
    const collections = await handleGetAllCollections(tenantId);

    reply.status(200).send({
      success: true,
      data: collections,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get collections';
    loggerService.error(`Failed to get collections: ${errorMessage}`, 'getAllCollectionsHandler');
    reply.status(500).send({ success: false, message: errorMessage, data: [] });
  } finally {
    loggerService.log('End - Handle get all collections request');
  }
};

export const getCollectionFieldsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get collection fields request');
  try {
    const { collectionId, tenantId } = req.params as { collectionId: string; tenantId: string };
    const fields = await handleGetCollectionFields(Number(collectionId), tenantId);

    reply.status(200).send({
      success: true,
      data: fields,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get collection fields';
    loggerService.error(`Failed to get collection fields: ${errorMessage}`, 'getCollectionFieldsHandler');
    reply.status(500).send({ success: false, message: errorMessage, data: [] });
  } finally {
    loggerService.log('End - Handle get collection fields request');
  }
};

export const createDestinationTypeHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle create destination type request');
  try {
    const body = req.body as { collection_type: string; name: string; destination_id: number };
    const { tenantId } = req as ITenantRequest;

    const result = await handleCreateDestinationType(body, tenantId);

    reply.status(201).send({
      success: true,
      message: 'Destination type created successfully',
      data: result,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create destination type';
    loggerService.error(`Failed to create destination type: ${errorMessage}`, 'createDestinationTypeHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle create destination type request');
  }
};

export const destinationTypeExistsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle check destination type exists request');
  try {
    const { destinationTypeId } = req.params as { destinationTypeId: string };
    const { tenantId } = req as ITenantRequest;

    const exists = await handleDestinationTypeExists(Number(destinationTypeId), tenantId);

    reply.status(200).send({
      success: true,
      exists,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to check destination type';
    loggerService.error(`Failed to check destination type: ${errorMessage}`, 'destinationTypeExistsHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle check destination type exists request');
  }
};

export const addFieldToDestinationTypeHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle add field to destination type request');
  try {
    const { destinationTypeId } = req.params as { destinationTypeId: string };
    const body = req.body as { name: string; field_type: string; parent_id?: number; serial_no?: number };
    const { tenantId } = req as ITenantRequest;

    const result = await handleAddFieldToDestinationType(Number(destinationTypeId), body, tenantId);

    reply.status(201).send({
      success: true,
      message: 'Field added successfully',
      data: result,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to add field';
    loggerService.error(`Failed to add field: ${errorMessage}`, 'addFieldToDestinationTypeHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle add field to destination type request');
  }
};
// export const getConfigByIdHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
//   loggerService.log('Start - Handle get config by id request');
//   try {
//     const { id } = req.params as { id: string };
//     const tenantId = (req as ITenantRequest).tenantId ?? 'DEFAULT';
//     const configId = parseInt(id);
//     // const config = await handleFindConfigByID(configId, tenantId);
//     if (isNaN(configId)) {
//       reply.status(400).send({ success: false, message: `Invalid config ID: ${id}. Must be a valid number.` });
//       return;
//     }
//     if (!config) {
//       reply.status(404).send({ success: false, message: `Config with id ${id} not found` });
//       return;
//     }
//     reply.code(200).send({ success: true, config });
//   } catch (error: unknown) {
//     const errorMessage = error instanceof Error ? error.message : 'Failed to get config';
//     loggerService.error(`Failed to get config: ${errorMessage}`, 'getConfigByIdHandler');
//     reply.status(500).send({ success: false, message: errorMessage });
//   }
// };

// ==================== CRON JOB OPERATIONS ====================

export const createCronJobHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle create cron job request');
  try {
    const { tenantId } = req as ITenantRequest;
    const configData = req.body as Record<string, unknown>;
    const response = await handlePostCron(configData, tenantId);
    reply.code(201).send({ success: true, message: response.message });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create cron job';
    loggerService.error(`Failed to create cron job: ${errorMessage}`, 'createCronJobHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle create cron job request');
  }
};

export const getCronJobByIdHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get cron job by id request');
  try {
    const { id } = req.params as { id: string };
    const cronJob = await handleGetCronById(id);

    if (!cronJob) {
      reply.status(404).send({ success: false, message: `Cron job with id ${id} not found` });
      return;
    }

    reply.code(200).send({ ...cronJob });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get cron job';
    loggerService.error(`Failed to get cron job: ${errorMessage}`, 'getCronJobByIdHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle get cron job by id request');
  }
};

export const updateCronJobHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle update cron job request');
  try {
    const { id } = req.params as { id: string };
    const updateData = req.body as Record<string, unknown>;

    const response = await handleUpdateCron(id, updateData);
    reply.code(200).send({ success: true, message: response.message });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update cron job';
    loggerService.error(`Failed to update cron job: ${errorMessage}`, 'updateCronJobHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle update cron job request');
  }
};

export const getAllCronJobsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get all cron jobs request');
  try {
    const { tenantId } = req as ITenantRequest;
    const body = req.body as Record<string, string>;
    const { offset = '0', limit = '10' } = req.params as { offset?: string; limit?: string };
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    const result = await handleGetAllCrons(parsedLimit, parsedOffset, body, tenantId);
    reply.code(200).send({
      success: true,
      data: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      pages: Math.ceil(result.total / result.limit),
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get cron jobs';
    loggerService.error(`Failed to get cron jobs: ${errorMessage}`, 'getAllCronJobsHandler');
    reply.code(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle get all cron jobs request');
  }
};

export const getCronJobByStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get cron job by status request');
  try {
    const { tenantId } = req as ITenantRequest;
    const { status } = req.params as { status: JobStatus };
    const { page = '1', limit = '10' } = req.query as { page?: string; limit?: string };
    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);

    const cronJobs = await handleGetCronByStatus(tenantId, status, parsedPage, parsedLimit);
    reply.code(200).send({
      success: true,
      data: cronJobs,
      count: cronJobs.length,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get cron jobs by status';
    loggerService.error(`Failed to get cron jobs by status: ${errorMessage}`, 'getCronJobByStatusHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle get cron job by status request');
  }
};

export const updateCronJobStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle update cron job status request');
  try {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason?: string };
    const { status } = req.query as { status?: JobStatus };

    if (!status) {
      reply.status(400).send({ success: false, message: 'Status is required' });
      return;
    }

    const response = await handleUpdateCronStatus(status, id, reason);
    reply.code(200).send({ success: true, message: response.message });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update cron job status';
    loggerService.error(`Failed to update cron job status: ${errorMessage}`, 'updateCronJobStatusHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle update cron job status request');
  }
};
