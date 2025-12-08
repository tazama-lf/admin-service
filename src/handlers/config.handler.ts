import type { FastifyRequest, FastifyReply } from 'fastify';
import { ConfigStatus, ContentType, type Config, type JSONSchema, type FieldMapping, type FunctionDefinition } from '@tazama-lf/tcs-lib';
import { databaseService, loggerService } from '../index';
import type { AuthenticatedRequest } from '../interface/AuthenticatedRequest';

const sendError = (reply: FastifyReply, status: number, message: string): void => {
  reply.code(status).send({ success: false, message });
};

export const getConfigByIdHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const configId = parseInt(id);
    if (isNaN(configId)) {
      sendError(reply, 400, `Invalid config ID: ${id}. Must be a valid number.`);
      return;
    }
    const config = await databaseService.findConfigById(configId, tenantId);
    if (!config) {
      sendError(reply, 404, `Config with id ${id} not found`);
      return;
    }
    reply.code(200).send({ success: true, config });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get config';
    sendError(reply, 500, errorMessage);
  }
};

export const getAllConfigsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const body = authReq.body as Record<string, string>;
    const { offset = '0', limit = '10' } = req.params as { offset?: string; limit?: string };
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    const result = await databaseService.findConfigsByStatus(parsedLimit, parsedOffset, body, tenantId);
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
    sendError(reply, 500, errorMessage);
  }
};

export const createConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
  const userId = authReq.user?.clientId ?? authReq.user?.sub ?? authReq.user?.preferred_username ?? 'system';
  try {
    const configData = req.body as Record<string, unknown>;
    const newConfig = {
      msgFam: configData.msgFam as string,
      transactionType: configData.transactionType as string,
      endpointPath: configData.endpointPath as string,
      version: configData.version as string,
      contentType: (configData.contentType as ContentType | undefined) ?? ContentType.JSON,
      schema: configData.schema as JSONSchema,
      mapping: configData.mapping as FieldMapping[],
      functions: configData.functions as FunctionDefinition[],
      status: ConfigStatus.IN_PROGRESS,
      tenantId,
      createdBy: userId,
    };
    const configId = await databaseService.createConfig(newConfig);
    reply.code(201).send({ success: true, message: 'Config created successfully', config: { ...newConfig, id: configId } });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create config';
    loggerService.error(`Failed to create config: ${errorMessage}`, 'createConfigHandler');
    sendError(reply, 500, errorMessage);
  }
};

export const updateConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
  const { id } = req.params as { id: string };
  try {
    const updateData = req.body as Record<string, unknown>;
    const existingConfig = await databaseService.findConfigById(parseInt(id), tenantId);
    if (!existingConfig) {
      sendError(reply, 404, `Config with id ${id} not found`);
      return;
    }
    await databaseService.updateConfig(parseInt(id), tenantId, updateData as Partial<Config>);
    const updatedConfig = await databaseService.findConfigById(parseInt(id), tenantId);
    reply.code(200).send({ success: true, message: 'Config updated successfully', config: updatedConfig });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update config';
    loggerService.error(`Failed to update config: ${errorMessage}`, 'updateConfigHandler');
    sendError(reply, 500, errorMessage);
  }
};

export const cloneConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { sourceConfigId, newTransactionType, newVersion, newMsgFam } = req.body as {
      sourceConfigId: number;
      newTransactionType?: string;
      newVersion?: string;
      newMsgFam?: string;
    };
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const userId = authReq.user?.clientId ?? 'system';
    const sourceConfig = await databaseService.findConfigById(sourceConfigId, tenantId);
    if (!sourceConfig) {
      sendError(reply, 404, `Source config with id ${sourceConfigId} not found`);
      return;
    }
    const clonedConfig = {
      msgFam: newMsgFam ?? sourceConfig.msgFam,
      transactionType: newTransactionType ?? sourceConfig.transactionType,
      endpointPath: sourceConfig.endpointPath,
      version: newVersion ?? sourceConfig.version,
      contentType: sourceConfig.contentType,
      schema: sourceConfig.schema,
      mapping: sourceConfig.mapping,
      functions: sourceConfig.functions,
      status: ConfigStatus.IN_PROGRESS,
      tenantId,
      createdBy: userId,
    };
    const configId = await databaseService.createConfig(clonedConfig);
    reply.code(201).send({ success: true, message: 'Config cloned successfully', config: { ...clonedConfig, id: configId } });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to clone config';
    loggerService.error(`Failed to clone config: ${errorMessage}`, 'cloneConfigHandler');
    sendError(reply, 500, errorMessage);
  }
};

