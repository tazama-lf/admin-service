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
// import { ConfigStatus, ContentType, FieldMapping, FunctionDefinition, JSONSchema } from '@tazama-lf/tcs-lib';

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
