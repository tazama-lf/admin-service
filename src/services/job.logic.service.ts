import type { PushJob } from '@tazama-lf/tcs-lib';
import { loggerService } from '..';
import {
  createPushJob,
  getAllJobs,
  createPullJob,
  getJobHistory,
  findJobById,
  getJobsByStatus,
  updateJob,
  updateJobActivation,
  updateJobByStatus,
  tableExist,
  validateExisting,
  validateActive,
} from '../repositories/dateEnrichment/job.de.repository';
import type {
  ConfigType,
  ISuccess,
  Job,
  JobStatus,
  JobSummary,
  PaginatedResult,
  PullJobHistory,
  ScheduleStatus,
} from '../interface/data-enrichment.interface';

export const handleCreatePushJob = async (job: Partial<PushJob>, tenantId: string): Promise<{ message: string }> => {
  try {
    loggerService.log('Started handling post request of push job');

    const body = { ...job, tenant_id: tenantId };
    const createdCronId = await createPushJob(body);

    loggerService.log('New push job was saved successfully.');

    return {
      message: `Push Job with id ${createdCronId} created Successfully`,
    };
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: posting cron job with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleGetAllJobs = async (
  limit: number,
  offset: number,
  payload: Record<string, string>,
  tenantId: string,
): Promise<PaginatedResult<Job>> => {
  try {
    loggerService.log(`Started handling get all DE jobs request for tenant: ${tenantId} with limit ${limit} and offset ${offset}`);

    const result = await getAllJobs(limit, offset, payload, tenantId);

    loggerService.log(`Retrieved ${result.data.length} DE jobs successfully.`);
    return result;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: getting all DE jobs with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleCreatePullJob = async (job: Partial<Job>, tenantId: string): Promise<ISuccess> => {
  try {
    loggerService.log('Started handling post request of pull job');

    const body = { ...job, tenant_id: tenantId };
    const result = await createPullJob(body);

    loggerService.log('New pull job was saved successfully.');

    return result;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: posting pull job with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleGetJobHistory = async (
  limit: number,
  offset: number,
  tenantId: string,
  payload: Record<string, string> = {},
): Promise<PaginatedResult<PullJobHistory>> => {
  try {
    loggerService.log(`Started handling get job history request for tenant: ${tenantId}`);

    const result = await getJobHistory(limit, offset, tenantId, payload);

    loggerService.log(`Retrieved ${result.data.length} job history records successfully.`);
    return result;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: getting job history with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleFindJobById = async (id: string, tableName: string): Promise<Job | null> => {
  try {
    loggerService.log(`Started handling find job by id: ${id} in table: ${tableName}`);

    const result = await findJobById(id, tableName);

    if (result) {
      loggerService.log(`Job with id ${id} found successfully.`);
    } else {
      loggerService.log(`Job with id ${id} not found.`);
    }
    return result;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: finding job by id with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleGetJobsByStatus = async (tenantId: string, status: JobStatus, page: number, limit: number): Promise<JobSummary[]> => {
  try {
    loggerService.log(`Started handling get jobs by status: ${status} for tenant: ${tenantId}`);

    const result = await getJobsByStatus(tenantId, status, page, limit);

    loggerService.log(`Retrieved ${result.length} jobs with status ${status} successfully.`);
    return result;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: getting jobs by status with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleUpdateJob = async (
  id: string,
  job: Record<string, unknown>,
  type: ConfigType,
): Promise<{ success: boolean; message: string }> => {
  try {
    loggerService.log(`Started handling update job with id: ${id}`);

    const result = await updateJob(id, job, type);

    loggerService.log(`Job with id ${id} updated successfully.`);
    return result;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: updating job with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleUpdateJobActivation = async (id: string, status: ScheduleStatus, type: ConfigType): Promise<Job[]> => {
  try {
    loggerService.log(`Started handling update job activation for id: ${id} to status: ${status}`);

    const result = await updateJobActivation(id, status, type);

    loggerService.log(`Job activation status updated successfully for id ${id}.`);
    return result;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: updating job activation with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleUpdateJobByStatus = async (status: JobStatus, id: string, type: ConfigType, reason?: string): Promise<number | null> => {
  try {
    loggerService.log(`Started handling update job status for id: ${id} to status: ${status}`);

    const result = await updateJobByStatus(status, id, type, reason);

    loggerService.log(`Job status updated successfully for id ${id}.`);
    return result;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: updating job status with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleTableExist = async (tableName: string): Promise<boolean> => {
  try {
    loggerService.log(`Checking if table exists: ${tableName}`);

    const result = await tableExist(tableName);

    loggerService.log(`Table ${tableName} ${result ? 'exists' : 'does not exist'}.`);
    return result;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: checking table existence with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleValidateExisting = async (tableName: string): Promise<boolean> => {
  try {
    loggerService.log(`Validating existing table: ${tableName}`);

    const result = await validateExisting(tableName);

    loggerService.log(`Table validation completed for ${tableName}.`);
    return result;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: validating existing table with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleValidateActive = async (tableName: string, type: ConfigType): Promise<void> => {
  try {
    loggerService.log(`Validating active jobs for table: ${tableName}`);

    await validateActive(tableName, type);

    loggerService.log(`Active jobs validation completed for ${tableName}.`);
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: validating active jobs with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};
