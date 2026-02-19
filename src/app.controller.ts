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
  handleGetAllTransactionTypes,
  handleGetPayloadByTransactionType,
  handleGetConfigByTransactionType,
} from './services/tcs-config.logic.service';

import { handleGetReportRequestByMsgId } from './services/report.logic.service';

import {
  handleGetAllCollections,
  handleGetCollectionFields,
  handleCreateDestinationType,
  handleDestinationTypeExists,
  handleAddFieldToDestinationType,
} from './services/data-model.logic.service';
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
import type { CloneRuleHandlerReqBody, CreateRuleHandlerReqBody } from './interface/rule.interface';
import { findActiveNetworkMap } from './services/network-map.service';
import { getSimulationLogs, createSimulationLogs } from './services/simulation-logs.logic.service';
import { decodeInnerToken } from './utils/decode-token';
import type { ISimulationBody } from './interface/simulattionLogs.interface';

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
    loggerService.log(`getAllConfigsHandler-body--1: ${JSON.stringify(req.body)}`);

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

// ==================== TRS ====================
export const createNodeHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
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
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
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
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
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
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
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

export const getGlobalVariablesHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { ruleId, tenantId } = req.params as { ruleId: string; tenantId: string };

    const globalVariables = await getGlobalVariables(ruleId, tenantId);

    if (!globalVariables?.ruleRequest || !globalVariables.configuration) {
      ErrorHandler.sendError(reply, { status: 404 }, `Global variables not found for rule ${ruleId} and tenant ${tenantId}`);
      return;
    }

    const RuleRequest: unknown = globalVariables.ruleRequest;
    const RuleConfig: unknown = globalVariables.configuration;

    const RuleResult = {
      id: ruleId,
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
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

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
    // const { tenantId } = req as ITenantRequest;
    const token = authReq.user?.tenantId ?? 'DEFAULT';

    const { payload, ruleRequest } = req.body as CloneRuleHandlerReqBody;

    const clonedRule = await cloneRule(ruleId, payload, authReq.user?.clientId ?? 'default', token, ruleRequest);
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
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
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
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
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
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

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
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

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
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
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
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
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
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

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

    const errorMessage = error instanceof Error ? error.message : 'Failed to get active network map';
    ErrorHandler.sendError(reply, { status: 500 }, errorMessage);
  }
};

export const createSimulationLogsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
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
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
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

export const getRuleFlowStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId;
    const { ruleId } = req.params as { ruleId: string };
    const query = req.query as { category?: string };

    const ruleFlow = await getRuleFlowStatus(
      ruleId,
      tenantId ?? '',
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
    const errorMessage = error instanceof Error ? error.message : 'Failed to get transaction types';
    loggerService.error(`Failed to get transaction types: ${errorMessage}`, 'getTransactionTypesHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle get transaction types request');
  }
};

export const getPayloadByTransactionTypeHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get payload by transaction type request');
  try {
    const { tenantId } = req as ITenantRequest;
    const { transactionType } = req.params as { transactionType: string };

    if (!transactionType) {
      reply.status(400).send({ success: false, message: 'Transaction type is required' });
      return;
    }

    const payload = await handleGetPayloadByTransactionType(transactionType, tenantId);

    reply.status(200).send({
      success: true,
      transactionType,
      tenantId,
      payload,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get payload by transaction type';
    loggerService.error(`Failed to get payload: ${errorMessage}`, 'getPayloadByTransactionTypeHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle get payload by transaction type request');
  }
};

export const getConfigByTransactionTypeHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get config by transaction type request');
  try {
    const { tenantId } = req as ITenantRequest;
    const { transactionType } = req.params as { transactionType: string };

    if (!transactionType) {
      reply.status(400).send({ success: false, message: 'Transaction type is required' });
      return;
    }

    const config = await handleGetConfigByTransactionType(transactionType, tenantId);

    reply.status(200).send({
      success: true,
      transactionType,
      tenantId,
      config,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get config by transaction type';
    loggerService.error(`Failed to get config: ${errorMessage}`, 'getConfigByTransactionTypeHandler');
    reply.status(500).send({ success: false, message: errorMessage });
  } finally {
    loggerService.log('End - Handle get config by transaction type request');
  }
};
