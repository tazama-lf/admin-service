import {
  createCronJob,
  findCronJobById,
  updateCronJob,
  getAllCronJobs,
  getCronJobByStatus,
  updateCronJobByStatus,
} from '../repositories/dateEnrichment/cron.de.repository';
import { loggerService } from '..';
import type { CronJob, JobStatus, PaginatedResult } from '../interface/data-enrichment.interface';

export const handlePostCron = async (cron: Record<string, unknown>, tenantId: string): Promise<{ message: string }> => {
  try {
    loggerService.log('Started handling post request of cron executed');

    const body = { ...cron, tenant_id: tenantId };
    const createdCronId = await createCronJob(body);

    loggerService.log('New cron job was saved successfully.');

    return {
      message: `Cron Job with id ${createdCronId} created Successfully`,
    };
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: posting cron job with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleGetCronById = async (id: string): Promise<CronJob | null> => {
  try {
    loggerService.log(`Started handling get request for cron job with id: ${id}`);

    const cronJob = await findCronJobById(id);

    if (!cronJob) {
      loggerService.log(`Cron job with id ${id} not found.`);
      return null;
    }

    loggerService.log(`Cron job with id ${id} retrieved successfully.`);
    return cronJob;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: getting cron job with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleUpdateCron = async (id: string, attr: Record<string, unknown>): Promise<{ message: string }> => {
  try {
    loggerService.log(`Started handling update request for cron job with id: ${id}`);

    const rowCount = await updateCronJob(id, attr);

    if (rowCount === 0 || rowCount === null) {
      loggerService.log(`No cron job found with id: ${id}`);
      throw new Error(`No cron job found with id: ${id}`);
    }

    loggerService.log(`Cron job with id ${id} updated successfully.`);
    return {
      message: `Cron job with id ${id} updated successfully`,
    };
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: updating cron job with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleGetAllCrons = async (
  limit: number,
  offset: number,
  payload: Record<string, string>,
  tenantId: string,
): Promise<PaginatedResult<CronJob>> => {
  try {
    loggerService.log(`Started handling get all cron jobs request for tenant: ${tenantId}`);

    const result = await getAllCronJobs(limit, offset, payload, tenantId);

    loggerService.log(`Retrieved ${result.data.length} cron jobs successfully.`);
    return result;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: getting all cron jobs with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleGetCronByStatus = async (tenantId: string, status: JobStatus, page: number, limit: number): Promise<CronJob[]> => {
  try {
    loggerService.log(`Started handling get cron jobs by status: ${status} for tenant: ${tenantId}`);

    const cronJobs = await getCronJobByStatus(tenantId, status, page, limit);

    loggerService.log(`Retrieved ${cronJobs.length} cron jobs with status ${status} successfully.`);
    return cronJobs;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: getting cron jobs by status with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleUpdateCronStatus = async (status: JobStatus, id: string, reason?: string): Promise<{ message: string }> => {
  try {
    loggerService.log(`Started handling update status request for cron job with id: ${id}`);

    const rowCount = await updateCronJobByStatus(status, id, reason);

    if (rowCount === 0 || rowCount === null) {
      loggerService.log(`No cron job found with id: ${id}`);
      throw new Error(`No cron job found with id: ${id}`);
    }

    loggerService.log(`Cron job with id ${id} status updated to ${status} successfully.`);
    return {
      message: `Cron job with id ${id} status updated successfully`,
    };
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: updating cron job status with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};
