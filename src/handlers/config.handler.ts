import type { FastifyRequest, FastifyReply } from 'fastify';
import { ConfigStatus, ContentType, type Config, type JSONSchema, type FieldMapping, type FunctionDefinition } from '@tazama-lf/tcs-lib';
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
      message: err.message || 'Failed to get config',
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
      message: err.message || 'Failed to get configs',
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
      message: err.message || 'Failed to get configs by transaction type',
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
      message: err.message || 'Failed to get config by endpoint',
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
      message: err.message || 'Failed to get pending approvals',
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
      contentType: (configData.contentType as ContentType | undefined) ?? ContentType.JSON,
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
    const body = req.body as Record<string, unknown>;

    // Extract field values for better error messages
    const msgFam = (body.msgFam as string | undefined) ?? 'unknown';
    const transactionType = (body.transactionType as string | undefined) ?? 'unknown';
    const version = (body.version as string | undefined) ?? 'v1';

    // Convert technical database errors to user-friendly messages
    let userMessage = 'Failed to create configuration. Please check your input and try again.';
    let statusCode = 500;

    if (
      err.message?.includes('duplicate key value') ||
      err.message?.includes('unique constraint') ||
      err.message?.includes('already exists')
    ) {
      userMessage = `A configuration with Message Family '${msgFam}', Transaction Type '${transactionType}', and Version '${version}' already exists. Please use different values.`;
      statusCode = 400; // Bad Request for duplicate
    } else if (err.message?.includes('validation')) {
      userMessage = `Validation error: ${err.message}`;
      statusCode = 400;
    } else if (err.message?.includes('required')) {
      userMessage = `Missing required field: ${err.message}`;
      statusCode = 400;
    } else if (err.message) {
      // Use the error message if it's already user-friendly
      userMessage = err.message;
    }

    loggerService.error(`Failed to create config: ${err.message}`, 'createConfigHandler');

    return await reply.code(statusCode).send({
      success: false,
      message: userMessage,
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

    await databaseService.updateConfig(parseInt(id), tenantId, updateData as Partial<Config>);
    const updatedConfig = await databaseService.findConfigById(parseInt(id), tenantId);

    return await reply.code(200).send({
      success: true,
      message: 'Config updated successfully',
      config: updatedConfig,
    });
  } catch (error: unknown) {
    const err = error as Error;
    const updateData = req.body as Record<string, unknown>;

    // Extract field values for better error messages
    const msgFam = (updateData.msgFam as string | undefined) ?? 'unknown';
    const transactionType = (updateData.transactionType as string | undefined) ?? 'unknown';
    const version = (updateData.version as string | undefined) ?? 'v1';

    // Convert technical database errors to user-friendly messages
    let userMessage = 'Failed to update configuration. Please check your input and try again.';
    let statusCode = 500;

    if (
      err.message?.includes('duplicate key value') ||
      err.message?.includes('unique constraint') ||
      err.message?.includes('already exists')
    ) {
      userMessage = `A configuration with Message Family '${msgFam}', Transaction Type '${transactionType}', and Version '${version}' already exists. Please use different values.`;
      statusCode = 400;
    } else if (err.message?.includes('validation')) {
      userMessage = `Validation error: ${err.message}`;
      statusCode = 400;
    } else if (err.message?.includes('not found')) {
      userMessage = err.message;
      statusCode = 404;
    } else if (err.message) {
      userMessage = err.message;
    }

    loggerService.error(`Failed to update config: ${err.message}`, 'updateConfigHandler');

    return await reply.code(statusCode).send({
      success: false,
      message: userMessage,
    });
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
      return await reply.code(404).send({
        success: false,
        message: `Source config with id ${sourceConfigId} not found`,
      });
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

    return await reply.code(201).send({
      success: true,
      message: 'Config cloned successfully',
      config: { ...clonedConfig, id: configId },
    });
  } catch (error: unknown) {
    const err = error as Error;
    const { newTransactionType, newVersion } = req.body as {
      sourceConfigId: number;
      newTransactionType?: string;
      newVersion?: string;
      newMsgFam?: string;
    };

    // Convert technical database errors to user-friendly messages
    let userMessage = 'Failed to clone configuration. Please check your input and try again.';
    let statusCode = 500;

    if (
      err.message?.includes('duplicate key value') ||
      err.message?.includes('unique constraint') ||
      err.message?.includes('already exists')
    ) {
      if (newTransactionType !== undefined && newVersion !== undefined) {
        userMessage = `A configuration with Transaction Type '${newTransactionType}' and Version '${newVersion}' already exists. Please use different values.`;
      } else if (newTransactionType !== undefined) {
        userMessage = `A configuration with Transaction Type '${newTransactionType}' already exists. Please use a different transaction type or version.`;
      } else {
        userMessage = 'This configuration already exists. Please use a different transaction type or version.';
      }
      statusCode = 400;
    } else if (err.message?.includes('not found')) {
      userMessage = err.message;
      statusCode = 404;
    } else if (err.message) {
      userMessage = err.message;
    }

    loggerService.error(`Failed to clone config: ${err.message}`, 'cloneConfigHandler');

    return await reply.code(statusCode).send({
      success: false,
      message: userMessage,
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
      message: err.message || 'Failed to delete config',
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
      message: err.message || 'Failed to write config',
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

    await databaseService.updateConfig(parseInt(id), tenantId, updateData as Partial<Config>);
    const updatedConfig = await databaseService.findConfigById(parseInt(id), tenantId);
    return await reply.code(200).send({
      success: true,
      message: 'Config updated successfully',
      config: updatedConfig,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to update config',
    });
  }
};
