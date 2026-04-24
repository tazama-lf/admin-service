import type { AccountCondition, EntityCondition } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import type { FastifyReply, FastifyRequest } from 'fastify';
import * as util from 'node:util';
import type { Config, AddMappingDto, AddFunctionDto } from '@tazama-lf/tcs-lib';
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
import { handleGetReportRequestByMsgId } from './services/report.logic.service';
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
  handleGetAllTransactionTypes,
  handleGetPayloadByTransactionType,
  handleGetConfigByTransactionType,
  handleGetRelatedTransactions,
} from './services/tcs-config.logic.service';
import { handleGetDataModelJson, handleUpsertDataModelJson } from './services/data-model.logic.service';
import {
  handlePostCron,
  handleGetCronById,
  handleUpdateCron,
  handleGetAllCrons,
  handleGetCronByStatus,
  handleUpdateCronStatus,
} from './services/cron.logic.service';
import type { ConfigType, JobStatus, ScheduleStatus } from './interface/data-enrichment.interface';
import type { AuthenticatedRequest } from './interface/AuthenticatedRequest';
import { ErrorHandler } from './handlers/errorHandler';
import { createNode, deleteNodeById, executeSelectQuery, findAllNodes } from './services/node.logic.service';
import { findRuleFlow, getGlobalVariables, createRuleFlow, updateRuleFlow, getRuleFlowStatus } from './services/rule-flow.logic.service';
import {
  cloneRule,
  createRule,
  findAllRuleIds,
  findRuleById,
  findRuleConfiguration,
  findRulesWithFilters,
  getVersionsOfTransactionType,
  updateRule,
  updateRuleStatus,
} from './services/rule.logic.service';
import { findMasksWithFilters, handlePostMask, handleUpdateMask, handleGetMaskById } from './services/masking.logic.service';
import type { CloneRuleHandlerReqBody, CreateRuleHandlerReqBody } from './interface/rule.interface';
import { findActiveNetworkMap } from './services/network-map.service';
import { getSimulationLogs, createSimulationLogs, getSimulationMessages } from './services/simulation-logs.logic.service';
import { decodeInnerToken } from './utils/decode-token';
import type { ISimulationBody } from './interface/simulattionLogs.interface';
import {
  handleCreatePushJob,
  handleGetAllJobs,
  handleCreatePullJob,
  handleGetJobHistory,
  handleFindJobById,
  handleGetJobsByStatus,
  handleUpdateJob,
  handleUpdateJobActivation,
  handleUpdateJobByStatus,
  handleTableExist,
  handleValidateExisting,
  handleValidateActive,
} from './services/job.logic.service';

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
  const expiryDate = (req.body as { xprtnDtTm?: string })?.xprtnDtTm;
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
  const expiryDate = (req.body as { xprtnDtTm?: string })?.xprtnDtTm;
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
    ErrorHandler.sendError(reply, error, 'Failed to create config');
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
    ErrorHandler.sendError(reply, error, 'Failed to get config');
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
    ErrorHandler.sendError(reply, error, 'Failed to get configs');
  }
};

export const writeConfigUpdateHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle write config update request');
  try {
    const { id } = req.params as { id: string };
    const { updatedAt, ...updateData } = req.body as Record<string, unknown> & { updatedAt?: unknown };
    const { tenantId } = req as ITenantRequest;

    const updatedConfig = await handleUpdateConfig(parseInt(id), tenantId, updateData as Partial<Config>);
    reply.code(200).send({ success: true, message: 'Config updated successfully', config: updatedConfig });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to update config');
  } finally {
    loggerService.log('End - Handle write config update request');
  }
};

export const updatePublishingStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle update publishing status request');
  try {
    const { id } = req.params as { id: string };
    const { publishing_status: publishingStatus } = req.body as {
      publishing_status?: 'active' | 'inactive';
    };
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
    ErrorHandler.sendError(reply, error, 'Failed to update publishing status');
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
    ErrorHandler.sendError(reply, error, 'Failed to create transaction type table');
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
    ErrorHandler.sendError(reply, error, 'Failed to create Tazama data model table');
  } finally {
    loggerService.log('End - Handle create Tazama data model table request');
  }
};

