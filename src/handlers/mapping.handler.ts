// SPDX-License-Identifier: Apache-2.0

import type { FastifyRequest, FastifyReply } from 'fastify';
import { databaseService, loggerService } from '../index';
import type { ITenantRequest } from '../interface/ITenantRequest';
import type { FieldMapping, AddMappingDto } from '@tazama-lf/tcs-lib';

function sendError(reply: FastifyReply, status: number, message: string, data: unknown = null): void {
  reply.status(status).send({ success: false, message, data });
}

export const addMappingHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const mappingDto = req.body as AddMappingDto;

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      sendError(reply, 404, 'Config not found');
      return;
    }

    const normalizedSource = Array.isArray(mappingDto.source) ? mappingDto.source : mappingDto.source ? [mappingDto.source] : undefined;

    const newMapping: FieldMapping = {
      ...mappingDto,
      source: normalizedSource,
      destination: mappingDto.destination as string | string[],
    };

    const updatedMappings = [...(config.mapping ?? []), newMapping];

    const updatedConfig = await databaseService.updateConfig(Number(id), tenantId, {
      mapping: updatedMappings,
    });

    reply.status(200).send({
      success: true,
      message: 'Mapping added successfully',
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`Failed to add mapping: ${error.message}`, error.stack ?? '');
    sendError(reply, 500, `Failed to add mapping: ${error.message}`);
  }
};
export const removeMappingHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id, index } = req.params as { id: string; index: string };
    const { tenantId } = req as ITenantRequest;
    const mappingIndex = Number(index);

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      sendError(reply, 404, 'Config not found');
      return;
    }

    if (!config.mapping || mappingIndex < 0 || mappingIndex >= config.mapping.length) {
      sendError(reply, 400, 'Invalid mapping index');
      return;
    }

    const updatedMappings = config.mapping.filter((_item: FieldMapping, idx: number) => idx !== mappingIndex);

    await databaseService.updateConfig(Number(id), tenantId, {
      mapping: updatedMappings.length > 0 ? updatedMappings : [],
    });

    reply.status(200).send({
      success: true,
      message: 'Mapping removed successfully',
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`Failed to remove mapping: ${error.message}`, error.stack ?? '');
    sendError(reply, 500, `Failed to remove mapping: ${error.message}`);
  }
};
