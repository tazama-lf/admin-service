import type { AccountCondition, EntityCondition } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import type { FastifyReply, FastifyRequest } from 'fastify';
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
import { handlePostConfig, handleFindConfigByID, handleGetAllConfigs } from './services/tcs-config.logic.service';

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