export const updateConfigByStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle update config by status request');
  try {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status?: string };

    if (!status) {
      reply.code(400).send({ success: false, message: 'status is required in request body' });
      return;
    }

    const { tenantId } = req as ITenantRequest;
    const updatedCount = await handleUpdateConfigByStatus(id, status, tenantId);

    reply.code(200).send({
      success: true,
      message: `Publishing status updated successfully (${updatedCount} row(s) affected).`,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to update config publishing status');
  } finally {
    loggerService.log('End - Handle update config by status request');
  }
};

export const addMappingHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle add mapping request');
  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const { updatedAt, ...mappingDto } = req.body as AddMappingDto & { updatedAt?: unknown };

    const updatedConfig = await handleAddMapping(Number(id), tenantId, mappingDto as AddMappingDto);

    reply.status(200).send({
      success: true,
      message: 'Mapping added successfully',
      config: updatedConfig,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to add mapping');
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
    ErrorHandler.sendError(reply, error, 'Failed to remove mapping');
  } finally {
    loggerService.log('End - Handle remove mapping request');
  }
};

export const addFunctionHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle add function request');
  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const { updatedAt, ...functionDto } = req.body as AddFunctionDto & { updatedAt?: unknown };

    const updatedConfig = await handleAddFunction(Number(id), tenantId, functionDto as AddFunctionDto);

    reply.status(200).send({
      success: true,
      message: 'Function added successfully',
      config: updatedConfig,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to add function');
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
    ErrorHandler.sendError(reply, error, 'Failed to remove function');
  } finally {
    loggerService.log('End - Handle remove function request');
  }
};

// ==================== DATA MODEL HANDLERS ====================

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
    ErrorHandler.sendError(reply, error, 'Failed to create cron job');
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
    ErrorHandler.sendError(reply, error, 'Failed to get cron job');
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
    ErrorHandler.sendError(reply, error, 'Failed to update cron job');
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
    ErrorHandler.sendError(reply, error, 'Failed to get cron jobs');
  } finally {
    loggerService.log('End - Handle get all cron jobs request');
  }
};

export const getCronJobByStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get cron job by status request');
  try {
    const { tenantId } = req as ITenantRequest;
    const { status, page = '1', limit = '10' } = req.query as { status?: JobStatus; page?: string; limit?: string };
    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);

    if (!status) {
      reply.code(400).send({ success: false, message: 'status query parameter is required' });
      return;
    }

    const cronJobs = await handleGetCronByStatus(tenantId, status, parsedPage, parsedLimit);
    reply.code(200).send({
      success: true,
      data: cronJobs,
      count: cronJobs.length,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get cron jobs by status');
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
    ErrorHandler.sendError(reply, error, 'Failed to update cron job status');
  } finally {
    loggerService.log('End - Handle update cron job status request');
  }
};

// =================== DE ======================

export const createPushJobHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle create push job request');
  try {
    const { tenantId } = req as ITenantRequest;
    const { id: _id, ...pushData } = req.body as Record<string, unknown>;

    const response = await handleCreatePushJob(pushData, tenantId);
    reply.code(201).send({ success: true, message: response.message });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to create push job');
  } finally {
    loggerService.log('End - Handle create push job request');
  }
};

export const getAllJobsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get all DE jobs request');
  try {
    const { tenantId } = req as ITenantRequest;
    const body = req.body as Record<string, string>;
    const { offset = '0', limit = '10' } = req.params as { offset?: string; limit?: string };
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    loggerService.log(`Get All Jobs Handler with offset ${offset} limit ${limit} parsedLimit ${parsedLimit} parsedOffset ${parsedOffset} `);

    const result = await handleGetAllJobs(parsedLimit, parsedOffset, body, tenantId);
    reply.code(200).send({
      success: true,
      data: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      pages: Math.ceil(result.total / result.limit),
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get DE jobs');
  } finally {
    loggerService.log('End - Handle get all DE jobs request');
  }
};

export const createPullJobHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle create pull job request');
  try {
    const { tenantId } = req as ITenantRequest;
    const { id: _id, ...pullData } = req.body as Record<string, unknown>;
    const response = await handleCreatePullJob(pullData, tenantId);
    reply.code(201).send({ success: response.success, message: response.message });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to create pull job');
  } finally {
    loggerService.log('End - Handle create pull job request');
  }
};

