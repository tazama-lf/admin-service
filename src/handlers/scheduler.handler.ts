import type { JobStatus, Schedule } from '@tazama-lf/tcs-lib';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { databaseService } from '../index';

export const createScheduleHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const schedule = req.body as Record<string, unknown>;
    const scheduleId = await databaseService.createSchedule(schedule);

    return await reply.code(201).send({
      success: true,
      message: `Schedule created with id ${scheduleId} successfully`,
    });
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to create schedule',
    });
  }
};

export const findScheduleByIdHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const { id } = req.params as { id: string };
    const schedule = (await databaseService.findScheduleById(id)) as Schedule | null;

    if (!schedule) {
      return await reply.code(404).send({
        success: false,
        message: `Schedule with ID ${id} not found.`,
      });
    }

    return await reply.code(200).send(schedule);
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to retrieve schedule',
    });
  }
};

export const updateScheduleHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const { id } = req.params as { id: string };
    const attributes = req.body as Record<string, unknown>;
    const updatedCount = await databaseService.updateSchedule(id, attributes);

    return await reply.code(200).send({
      success: true,
      message: `Schedule updated successfully (${updatedCount} row(s) affected).`,
    });
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to update schedule',
    });
  }
};

export const getAllScheduleHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const { tenantId, page, limit } = req.query as {
      tenantId: string;
      page: number;
      limit: number;
    };

    const schedules = await databaseService.getAllSchedule(tenantId, page, limit);

    return await reply.code(200).send(schedules);
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to fetch schedules',
    });
  }
};
export const getScheduleByStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const { tenantId, status, page, limit } = req.query as {
      tenantId: string;
      status: JobStatus;
      page: number;
      limit: number;
    };

    const schedules = await databaseService.getScheduleByStatus(tenantId, status, page, limit);

    return await reply.code(200).send(schedules);
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to fetch schedules by status',
    });
  }
};

export const updateScheduleByStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const { id } = req.params as { id: string };
    const { reason, tenantId } = req.body as { reason?: string; tenantId: string };
    const { status } = req.query as { status: JobStatus };

    const updatedCount = await databaseService.updateScheduleByStatus(status, id, tenantId, reason);

    return await reply.code(200).send({
      success: true,
      message: `Schedule status updated successfully (${updatedCount} row(s) affected).`,
    });
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to update schedule status',
    });
  }
};
