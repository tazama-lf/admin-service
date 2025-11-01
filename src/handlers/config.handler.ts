import type { FastifyRequest, FastifyReply } from 'fastify';
import { ConfigStatus, ContentType, type JSONSchema, type FieldMapping, type FunctionDefinition } from '@tazama-lf/tcs-lib';
import { databaseService, loggerService } from '../index';
import type { AuthenticatedRequest } from '../interface/AuthenticatedRequest';

export const getConfigByIdHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

    const configId = parseInt(id);
    if (isNaN(configId)) {
      return await reply.code(400).send({
        success: false,
        message: `Invalid config ID: ${id}. Must be a valid number.`,
      });
    }

    const config = await databaseService.findConfigById(configId, tenantId);

    if (!config) {
      return await reply.code(404).send({
        success: false,
        message: `Config with id ${id} not found`,
      });
    }

    return await reply.code(200).send({
      success: true,
      config,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message ?? 'Failed to get config',
    });
  }
};

export const getAllConfigsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

    const configs = await databaseService.findConfigsByTenant(tenantId);

    return await reply.code(200).send({
      success: true,
      configs,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message ?? 'Failed to get configs',
    });
  }
};

export const getConfigByTransactionTypeHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { transactionType } = req.params as { transactionType: string };
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

    const configs = await databaseService.findConfigsByTransactionType(transactionType, tenantId);

    return await reply.code(200).send({
      success: true,
      configs,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message ?? 'Failed to get configs by transaction type',
    });
  }
};

export const getConfigsByVersionHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { version, endpointPath } = req.params as { version: string; endpointPath: string };
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

    if (!endpointPath || !version) {
      return await reply.code(400).send({
        success: false,
        message: 'Missing required query parameters: path and version',
      });
    }

    const config = await databaseService.findConfigByEndpoint(endpointPath, version, tenantId);

    if (!config) {
      return await reply.code(404).send({
        success: false,
        message: `Config not found for endpoint ${endpointPath} version ${version}`,
      });
    }

    return await reply.code(200).send({
      success: true,
      config,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message ?? 'Failed to get config by endpoint',
    });
  }
};

export const getActiveConfigsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

    const configs = await databaseService.findConfigsByStatus(ConfigStatus.UNDER_REVIEW, tenantId);

    return await reply.code(200).send({
      success: true,
      configs,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message ?? 'Failed to get pending approvals',
    });
  }
};

export const createConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const configData = req.body as Record<string, unknown>;
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const userId = authReq.user?.clientId ?? authReq.user?.sub ?? authReq.user?.preferred_username ?? 'system';

    const newConfig = {
      msgFam: (configData.msgFam as string) ?? '',
      transactionType: (configData.transactionType as string) ?? '',
      endpointPath: (configData.endpointPath as string) ?? '',
      version: (configData.version as string) ?? '',
      contentType: (configData.contentType as ContentType) ?? ContentType.JSON,
      schema: configData.schema as JSONSchema,
      mapping: configData.mapping as FieldMapping[],
      functions: configData.functions as FunctionDefinition[],
      status: ConfigStatus.IN_PROGRESS,
      tenantId,
      createdBy: userId,
    };

    const configId = await databaseService.createConfig(newConfig);

    return await reply.code(201).send({
      success: true,
      message: 'Config created successfully',
      config: { ...newConfig, id: configId },
    });
  } catch (error: unknown) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message ?? 'Failed to create config',
    });
  }
};

export const updateConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const updateData = req.body as Record<string, unknown>;
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

    const existingConfig = await databaseService.findConfigById(parseInt(id), tenantId);
    if (!existingConfig) {
      return await reply.code(404).send({
        success: false,
        message: `Config with id ${id} not found`,
      });
    }

    await databaseService.updateConfig(
      parseInt(id),
      tenantId,
      updateData as {
        msgFam?: string;
        transactionType?: string;
        endpointPath?: string;
        version?: string;
        contentType?: string;
        schema?: JSONSchema;
        mapping?: FieldMapping[];
        functions?: FunctionDefinition[];
        status?: string;
      },
    );

    return await reply.code(200).send({
      success: true,
      message: 'Config updated successfully',
    });
  } catch (error: unknown) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message ?? 'Failed to update config',
    });
  }
};

export const cloneConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { sourceId, transactionType, version } = req.body as {
      sourceId: number;
      transactionType?: string;
      version?: string;
    };
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const userId = authReq.user?.clientId ?? 'system';

    const sourceConfig = await databaseService.findConfigById(sourceId, tenantId);
    if (!sourceConfig) {
      return await reply.code(404).send({
        success: false,
        message: `Source config with id ${sourceId} not found`,
      });
    }

    const clonedConfig = {
      msgFam: sourceConfig.msgFam,
      transactionType: transactionType ?? sourceConfig.transactionType,
      endpointPath: sourceConfig.endpointPath,
      version: version ?? sourceConfig.version,
      contentType: sourceConfig.contentType,
      schema: sourceConfig.schema,
      mapping: sourceConfig.mapping,
      functions: sourceConfig.functions,
      status: ConfigStatus.IN_PROGRESS,
      tenantId,
      createdBy: userId,
    };

    const configId = await databaseService.createConfig(clonedConfig);

    return await reply.code(201).send({
      success: true,
      message: 'Config cloned successfully',
      config: { ...clonedConfig, id: configId },
    });
  } catch (error: unknown) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message ?? 'Failed to clone config',
    });
  }
};

export const deleteConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

    const existingConfig = await databaseService.findConfigById(parseInt(id), tenantId);
    if (!existingConfig) {
      return await reply.code(404).send({
        success: false,
        message: `Config with id ${id} not found`,
      });
    }

    await databaseService.deleteConfig(parseInt(id), tenantId);

    return await reply.code(200).send({
      success: true,
      message: 'Config deleted successfully',
    });
  } catch (error: unknown) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message ?? 'Failed to delete config',
    });
  }
};

export const writeConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    loggerService.log('📝 [ADMIN-SERVICE] writeConfigHandler called', 'ConfigHandler');

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
      status: (configData.status as ConfigStatus) ?? ConfigStatus.IN_PROGRESS,
      tenantId,
      createdBy: userId,
    };

    const configId = await databaseService.createConfig(newConfig);

    return await reply.code(201).send({
      success: true,
      message: 'Config written successfully',
      config: { ...newConfig, id: configId },
    });
  } catch (error: unknown) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message ?? 'Failed to write config',
    });
  }
};

export const writeConfigUpdateHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const updateData = req.body as Record<string, unknown>;
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

    const existingConfig = await databaseService.findConfigById(parseInt(id), tenantId);
    if (!existingConfig) {
      return await reply.code(404).send({
        success: false,
        message: `Config with id ${id} not found`,
      });
    }

    await databaseService.updateConfig(
      parseInt(id),
      tenantId,
      updateData as {
        msgFam?: string;
        transactionType?: string;
        endpointPath?: string;
        version?: string;
        contentType?: string;
        schema?: JSONSchema;
        mapping?: FieldMapping[];
        functions?: FunctionDefinition[];
        status?: string;
      },
    );

    return await reply.code(200).send({
      success: true,
      message: 'Config updated successfully',
    });
  } catch (error: unknown) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message ?? 'Failed to update config',
    });
  }
};
