// SPDX-License-Identifier: Apache-2.0
import type { FastifyRequest, FastifyReply } from 'fastify';
import { databaseService, loggerService } from '../index';
import type { ITenantRequest } from '../interface/ITenantRequest';
import type { FieldMapping, AddMappingDto } from '@tazama-lf/tcs-lib';

export const addMappingHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle add mapping request');

  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const mappingDto = req.body as AddMappingDto;

    loggerService.log(`Adding mapping to config ${id} for tenant ${tenantId}`);

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      reply.status(404).send({
        success: false,
        message: 'Config not found',
      });
      return;
    }

    if (!mappingDto.destination && !mappingDto.destinations) {
      reply.status(400).send({
        success: false,
        message: 'Mapping must have at least one destination field',
      });
      return;
    }

    const newMapping = createMappingFromDto(mappingDto);

    const updatedMappings = [...(config.mapping ?? []), newMapping];

    await databaseService.updateConfig(Number(id), tenantId, {
      mapping: updatedMappings,
    });

    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    loggerService.log(`Successfully added mapping to config ${id}`);

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
  } finally {
    loggerService.log('End - Handle add mapping request');
  }
};

export const updateMappingHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle update mapping request');

  try {
    const { id, index } = req.params as { id: string; index: string };
    const { tenantId } = req as ITenantRequest;
    const mappingDto = req.body as AddMappingDto;
    const mappingIndex = Number(index);

    loggerService.log(`Updating mapping at index ${mappingIndex} in config ${id} for tenant ${tenantId}`);

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

    if (!mappingDto.destination && !mappingDto.destinations) {
      reply.status(400).send({
        success: false,
        message: 'Mapping must have at least one destination field',
      });
      return;
    }

    const updatedMapping = createMappingFromDto(mappingDto);

    const updatedMappings = [...config.mapping];
    updatedMappings[mappingIndex] = updatedMapping;

    await databaseService.updateConfig(Number(id), tenantId, {
      mapping: updatedMappings,
    });

    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    loggerService.log(`Successfully updated mapping at index ${mappingIndex} in config ${id}`);

    reply.status(200).send({
      success: true,
      message: 'Mapping updated successfully',
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`Failed to update mapping: ${error.message}`, error.stack ?? '');
    reply.status(500).send({
      success: false,
      message: `Failed to update mapping: ${error.message}`,
    });
  } finally {
    loggerService.log('End - Handle update mapping request');
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

    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    loggerService.log(`Successfully removed mapping at index ${mappingIndex} from config ${id}`);

    reply.status(200).send({
      success: true,
      message: 'Mapping removed successfully',
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`Failed to remove mapping: ${error.message}`, error.stack ?? '');
    reply.status(500).send({
      success: false,
      message: `Failed to remove mapping: ${error.message}`,
    });
  } finally {
    loggerService.log('End - Handle remove mapping request');
  }
};

function createMappingFromDto(dto: AddMappingDto): FieldMapping {
  if (dto.sources && dto.sources.length > 0) {
    if (dto.sources.length < 2) {
      throw new Error('Concat mapping requires at least 2 source fields');
    }
    if (!dto.destination) {
      throw new Error('Concat mapping requires a destination field');
    }
    const mapping: FieldMapping = {
      source: dto.sources,
      destination: dto.destination,
      transformation: 'CONCAT' as const,
      delimiter: dto.delimiter ?? ' ',
    };
    if (dto.prefix !== undefined) {
      mapping.prefix = dto.prefix;
    }
    return mapping;
  }

  if (dto.sumFields && dto.sumFields.length > 0) {
    if (dto.sumFields.length < 2) {
      throw new Error('Sum mapping requires at least 2 source fields');
    }
    if (!dto.destination) {
      throw new Error('Sum mapping requires a destination field');
    }
    const mapping: FieldMapping = {
      source: dto.sumFields,
      destination: dto.destination,
      transformation: 'SUM' as const,
    };
    if (dto.prefix !== undefined) {
      mapping.prefix = dto.prefix;
    }
    return mapping;
  }

  if (dto.source && dto.destinations && dto.destinations.length > 0) {
    const mapping: FieldMapping = {
      source: [dto.source],
      destination: dto.destinations,
      transformation: 'SPLIT' as const,
      delimiter: dto.delimiter ?? ',',
    };
    if (dto.prefix !== undefined) {
      mapping.prefix = dto.prefix;
    }
    return mapping;
  }

  if (dto.source && dto.destination) {
    const mapping: FieldMapping = {
      source: [dto.source],
      destination: dto.destination,
      transformation: 'NONE' as const,
    };
    if (dto.prefix !== undefined) {
      mapping.prefix = dto.prefix;
    }
    return mapping;
  }

  if (dto.constantValue !== undefined && dto.destination) {
    const mapping: FieldMapping = {
      destination: dto.destination,
      transformation: 'CONSTANT' as const,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- constantValue type is defined as any in FieldMapping interface from tcs-lib
      constantValue: dto.constantValue,
    };
    if (dto.prefix !== undefined) {
      mapping.prefix = dto.prefix;
    }
    return mapping;
  }

  throw new Error(
    'Invalid mapping: provide (source, destination), (sources[], destination), (source, destinations[]), or (constantValue, destination)',
  );
}