export const writeConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const configData = req.body as Record<string, unknown>;
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const userId = authReq.user?.clientId ?? 'system';
    const newConfig = {
      msgFam: configData.msgFam as string,
      transactionType: configData.transactionType as string,
      endpointPath: configData.endpointPath as string,
      version: configData.version as string,
      contentType: configData.contentType as ContentType,
      schema: configData.schema as JSONSchema,
      mapping: configData.mapping as FieldMapping[],
      functions: configData.functions as FunctionDefinition[],
      status: configData.status as ConfigStatus,
      tenantId,
      createdBy: userId,
    };
    const configId = await databaseService.createConfig(newConfig);
    reply.code(201).send({ success: true, message: 'Config written successfully', config: { ...newConfig, id: configId } });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to write config';
    sendError(reply, 500, errorMessage);
  }
};

export const writeConfigUpdateHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const updateData = req.body as Record<string, unknown>;
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    await databaseService.updateConfig(parseInt(id), tenantId, updateData as Partial<Config>);
    const updatedConfig = await databaseService.findConfigById(parseInt(id), tenantId);
    reply.code(200).send({ success: true, message: 'Config updated successfully', config: updatedConfig });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update config';
    sendError(reply, 500, errorMessage);
  }
};

export const createTransactionTypeTableHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { transactionType } = req.body as { transactionType: string };
    if (!transactionType) {
      sendError(reply, 400, 'Transaction type is required');
      return;
    }
    await databaseService.createTransactionTypeTable(transactionType);
    reply.code(201).send({ success: true, message: `Table for transaction type '${transactionType}' created successfully` });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    req.log.error(`Failed to create transaction type table: ${errorMessage}`);
    sendError(reply, 500, errorMessage);
  }
};

export const createTazamaDataModelTableHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { tableName } = req.body as {
      tableName: string;
    };

    await databaseService.createTazamaDataModelTable(tableName);
    reply.code(201).send({ success: true, message: `Table '${tableName}' created successfully` });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    req.log.error(`Failed to create Tazama data model table: ${errorMessage}`);
    sendError(reply, 500, errorMessage);
  }
};

export const updatePublishingStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { publishing_status: publishingStatus } = req.body as { publishing_status?: 'active' | 'inactive' };
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const configId = parseInt(id);
    if (isNaN(configId)) {
      sendError(reply, 400, `Invalid config ID: ${id}. Must be a valid number.`);
      return;
    }
    if (!publishingStatus) {
      sendError(reply, 400, 'publishing_status must be either "active" or "inactive"');
      return;
    }
    const existingConfig = await databaseService.findConfigById(configId, tenantId);
    if (!existingConfig) {
      loggerService.warn(
        `[${tenantId}] Config ${id} NOT FOUND - either doesn't exist or belongs to different tenant`,
        'updatePublishingStatusHandler',
      );
      sendError(reply, 404, `Config ${id} not found. Publishers can only manage configs from their own tenant (${tenantId}).`);
      return;
    }
    await databaseService.updateConfig(configId, tenantId, { publishing_status: publishingStatus });
    loggerService.log(`[${tenantId}] Publishing status updated to '${publishingStatus}' for config ${id}`, 'updatePublishingStatusHandler');
    reply.code(200).send({
      success: true,
      message: `Publishing status updated to ${publishingStatus}`,
      config: { ...existingConfig, publishing_status: publishingStatus },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update publishing status';
    loggerService.error(`Failed to update publishing status: ${errorMessage}`, 'updatePublishingStatusHandler');
    sendError(reply, 500, errorMessage);
  }
};
export const updateConfigByStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status?: string };
    const updatedCount = await databaseService.updateConfigByStatus(id, status);
    reply.code(200).send({ success: true, message: `Job publishing status updated successfully (${updatedCount} row(s) affected).` });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update job publishing status';
    sendError(reply, 500, errorMessage);
  }
};
