// SPDX-License-Identifier: Apache-2.0
import type { FastifyRequest, FastifyReply } from 'fastify';
import { databaseService, loggerService } from '../index';
import type { ITenantRequest } from '../interface/ITenantRequest';
import type { FunctionDefinition, AddFunctionDto } from '@tazama-lf/tcs-lib';

export const addFunctionHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle add function request');

  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const functionDto = req.body as AddFunctionDto;

    loggerService.log(`Adding function to config ${id} for tenant ${tenantId}`);

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      reply.status(404).send({
        success: false,
        message: 'Config not found',
      });
      return;
    }

    const newFunction: FunctionDefinition = {
      functionName: functionDto.functionName,
      params: functionDto.params,
    };

    const updatedFunctions = [...(config.functions ?? []), newFunction];

    await databaseService.updateConfig(Number(id), tenantId, {
      functions: updatedFunctions,
    });

    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    loggerService.log(`Successfully added function '${newFunction.functionName}' to config ${id}`);

    reply.status(200).send({
      success: true,
      message: 'Function added successfully',
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to add function';
    const errorStack = err instanceof Error ? (err.stack ?? '') : '';
    loggerService.error(`Failed to add function: ${errorMessage}`, errorStack);
    reply.status(500).send({
      success: false,
      message: `Failed to add function: ${errorMessage}`,
    });
  } finally {
    loggerService.log('End - Handle add function request');
  }
};

export const updateFunctionHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle update function request');

  try {
    const { id, index } = req.params as { id: string; index: string };
    const { tenantId } = req as ITenantRequest;
    const functionDto = req.body as AddFunctionDto;
    const functionIndex = Number(index);

    loggerService.log(`Updating function at index ${functionIndex} in config ${id} for tenant ${tenantId}`);

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      reply.status(404).send({
        success: false,
        message: 'Config not found',
      });
      return;
    }

    if (!config.functions || functionIndex < 0 || functionIndex >= config.functions.length) {
      reply.status(400).send({
        success: false,
        message: 'Invalid function index',
      });
      return;
    }

    const updatedFunction: FunctionDefinition = {
      functionName: functionDto.functionName,
      params: functionDto.params,
    };

    const updatedFunctions = [...config.functions];
    updatedFunctions[functionIndex] = updatedFunction;

    await databaseService.updateConfig(Number(id), tenantId, {
      functions: updatedFunctions,
    });

    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    loggerService.log(`Successfully updated function at index ${functionIndex} in config ${id}`);

    reply.status(200).send({
      success: true,
      message: 'Function updated successfully',
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to update function';
    const errorStack = err instanceof Error ? (err.stack ?? '') : '';
    loggerService.error(`Failed to update function: ${errorMessage}`, errorStack);
    reply.status(500).send({
      success: false,
      message: `Failed to update function: ${errorMessage}`,
    });
  } finally {
    loggerService.log('End - Handle update function request');
  }
};

export const removeFunctionHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle remove function request');

  try {
    const { id, index } = req.params as { id: string; index: string };
    const { tenantId } = req as ITenantRequest;
    const functionIndex = Number(index);

    loggerService.log(`Removing function at index ${functionIndex} from config ${id} for tenant ${tenantId}`);

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      reply.status(404).send({
        success: false,
        message: 'Config not found',
      });
      return;
    }

    if (!config.functions || functionIndex < 0 || functionIndex >= config.functions.length) {
      reply.status(400).send({
        success: false,
        message: 'Invalid function index',
      });
      return;
    }

    const updatedFunctions = config.functions.filter((_item: FunctionDefinition, idx: number) => idx !== functionIndex);

    await databaseService.updateConfig(Number(id), tenantId, {
      functions: updatedFunctions.length > 0 ? updatedFunctions : [],
    });

    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    loggerService.log(`Successfully removed function at index ${functionIndex} from config ${id}`);

    reply.status(200).send({
      success: true,
      message: 'Function removed successfully',
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to remove function';
    const errorStack = err instanceof Error ? (err.stack ?? '') : '';
    loggerService.error(`Failed to remove function: ${errorMessage}`, errorStack);
    reply.status(500).send({
      success: false,
      message: `Failed to remove function: ${errorMessage}`,
    });
  } finally {
    loggerService.log('End - Handle remove function request');
  }
};
