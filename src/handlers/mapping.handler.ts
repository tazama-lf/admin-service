// SPDX-License-Identifier: Apache-2.0
import type { FastifyRequest, FastifyReply } from 'fastify';
import { databaseService, loggerService } from '../index';
import type { ITenantRequest } from '../interface/ITenantRequest';
import type { FieldMapping, AddMappingDto } from '@tazama-lf/tcs-lib';

export const addMappingHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  // loggerService.log('Start - Handle add mapping request');

  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const mappingDto = req.body as AddMappingDto;

    // loggerService.log(`Adding mapping to config ${id} for tenant ${tenantId}`);

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      reply.status(404).send({
        success: false,
        message: 'Config not found',
      });
      return;
    }

    const newMapping: FieldMapping = mappingDto as FieldMapping;

    const updatedMappings = [...(config.mapping ?? []), newMapping];

    const updatedConfig = await databaseService.updateConfig(Number(id), tenantId, {
      mapping: updatedMappings,
    });

    // const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    // loggerService.log(`Successfully added mapping to config ${id}`);

    reply.status(200).send({
      success: true,
      message: 'Mapping added successfully',
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`Failed to add mapping: ${error.message}`, error.stack ?? '');
    reply.status(500).send({
      success: false,
      message: `Failed to add mapping: ${error.message}`,
    });
  }
};
export const removeMappingHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle remove mapping request');

  try {
    const { id, index } = req.params as { id: string; index: string };
    const { tenantId } = req as ITenantRequest;
    const mappingIndex = Number(index);

    loggerService.log(`Removing mapping at index ${mappingIndex} from config ${id} for tenant ${tenantId}`);

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      reply.status(404).send({
        success: false,
        message: 'Config not found',
      });
      return;
    }

    if (!config.mapping || mappingIndex < 0 || mappingIndex >= config.mapping.length) {
      reply.status(400).send({
        success: false,
        message: 'Invalid mapping index',
      });
      return;
    }

    const updatedMappings = config.mapping.filter((_item: FieldMapping, idx: number) => idx !== mappingIndex);

    await databaseService.updateConfig(Number(id), tenantId, {
      mapping: updatedMappings.length > 0 ? updatedMappings : [],
    });

    // const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    loggerService.log(`Successfully removed mapping at index ${mappingIndex} from config ${id}`);

    reply.status(200).send({
      success: true,
      message: 'Mapping removed successfully',
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`Failed to remove mapping: ${error.message}`, error.stack ?? '');
    reply.status(500).send({
      success: false,
      message: `Failed to remove mapping: ${error.message}`,
    });
  }
};
