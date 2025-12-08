// SPDX-License-Identifier: Apache-2.0

import type { FastifyRequest, FastifyReply } from 'fastify';
import { databaseService, loggerService } from '../index';
import type { ITenantRequest } from '../interface/ITenantRequest';
import type { FunctionDefinition, AddFunctionDto } from '@tazama-lf/tcs-lib';

function sendError(reply: FastifyReply, status: number, message: string, data: unknown = null): void {
  reply.status(status).send({ success: false, message, data });
}

export const addFunctionHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const functionDto = req.body as AddFunctionDto;

    loggerService.log(`Adding function to config ${id} for tenant ${tenantId}`);

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      sendError(reply, 404, 'Config not found');
      return;
    }

    const newFunction: FunctionDefinition = {
      functionName: functionDto.functionName,
      params: functionDto.params ?? [],
      tableName: functionDto.tableName ?? '',
      columns: functionDto.columns ?? [],
    };

    const updatedFunctions = [...(config.functions ?? []), newFunction];

    await databaseService.updateConfig(Number(id), tenantId, {
      functions: updatedFunctions,
    });

    reply.status(200).send({
      success: true,
      message: 'Function added successfully',
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to add function';
    loggerService.error(`Failed to add function: ${errorMessage}`, err instanceof Error ? (err.stack ?? '') : '');
    sendError(reply, 500, `Failed to add function: ${errorMessage}`);
  }
};
export const removeFunctionHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id, index } = req.params as { id: string; index: string };
    const { tenantId } = req as ITenantRequest;
    const functionIndex = Number(index);

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      sendError(reply, 404, 'Config not found');
      return;
    }

    if (!config.functions || functionIndex < 0 || functionIndex >= config.functions.length) {
      sendError(reply, 400, 'Invalid function index');
      return;
    }

    const updatedFunctions = config.functions.filter((_item: FunctionDefinition, idx: number) => idx !== functionIndex);

    await databaseService.updateConfig(Number(id), tenantId, {
      functions: updatedFunctions.length > 0 ? updatedFunctions : [],
    });

    reply.status(200).send({
      success: true,
      message: 'Function removed successfully',
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to remove function';
    loggerService.error(`Failed to remove function: ${errorMessage}`, err instanceof Error ? (err.stack ?? '') : '');
    sendError(reply, 500, `Failed to remove function: ${errorMessage}`);
  }
};
