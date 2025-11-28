import type { FastifyReply, FastifyRequest } from 'fastify';
import { databaseService } from '..';
import type { ConfigType, ISuccess, Job, JobStatus, PaginatedResult, ScheduleStatus } from '@tazama-lf/tcs-lib';
import type { AuthenticatedRequest } from '../interface/AuthenticatedRequest';

export const createPushJobHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const job = req.body as Partial<Job>;
    const result = (await databaseService.createPushJob(job)) as ISuccess;

    return await reply.code(201).send(result);
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to create push job',
    });
  }
};

export const createPullJobHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const job = req.body as Record<string, unknown>;
    const result = (await databaseService.createPullJob(job)) as ISuccess;

    return await reply.code(201).send(result);
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to create pull job',
    });
  }
};

export const getAllJobsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const body = (authReq.body as Record<string, string> | undefined) ?? {};

    const { offset = '0', limit = '10' } = req.query as { offset?: string; limit?: string };
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    const result = (await databaseService.getAllJobs(parsedLimit, parsedOffset, body, tenantId)) as PaginatedResult<Job>;

    return await reply.code(200).send({
      success: true,
      jobs: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      pages: Math.ceil(result.total / result.limit),
    });
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to fetch jobs',
    });
  }
};

export const getAllJobsHistoryHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const body = (authReq.body as Record<string, string> | undefined) ?? {};

    const { offset = '0', limit = '10' } = req.query as { offset?: string; limit?: string };
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    const result = (await databaseService.getJobHistory(parsedLimit, parsedOffset, tenantId, body)) as PaginatedResult<Job>;

    return await reply.code(200).send({
      success: true,
      data: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      pages: Math.ceil(result.total / result.limit),
    });
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to fetch jobs',
    });
  }
};

export const findJobByIdHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const { id } = req.params as { id: string };
    const { tableName } = req.query as { tableName: string };
    const job = (await databaseService.findJobById(id, tableName)) as Job | null;

    if (job === null) {
      return await reply.code(404).send({
        success: false,
        message: `Job with ID ${id} not found.`,
      });
    }

    return await reply.code(200).send(job);
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to retrieve Job',
    });
  }
};

export const updateJobHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const { id } = req.params as { id: string };
    const { job, type } = req.body as { job: Record<string, unknown>; type: ConfigType };
    const result = await databaseService.updateJob(id, job, type);

    return await reply.code(200).send(result);
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to update job',
    });
  }
};

export const getJobsByStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const { tenantId, status, page, limit } = req.query as {
      tenantId: string;
      status: JobStatus;
      page: number;
      limit: number;
    };

    const jobs = await databaseService.getJobsByStatus(tenantId, status, page, limit);

    return await reply.code(200).send(jobs);
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to fetch jobs by status',
    });
  }
};

export const updateJobActivationHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const { id } = req.params as { id: string };
    const { status, tableName } = req.body as { status: ScheduleStatus; tableName: string };

    const updatedJob = (await databaseService.updateJobActivation(id, status, tableName)) as Job[];

    return await reply.code(200).send({
      success: true,
      message: `Job publishing status updated successfully (${updatedJob.length} row(s) affected).`,
      data: updatedJob[0],
    });
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to update Job publishing status',
    });
  }
};

export const updateJobByStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason?: string };
    const { type, status } = req.query as { tenantId: string; type: ConfigType; status: JobStatus };

    const updatedCount = await databaseService.updateJobByStatus(status, id, type, reason);

    return await reply.code(200).send({
      success: true,
      message: `Job publishing status updated successfully (${updatedCount} row(s) affected).`,
    });
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Failed to update job publishing status',
    });
  }
};

export const validateTableHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
  try {
    const { tableName } = req.query as { tableName: string };

    await databaseService.validateExisting(tableName);

    return await reply.code(200).send({
      success: true,
      message: 'Table does not exists',
    });
  } catch (error) {
    const err = error as Error;
    return await reply.code(500).send({
      success: false,
      message: err.message || 'Table Already Exists',
    });
  }
};