export const getJobHistoryHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get job history request');
  try {
    const { tenantId } = req as ITenantRequest;
    const body = (req.body as Record<string, string>) || {};
    const { offset = '0', limit = '10' } = req.params as { offset?: string; limit?: string };
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    const result = await handleGetJobHistory(parsedLimit, parsedOffset, tenantId, body);
    reply.code(200).send({
      success: true,
      data: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      pages: Math.ceil(result.total / result.limit),
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get job history');
  } finally {
    loggerService.log('End - Handle get job history request');
  }
};

export const findJobByIdHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle find job by ID request');
  try {
    const { id } = req.params as { id: string };
    const { tableName } = req.query as { tableName?: string };

    let resolvedType: string | undefined;
    if (tableName === 'tcs_push_jobs') {
      resolvedType = 'push';
    } else if (tableName === 'tcs_pull_jobs') {
      resolvedType = 'pull';
    }

    if (!resolvedType) {
      reply.code(400).send({ success: false, message: 'tableName query parameter is required (tcs_push_jobs or tcs_pull_jobs)' });
      return;
    }

    const result = await handleFindJobById(id, resolvedType as ConfigType);

    if (!result) {
      reply.code(404).send({ success: false, message: `Job with ID ${id} not found` });
      return;
    }

    reply.code(200).send(result);
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to find job by ID');
  } finally {
    loggerService.log('End - Handle find job by ID request');
  }
};

export const getJobsByStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get jobs by status request');
  try {
    const { tenantId } = req as ITenantRequest;
    const { status, page = '1', limit = '10' } = req.query as { status: JobStatus; page?: string; limit?: string };

    if (!status) {
      reply.code(400).send({ success: false, message: 'status query parameter is required' });
      return;
    }

    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);

    const result = await handleGetJobsByStatus(tenantId, status, parsedPage, parsedLimit);
    reply.code(200).send({ success: true, data: result });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get jobs by status');
  } finally {
    loggerService.log('End - Handle get jobs by status request');
  }
};

export const updateJobHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle update job request');
  try {
    const { id } = req.params as { id: string };
    const { job, type } = req.body as { job: Record<string, unknown>; type: ConfigType };

    if (!job || !type) {
      reply.code(400).send({ success: false, message: 'job and type are required in request body' });
      return;
    }

    const result = await handleUpdateJob(id, job, type);
    reply.code(200).send(result);
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to update job');
  } finally {
    loggerService.log('End - Handle update job request');
  }
};

export const updateJobActivationHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle update job activation request');
  try {
    const { id } = req.params as { id: string };
    const { status, type } = req.body as { status: ScheduleStatus; type: ConfigType };

    if (!status || !type) {
      reply.code(400).send({ success: false, message: 'status and type are required in request body' });
      return;
    }

    const result = await handleUpdateJobActivation(id, status, type);
    reply.code(200).send({
      success: true,
      message: 'Job activation status updated successfully',
      data: result,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to update job activation');
  } finally {
    loggerService.log('End - Handle update job activation request');
  }
};

export const updateJobByStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle update job by status request');
  try {
    const { id } = req.params as { id: string };
    const { status, type, reason } = req.body as { status: JobStatus; type: ConfigType; reason?: string };

    if (!status || !type) {
      reply.code(400).send({ success: false, message: 'status and type are required in request body' });
      return;
    }

    const result = await handleUpdateJobByStatus(status, id, type, reason);
    reply.code(200).send({
      success: true,
      message: `Job status updated successfully (${result} row(s) affected)`,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to update job status');
  } finally {
    loggerService.log('End - Handle update job by status request');
  }
};

export const tableExistHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle table exist check request');
  try {
    const { tableName } = req.query as { tableName: string };

    if (!tableName) {
      reply.code(400).send({ success: false, message: 'tableName query parameter is required' });
      return;
    }

    const exists = await handleTableExist(tableName);
    reply.code(200).send({
      success: true,
      exists,
      message: exists ? `Table "${tableName}" exists` : `Table "${tableName}" does not exist`,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to check if table exists');
  } finally {
    loggerService.log('End - Handle table exist check request');
  }
};

export const validateExistingHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle validate existing table request');
  try {
    const { tableName } = req.query as { tableName: string };

    if (!tableName) {
      reply.code(400).send({ success: false, message: 'tableName query parameter is required' });
      return;
    }

    const exists = await handleValidateExisting(tableName);
    reply.code(200).send({
      success: true,
      exists,
      message: exists ? 'Table or associated job exists' : 'Table does not exist',
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to validate existing table');
  } finally {
    loggerService.log('End - Handle validate existing table request');
  }
};

export const validateActiveHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle validate active jobs request');
  try {
    const { tableName, type } = req.query as { tableName: string; type: ConfigType };

    if (!tableName || !type) {
      reply.code(400).send({ success: false, message: 'tableName and type query parameters are required' });
      return;
    }

    await handleValidateActive(tableName, type);
    reply.code(200).send({
      success: true,
      message: `No active jobs found for table "${tableName}"`,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to validate active jobs');
  } finally {
    loggerService.log('End - Handle validate active jobs request');
  }
};

// ==================== TRS ====================
export const createNodeHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const { tenantId } = req as ITenantRequest;
  const userId = authReq.user?.clientId ?? authReq.user?.sub ?? authReq.user?.preferred_username ?? 'system';

  try {
    const rawBody = req.body;
    if (!Array.isArray(rawBody)) {
      ErrorHandler.sendError(reply, { status: 400 }, 'Request body must be an array of nodes');
      return;
    }

    const nodes = rawBody as Array<Record<string, unknown>>;
    const dataToInsert = nodes.map((node: Record<string, unknown>) => ({
      node_json: node.node_json as Record<string, unknown>,
      tenant_id: tenantId,
      created_by: userId,
      order: (node.order as number) ?? 0,
    }));

    const result: unknown = await createNode(dataToInsert);

    const resultArray = Array.isArray(result) ? (result as unknown[]) : [result];

    reply.code(201).send({
      success: true,
      message: `${resultArray.length} node(s) created successfully`,
      nodes: resultArray,
      count: resultArray.length,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to create nodes');
  } finally {
    loggerService.log('End - Create Node Handler');
  }
};

export const getNodeHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { tenantId } = req as ITenantRequest;
    const queryParams = req.query as { type?: string; category?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' };

    const nodes = await findAllNodes(tenantId, queryParams);
    reply.code(200).send({
      success: true,
      message: 'Nodes retrieved successfully',
      nodes,
      count: nodes.length,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to retrieve nodes');
  } finally {
    loggerService.log('End - Get Node Handler');
  }
};

export const deleteNodeByIdHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { tenantId } = req as ITenantRequest;
    const queryParams = req.params as { nodeId?: string };
    await deleteNodeById(Number(queryParams.nodeId), tenantId);
    reply.code(200).send({
      success: true,
      message: 'Node deleted successfully',
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to delete node');
  } finally {
    loggerService.log('End - Delete Node By ID Handler');
  }
};

export const executeQueryNode = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { tenantId } = req as ITenantRequest;
    const body = req.body as { query: string; dbName: string; params?: unknown[] };

    if (!body.query) {
      ErrorHandler.sendError(reply, { status: 400 }, 'Query parameter is required');
      return;
    }

    const result = await executeSelectQuery(body, tenantId);
    reply.code(200).send({
      success: true,
      message: 'Query executed successfully',
      result,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to execute query');
  } finally {
    loggerService.log('End - Execute Query Node Handler');
  }
};
interface RuleConfig {
  id: string;
  cfg: string;
  desc: string;
  config: Record<string, unknown>;
}

export const getGlobalVariablesHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { tenantId } = req as ITenantRequest;
    const { ruleId } = req.params as { ruleId: string };

    const globalVariables = await getGlobalVariables(ruleId, tenantId);

    if (!globalVariables?.ruleRequest || !globalVariables.configuration) {
      ErrorHandler.sendError(reply, { status: 404 }, `Global variables not found for rule ${ruleId} and tenant ${tenantId}`);
      return;
    }

    const RuleRequest: unknown = globalVariables.ruleRequest;
    const RuleConfig: RuleConfig = globalVariables.configuration;

    const RuleResult = {
      id: RuleConfig.id,
      tenantId,
      cfg: '',
      subRuleRef: '.err',
      reason: 'Unhandled rule result outcome',
      prcgTm: -1,
      indpdntVarbl: 0,
    };

    reply.code(200).send({
      success: true,
      RuleRequest,
      RuleConfig,
      RuleResult,
    });
  } catch (error) {
    ErrorHandler.sendError(reply, error, 'Failed to get global variables');
  }
};

export const getRuleFlowHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { ruleId } = req.params as { ruleId: string };
    const { tenantId } = req as ITenantRequest;
    const { category } = req.query as { category?: string };

    const ruleFlow = await findRuleFlow(ruleId, tenantId, category);

    if (!ruleFlow) {
      ErrorHandler.sendError(reply, { status: 404 }, `Rule flow not found for rule ${ruleId}`);
      return;
    }

    reply.code(200).send({
      success: true,
      rule_id: ruleFlow.rule_id,
      result: ruleFlow,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get rule configuration');
  }
};

export const createRuleFlowHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const flowData = req.body as {
      flow_json_rule_builder: Record<string, unknown>;
      flow_json_test_case: Record<string, unknown>;
    };
    const result: unknown = await createRuleFlow({
      rule_id: id,
      tenantId,
      flowData: {
        flow_json_rule_builder: flowData.flow_json_rule_builder,
        flow_json_test_case: flowData.flow_json_test_case,
      },
    });
    reply.code(201).send({
      success: true,
      message: 'Rule flow created successfully',
      flow: result,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to create rule flow');
  }
};

export const updateRuleFlowHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const payload = req.body as { flow_json: Record<string, unknown>; ts_file_base64?: string; category: string; status: string };
    const result: unknown = await updateRuleFlow(id, payload, tenantId);

    if (!result) {
      ErrorHandler.sendError(reply, { status: 404 }, `Rule flow not found for rule ${id}`);
      return;
    }

    reply.code(200).send({
      success: true,
      message: 'Rule flow updated successfully',
      flow: result,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to update rule flow');
  }
};

export const updateRuleStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { ruleId } = req.params as { ruleId: string };
    const { status, reason } = req.body as { status: string; reason: string };
    const { tenantId } = req as ITenantRequest;

    const updatedRule = await updateRuleStatus(ruleId, tenantId, status, reason);

    reply.code(200).send({
      success: true,
      message: 'Rule status updated successfully',
      rule: updatedRule,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to update rule status');
  }
};

export const cloneRuleHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { ruleId } = req.params as { ruleId: number };
    const authReq = req as AuthenticatedRequest;
    const { tenantId } = req as ITenantRequest;

    const { payload, ruleRequest } = req.body as CloneRuleHandlerReqBody;

    const clonedRule = await cloneRule(ruleId, payload, authReq.user?.clientId ?? 'default', tenantId, ruleRequest);
    reply.code(201).send({
      success: true,
      message: 'Rule cloned successfully',

      rule: clonedRule,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to clone rule');
  }
};

export const getAllRulesHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { tenantId } = req as ITenantRequest;
    const body = authReq.body as Record<string, string>;
    const { offset = '0', limit = '10' } = req.params as { offset?: string; limit?: string };
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    const result = await findRulesWithFilters(parsedLimit, parsedOffset, body, tenantId);
    reply.code(200).send({
      success: true,
      rules: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      pages: Math.ceil(result.total / result.limit),
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get rules');
  }
};

export const getRulesByIdHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const rulesId = parseInt(id);
    if (isNaN(rulesId)) {
      ErrorHandler.sendError(reply, { status: 400 }, `Invalid rules ID: ${id}. Must be a valid number.`);
      return;
    }

    const rules = await findRuleById(rulesId, tenantId);
    if (!rules) {
      ErrorHandler.sendError(reply, { status: 404 }, `Rules with id ${id} not found`);
      return;
    }

    reply.code(200).send({ success: true, rules });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get rules');
  }
};

export const createRuleHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  // const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
  const { tenantId } = req as ITenantRequest;
  const userId = authReq.user?.clientId ?? authReq.user?.sub ?? authReq.user?.preferred_username ?? 'system';

  try {
    const { ruleData, ruleRequest } = req.body as CreateRuleHandlerReqBody;

    // Note: Validation is handled by rule-studio backend service
    // This admin-service only handles data persistence

    // Apply basic defaults if not provided
    const processedRuleData = {
      ...ruleData,
      status: 'STATUS_01_IN_PROGRESS',
      publishing_status: 'INACTIVE',
    };

    // Ensure rule name is generated if not provided
    const ruleName =
      processedRuleData.ruleName?.trim() ??
      (processedRuleData.rule_config_id ? `${tenantId}-rule-${processedRuleData.rule_config_id.split('@')[0]}` : `${tenantId}-rule`);

    // console.log('Rule data received for creation:', processedRuleData);
    // console.log('Rule request received for creation:', ruleRequest);

    // Step 4: Prepare rule data for database
    const newRule = {
      ruleName,
      description: processedRuleData.description,
      tenant_id: tenantId,
      txtp: processedRuleData.txtp,
      txtp_version: processedRuleData.txtpVersion,
      version: processedRuleData.version,
      status: processedRuleData.status, // Already has default applied
      publishing_status: processedRuleData.publishing_status, // Already has default applied
      updated_by: userId,
      rule_type: processedRuleData.rule_type,
      rule_config_id: processedRuleData.rule_config_id,
      updated_at: new Date(),
      created_at: new Date(),
    };

    // Step 5: Create rule in database
    const createdRule: unknown = await createRule(newRule, ruleRequest);

    reply.code(201).send({
      success: true,
      message: 'Rule created successfully',
      rule: createdRule,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to create rule');
  }

  // const authReq = req as AuthenticatedRequest;
  // const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
  // const userId = authReq.user?.clientId ?? authReq.user?.sub ?? authReq.user?.preferred_username ?? 'system';
  // try {
  //   const { ruleData, ruleRequest } = req.body as CreateRuleHandlerReqBody;

  //   const newRule = {
  //     // rule_id: ruleData.rule_id as string,
  //     ruleName: ruleData.ruleName,
  //     description: ruleData.description,
  //     tenant_id: tenantId,
  //     txtp: ruleData.txtp,
  //     txtp_version: ruleData.txtpVersion,
  //     version: ruleData.version,
  //     status: 'STATUS_01_IN_PROGRESS',
  //     publishing_status: 'ACTIVE',
  //     updated_by: userId,
  //     rule_type: ruleData.rule_type,
  //     rule_config_id: ruleData.rule_config_id,
  //     updated_at: new Date(),
  //     created_at: new Date(),
  //   };

  //   const createdRule: unknown = await createRule(newRule, ruleRequest);

  //   reply.code(201).send({ success: true, message: 'Rule created successfully', rule: createdRule });
  // } catch (error: unknown) {
  //   ErrorHandler.sendError(reply, error, 'Failed to create rule');
  // }
};

export const getTxTpVersionsByTransactionTypeHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { transactionType } = req.params as { transactionType: string };
    const { tenantId } = req as ITenantRequest;

    const versions: string[] = await getVersionsOfTransactionType(transactionType, tenantId);

    reply.code(200).send({
      success: true,
      transactionType,
      versions,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get versions');
  }
};

export const getRuleIdsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { tenantId } = req as ITenantRequest;

    const ruleIds = await findAllRuleIds(tenantId);

    reply.code(200).send({
      success: true,
      ruleIds,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get rule IDs');
  }
};

export const getRuleConfigurationHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { tenantId } = req as ITenantRequest;
    const { ruleId } = req.params as { ruleId: string };

    const configuration: unknown = await findRuleConfiguration(ruleId, tenantId);

    if (!configuration) {
      ErrorHandler.sendError(reply, { status: 404 }, `Configuration not found for rule ${ruleId}`);
      return;
    }

    reply.code(200).send({
      success: true,
      ruleId,
      configuration,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get rule configuration');
  }
};

export const updateRuleHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { tenantId } = req as ITenantRequest;
    const userId = authReq.user?.clientId ?? authReq.user?.sub ?? authReq.user?.preferred_username ?? 'system';
    const { ruleId } = req.params as { ruleId: string };
    const updateData = req.body as Record<string, unknown>;

    const enrichedUpdateData = {
      ...updateData,
      updated_by: userId,
    };

    const updatedRule: unknown = await updateRule(ruleId, tenantId, enrichedUpdateData);

    if (!updatedRule) {
      ErrorHandler.sendError(reply, { status: 404 }, `Rule with id ${ruleId} not found`);
      return;
    }

    reply.code(200).send({
      success: true,
      message: 'Rule updated successfully',
      rule: updatedRule,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to update rule');
  }
};

export const getActiveNetworkMapHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { tenantId } = req as ITenantRequest;

    const networkMap: unknown = await findActiveNetworkMap(tenantId);

    if (!networkMap) {
      ErrorHandler.sendError(reply, { status: 404 }, 'No active network map found for this tenant');
      return;
    }

    reply.code(200).send({
      success: true,
      networkMap,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Multiple active network maps')) {
      ErrorHandler.sendError(reply, { status: 409 }, error.message);
      return;
    }

    ErrorHandler.sendError(reply, error, 'Failed to get active network map');
  }
};

export const createSimulationLogsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { tenantId } = req as ITenantRequest;
    const userId = authReq.user?.clientId ?? authReq.user?.sub ?? authReq.user?.preferred_username ?? 'system';
    const decodeToken = decodeInnerToken(req.headers.authorization ?? '');
    const payload = req.body as ISimulationBody;

    const simulationLogs = {
      userId,
      tenantId,
      ruleId: payload.rule_id,
      newData: payload.new_data,
      oldData: payload?.old_data ?? {},
      description: payload?.description,
      category: payload.category,
      createdByEmail: decodeToken?.preferred_username,
    };

    await createSimulationLogs(simulationLogs);
    reply.code(201).send({
      success: true,
      message: 'Simulation logs inserted successfully',
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to insert simulation logs');
  }
};

export const getSimulationLogsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { tenantId } = req as ITenantRequest;
    const { ruleId } = req.params as { ruleId: string };
    const { category } = req.query as { category: string };

    const result = await getSimulationLogs(ruleId, tenantId, category);
    reply.code(200).send({
      success: true,
      message: 'Simulation logs retrieved successfully',
      result,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get simulation logs');
  }
};

export const getSimulationMessagesHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { tenantId } = req as ITenantRequest;
    const { tableName } = req.query as { tableName: string };

    const messages = await getSimulationMessages(tenantId, tableName);

    reply.code(200).send({
      success: true,
      messages,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get simulation messages');
  }
};

export const getRuleFlowStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { tenantId } = req as ITenantRequest;
    const { ruleId } = req.params as { ruleId: string };
    const query = req.query as { category?: string };

    const ruleFlow = await getRuleFlowStatus(
      ruleId,
      tenantId,
      query.category && query.category !== 'undefined' ? { category: query.category } : undefined,
    );

    if (!ruleFlow) {
      ErrorHandler.sendError(reply, { status: 404 }, `Rule flow not found for rule ${ruleId}`);
      return;
    }

    reply.code(200).send({
      success: true,
      result: ruleFlow,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get rule configuration');
  }
};

export const getTransactionTypesHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get transaction types request');
  try {
    const { tenantId } = req as ITenantRequest;

    const transactionTypes = await handleGetAllTransactionTypes(tenantId);

    reply.status(200).send({
      success: true,
      transactionTypes,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get transaction types');
  } finally {
    loggerService.log('End - Handle get transaction types request');
  }
};

export const getPayloadByTransactionTypeHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get payload by transaction type request');
  try {
    const { tenantId } = req as ITenantRequest;
    const { transactionType, transactionVersion } = req.params as { transactionType: string; transactionVersion: string };

    if (!transactionType || !transactionVersion) {
      reply.status(400).send({ success: false, message: 'Transaction type and version are required' });
      return;
    }

    const payload = await handleGetPayloadByTransactionType(transactionType, tenantId, transactionVersion);

    reply.status(200).send({
      success: true,
      transactionType,
      tenantId,
      payload,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get payload by transaction type');
  } finally {
    loggerService.log('End - Handle get payload by transaction type request');
  }
};

export const getConfigByTransactionTypeHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get config by transaction type request');
  try {
    const { tenantId } = req as ITenantRequest;
    loggerService.log('request params are ====================: \n', JSON.stringify(req.params));

    const { transactionType, version } = req.params as { transactionType: string; version: string };

    if (!transactionType || !version) {
      reply.status(400).send({
        success: false,
        message: `Transaction type and version are required. Received: transactionType=${transactionType}, version=${version}`,
      });
      return;
    }

    const config = await handleGetConfigByTransactionType(transactionType, version, tenantId);

    reply.status(200).send({
      success: true,
      transactionType,
      tenantId,
      config,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get config by transaction type');
  } finally {
    loggerService.log('End - Handle get config by transaction type request');
  }
};

export const getRelatedTransactionsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get related transactions request');
  try {
    const { tenantId } = req as ITenantRequest;

    const relatedTransactions = await handleGetRelatedTransactions(tenantId);

    reply.code(200).send({
      success: true,
      data: relatedTransactions,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get related transactions';
    loggerService.error(`Failed to get related transactions: ${errorMessage}`, 'getRelatedTransactionsHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle get related transactions request');
  }
};

// ==================== MASKING OPERATIONS ====================

export const createMaskHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle create mask request');
  try {
    const { tenantId } = req as ITenantRequest;
    const maskData = req.body as Record<string, unknown>;
    const response = await handlePostMask({ ...maskData }, tenantId);
    reply.code(201).send({ success: true, message: response.message, id: response.id });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to create masking configuration');
  } finally {
    loggerService.log('End - Handle create masking request');
  }
};

// ==================== DATA MODEL JSON HANDLERS ====================

export const getDataModelJsonHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get data model JSON request');
  try {
    const { tenantId } = req as ITenantRequest;

    const dataModelJson = await handleGetDataModelJson(tenantId);

    if (!dataModelJson) {
      reply.status(200).send({
        success: true,
        data: null,
        message: `No data model JSON found for tenant: ${tenantId}`,
      });
      return;
    }

    reply.status(200).send({
      success: true,
      data: dataModelJson,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get data model JSON');
  } finally {
    loggerService.log('End - Handle get data model JSON request');
  }
};

export const putDataModelJsonHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle put data model JSON request');
  try {
    const { tenantId } = req as ITenantRequest;
    const body = req.body as { data_model_json: Record<string, unknown> };

    if (!body?.data_model_json) {
      reply.status(400).send({ success: false, message: 'data_model_json is required in request body' });
      return;
    }

    const result = await handleUpsertDataModelJson(tenantId, body.data_model_json);

    reply.status(200).send({
      success: true,
      message: `Data model JSON saved for tenant: ${tenantId}`,
      data: result,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to save data model JSON');
  } finally {
    loggerService.log('End - Handle put data model JSON request');
  }
};

export const getAllMasksHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { tenantId } = req as ITenantRequest;
    const body = authReq.body as Record<string, string>;
    const { offset = '0', limit = '10' } = req.params as { offset?: string; limit?: string };
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    const result = await findMasksWithFilters(parsedLimit, parsedOffset, body, tenantId);
    reply.code(200).send({
      success: true,
      masks: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      pages: Math.ceil(result.total / result.limit),
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get masks');
  }
};

export const updateMaskHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { tenantId } = req as ITenantRequest;
    const { id } = req.params as { id: string };
    const updateData = req.body as Record<string, unknown>;
    const maskId = parseInt(id, 10);

    if (!id || isNaN(maskId)) {
      reply.code(400).send({ success: false, message: 'Invalid masking configuration ID' });
      return;
    }

    const updated = await handleUpdateMask(maskId, tenantId, updateData);

    reply.code(200).send({
      success: true,
      message: `Masking configuration with id ${maskId} updated successfully`,
      mask: updated,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to update masking configuration');
  }
};

export const getMaskByIdHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { tenantId } = req as ITenantRequest;
    const { id } = req.params as { id: string };
    const maskId = parseInt(id, 10);

    if (!id || isNaN(maskId)) {
      reply.code(400).send({ success: false, message: 'Invalid masking configuration ID' });
      return;
    }

    const mask = await handleGetMaskById(maskId, tenantId);

    if (!mask) {
      ErrorHandler.sendError(reply, { status: 404 }, `Masking configuration with id ${maskId} not found`);
      return;
    }

    reply.code(200).send({
      success: true,
      mask,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get masking configuration');
  }
};
