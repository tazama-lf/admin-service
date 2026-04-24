import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import {
  ConfigType,
  type ISuccess,
  type Job,
  JobStatus,
  type JobSummary,
  type PaginatedResult,
  type PullJobHistory,
  type PushJob,
  ScheduleStatus,
} from '../../interface/data-enrichment.interface';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import { validateColumnKeys, validateTableName } from '../../utils/enrichment-utils';

const ALLOWED_PUSH_JOB_COLUMNS = new Set([
  'endpoint_name',
  'path',
  'mode',
  'table_name',
  'description',
  'version',
  'status',
  'publishing_status',
  'tenant_id',
  'comments',
]);

const ALLOWED_PULL_JOB_COLUMNS = new Set([
  'endpoint_name',
  'mode',
  'table_name',
  'description',
  'source_type',
  'file',
  'connection',
  'version',
  'status',
  'publishing_status',
  'tenant_id',
  'schedule_id',
  'comments',
]);

const ALLOWED_JOB_TABLES = new Set(['tcs_push_jobs', 'tcs_pull_jobs']);

export const tableExist = async (tableName: string): Promise<boolean> => {
  try {
    const cleanName = tableName.trim().toLowerCase();

    const query = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      ) AS exists;
    `;

    const result = await handlePostExecuteSqlStatement<{ exists: boolean }>(
      {
        text: query,
        values: [cleanName],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return result.rows[0]?.exists ?? false;
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to check if table "${tableName}" exists: ${err.message}`, {
      cause: error,
    });
  }
};

export const validateExisting = async (tableName: string): Promise<boolean> => {
  try {
    validateTableName(tableName);
    const jobResult = await handlePostExecuteSqlStatement<Record<string, unknown>>(
      {
        text: 'SELECT * FROM tcs_pull_jobs WHERE table_name = $1 LIMIT 1;',
        values: [tableName],
      } satisfies PgQueryConfig,
      'configuration',
    );

    const endpointResult = await handlePostExecuteSqlStatement<Record<string, unknown>>(
      {
        text: 'SELECT * FROM tcs_push_jobs WHERE table_name = $1 LIMIT 1;',
        values: [tableName],
      } satisfies PgQueryConfig,
      'configuration',
    );

    const jobExists = jobResult.rows.length > 0;
    const pushExists = endpointResult.rows.length > 0;
    const tableExists = await tableExist(tableName);

    return tableExists || jobExists || pushExists;
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to validate existing table "${tableName}": ${err.message}`, {
      cause: error,
    });
  }
};

export const validateActive = async (tableName: string, type: ConfigType): Promise<void> => {
  const targetTable = type === ConfigType.PULL ? 'tcs_pull_jobs' : 'tcs_push_jobs';
  try {
    const query = `
      SELECT COUNT(*) AS count
      FROM ${targetTable}
      WHERE table_name = $1 AND publishing_status = 'active'
    `;

    const result = await handlePostExecuteSqlStatement<{ count: string }>(
      {
        text: query,
        values: [tableName],
      } satisfies PgQueryConfig,
      'configuration',
    );

    if (Number(result.rows[0].count) > 0) {
      throw new Error('Deactivate jobs with the table name used');
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'Deactivate jobs with the table name used') {
      throw err;
    }

    throw new Error(`Failed to validate active jobs for table "${tableName}"`, { cause: err });
  }
};

export const createPushJob = async (job: Partial<PushJob>): Promise<number> => {
  try {
    if (job.status === JobStatus.DEPLOYED) {
      await validateActive(job.table_name!, ConfigType.PUSH);
    }

    const { id, ...jobWithoutId } = job;
    const keys = Object.keys(jobWithoutId);
    validateColumnKeys(keys, ALLOWED_PUSH_JOB_COLUMNS, 'tcs_push_jobs insert');
    const values = Object.values(jobWithoutId);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const insertQuery = `
      INSERT INTO tcs_push_jobs (${keys.join(', ')})
      VALUES (${placeholders})
      RETURNING *;
    `;
    const result = await handlePostExecuteSqlStatement<{ id: number }>(
      {
        text: insertQuery,
        values,
      } satisfies PgQueryConfig,
      'configuration',
    );

    const insertedId = result.rows[0]?.id;

    if (!insertedId) {
      throw new Error('Failed to insert push job: No ID returned.');
    }

    return insertedId;
  } catch (error) {
    throw new Error(`Failed to create job: ${(error as Error).message}`, { cause: error });
  }
};

export const createPullJob = async (job: Partial<Job>): Promise<ISuccess> => {
  try {
    const exists = await validateExisting(job.table_name!);

    if (job.status === JobStatus.DEPLOYED) {
      await validateActive(job.table_name!, ConfigType.PULL);
    }

    const { id, ...jobWithoutId } = job;
    const keys = Object.keys(jobWithoutId);
    validateColumnKeys(keys, ALLOWED_PULL_JOB_COLUMNS, 'tcs_pull_jobs insert');
    const values = Object.values(jobWithoutId);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const insertQuery = `
      INSERT INTO tcs_pull_jobs (${keys.join(', ')})
      VALUES (${placeholders})
      RETURNING *;
    `;

    await handlePostExecuteSqlStatement<Job>(
      {
        text: insertQuery,
        values,
      } satisfies PgQueryConfig,
      'configuration',
    );

    return {
      success: true,
      message: `Pull Job Created Successfully ${exists ? 'with an existing table' : ''}`,
    };
  } catch (error) {
    throw new Error(`Failed to create pull job : ${(error as Error).message}`, { cause: error });
  }
};

export const getJobHistory = async (
  limit = 10,
  offset = 0,
  tenantId: string,
  payload: Record<string, string> = {},
): Promise<PaginatedResult<PullJobHistory>> => {
  try {
    const { endpointName, createdAt, exception } = payload;
    const whereClauses: string[] = ['ph.tenant_id = $1'];
    const queryParams: unknown[] = [tenantId];
    let paramIndex = 2;

    if (createdAt) {
      whereClauses.push(`DATE(ph.created_at) = $${paramIndex}`);
      queryParams.push(createdAt);
      paramIndex += 1;
    }

    if (exception) {
      whereClauses.push(`ph.exception LIKE $${paramIndex}`);
      queryParams.push(`%${exception}%`);
      paramIndex += 1;
    }

    if (endpointName) {
      whereClauses.push(`pj.endpoint_name ILIKE $${paramIndex}`);
      queryParams.push(`%${endpointName}%`);
      paramIndex += 1;
    }

    const whereClause = `WHERE ${whereClauses.join(' AND ')}`;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM job_history ph
      LEFT JOIN tcs_pull_jobs pj ON pj.id = ph.job_id
      ${whereClause};
    `;
    const countResult = await handlePostExecuteSqlStatement<{ total: string }>(
      {
        text: countQuery,
        values: queryParams,
      } satisfies PgQueryConfig,
      'configuration',
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const dataQuery = `
  SELECT 
    ph.*,
    CASE 
      WHEN ph.job_type = 'pull' THEN pj.endpoint_name
      WHEN ph.job_type = 'push' THEN psh.endpoint_name
    END AS endpoint_name,
    CASE 
      WHEN ph.job_type = 'pull' THEN pj.table_name
      WHEN ph.job_type = 'push' THEN psh.table_name
    END AS table_name,
    CASE 
      WHEN ph.job_type = 'pull' THEN pj.description
      WHEN ph.job_type = 'push' THEN psh.description
    END AS description,
    CASE 
      WHEN ph.job_type = 'pull' THEN pj.version
      WHEN ph.job_type = 'push' THEN psh.version
    END AS version,
    CASE 
      WHEN ph.job_type = 'pull' THEN pj.status
      WHEN ph.job_type = 'push' THEN psh.status
    END AS status,
    CASE 
      WHEN ph.job_type = 'pull' THEN pj.publishing_status
      WHEN ph.job_type = 'push' THEN psh.publishing_status
    END AS publishing_status
  FROM job_history ph
  LEFT JOIN tcs_pull_jobs pj ON pj.id = ph.job_id AND ph.job_type = 'pull'
  LEFT JOIN tcs_push_jobs psh ON psh.id = ph.job_id AND ph.job_type = 'push'
  ${whereClause}
  ORDER BY ph.created_at DESC
  LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
`;
    const dataParams = [...queryParams, limit, offset];
    const dataResult = await handlePostExecuteSqlStatement<PullJobHistory>(
      {
        text: dataQuery,
        values: dataParams,
      } satisfies PgQueryConfig,
      'configuration',
    );

    return {
      data: dataResult.rows,
      total,
      limit,
      offset,
    };
  } catch (error) {
    throw new Error(`Error fetching job_history: ${error instanceof Error ? error.message : JSON.stringify(error)}`, { cause: error });
  }
};

export const getAllJobs = async (
  limit = 10,
  offset = 0,
  payload: Record<string, string>,
  tenantId: string,
): Promise<PaginatedResult<Job>> => {
  const { status, endpointName, createdAt } = payload;
  const whereClauses: string[] = ['tenant_id = $1'];
  const queryParams: unknown[] = [tenantId];
  let paramIndex = 2;
  if (status) {
    const statusArray = status.split(',').map((s) => s.trim());
    whereClauses.push(`status = ANY($${paramIndex})`);
    queryParams.push(statusArray);
    paramIndex += 1;
  }
  if (endpointName) {
    whereClauses.push(`endpoint_name LIKE $${paramIndex}`);
    queryParams.push(`%${endpointName}%`);
    paramIndex += 1;
  }
  if (createdAt) {
    whereClauses.push(`DATE(created_at) = $${paramIndex}`);
    queryParams.push(createdAt);
    paramIndex += 1;
  }
  const whereClause = `WHERE ${whereClauses.join(' AND ')}`;
  const countQuery = `
    SELECT SUM(count) AS total FROM (
      SELECT COUNT(*) AS count FROM tcs_push_jobs ${whereClause}
      UNION ALL
      SELECT COUNT(*) AS count FROM tcs_pull_jobs ${whereClause}
    ) AS combined_counts
  `;
  const countResult = await handlePostExecuteSqlStatement<{ total: string }>(
    {
      text: countQuery,
      values: queryParams,
    } satisfies PgQueryConfig,
    'configuration',
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const dataQuery = `
  SELECT *
  FROM (
    SELECT 
      pj.id,
      pj.endpoint_name,
      pj.path,
      pj.mode,
      pj.table_name,
      pj.description,
      pj.version,
      pj.status,
      pj.publishing_status,
      pj.created_at,
      pj.updated_at,
      'push' AS type,
      NULL AS cron_job_name,
      pj.tenant_id
    FROM tcs_push_jobs pj

    UNION ALL

    SELECT 
      pl.id,
      pl.endpoint_name,
      NULL AS path,
      pl.mode,
      pl.table_name,
      pl.description,
      pl.version,
      pl.status,
      pl.publishing_status,
      pl.created_at,
      pl.updated_at,
      'pull' AS type,
      cj.name AS cron_job_name,
      pl.tenant_id
    FROM tcs_pull_jobs pl
    LEFT JOIN tcs_cron_jobs cj ON cj.id = pl.schedule_id
  ) AS all_jobs
  ${whereClause}
  ORDER BY all_jobs.updated_at DESC
  LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
`;

  const dataParams = [...queryParams, limit, offset];
  const dataResult = await handlePostExecuteSqlStatement<Job>(
    {
      text: dataQuery,
      values: dataParams,
    } satisfies PgQueryConfig,
    'configuration',
  );
  return {
    data: dataResult.rows,
    total,
    limit,
    offset,
  };
};

export const findJobById = async (id: string, tableName: string): Promise<Job | null> => {
  try {
    if (!ALLOWED_JOB_TABLES.has(tableName)) {
      throw new Error(`Invalid table name: ${tableName}`);
    }
    const query = ` SELECT * FROM ${tableName} WHERE id = $1 LIMIT 1;`;
    const result = await handlePostExecuteSqlStatement<Job>(
      {
        text: query,
        values: [id],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return result.rows[0] ?? null;
  } catch (error) {
    throw new Error(`Failed to find job: ${(error as Error).message}`, { cause: error });
  }
};

export const getJobsByStatus = async (tenantId: string, status: JobStatus, page: number, limit: number): Promise<JobSummary[]> => {
  try {
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        id,
        endpoint_name,
        path,
        mode,
        table_name,
        description,
        version,
        status,
        publishing_status,
        created_at,
        'push' AS type
      FROM tcs_push_jobs
      WHERE tenant_id = $1 AND status = $2

      UNION ALL

      SELECT 
        id,
        endpoint_name,
        NULL AS path,
        mode,
        table_name,
        description,
        version,
        status,
        publishing_status,
        created_at,
        'pull' AS type
      FROM tcs_pull_jobs
      WHERE tenant_id = $1 AND status = $2

      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4;
    `;

    const result = await handlePostExecuteSqlStatement<JobSummary>(
      {
        text: query,
        values: [tenantId, status, limit, offset],
      } satisfies PgQueryConfig,
      'configuration',
    );

    return result.rows;
  } catch (error) {
    throw new Error(`Failed to fetch jobs: ${(error as Error).message}`, { cause: error });
  }
};

export const updateJob = async (
  id: string,
  job: Record<string, unknown>,
  type: ConfigType,
): Promise<{ success: boolean; message: string }> => {
  try {
    const tableName = type === ConfigType.PUSH ? 'tcs_push_jobs' : 'tcs_pull_jobs';
    const allowedColumns = type === ConfigType.PUSH ? ALLOWED_PUSH_JOB_COLUMNS : ALLOWED_PULL_JOB_COLUMNS;

    const keys = Object.keys(job);
    const values = Object.values(job);

    if (keys.length === 0) {
      throw new Error('No fields provided to update');
    }

    validateColumnKeys(keys, allowedColumns, `${tableName} update`);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ') + ', updated_at = NOW()';
    const query = `
      UPDATE ${tableName}
      SET ${setClause}
      WHERE id = $${keys.length + 1};
    `;

    const result = await handlePostExecuteSqlStatement<Job>(
      {
        text: query,
        values: [...values, id],
      } satisfies PgQueryConfig,
      'configuration',
    );

    if (!result.rowCount) {
      throw new Error(`Job with id "${id}" not found or no changes were made`);
    }

    return {
      success: true,
      message: `Job with id "${id}" successfully updated`,
    };
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to update job: ${err.message}`, { cause: error });
  }
};

export const updateJobActivation = async (id: string, status: ScheduleStatus, type: ConfigType): Promise<Job[]> => {
  try {
    const tableName = type === ConfigType.PUSH ? 'tcs_push_jobs' : 'tcs_pull_jobs';

    const job = (await findJobById(id, tableName))!;

    if (status === ScheduleStatus.ACTIVE) {
      await validateActive(job.table_name, type);
    }

    const query = `
                 UPDATE ${tableName}
                 SET publishing_status = $1, updated_at = NOW()
                 WHERE id = $2
                 RETURNING *;
                    `;

    const result = await handlePostExecuteSqlStatement<Job>(
      {
        text: query,
        values: [status, id],
      } satisfies PgQueryConfig,
      'configuration',
    );

    if (result.rows.length === 0) {
      throw new Error('Job not found or publishing_status not updated');
    }

    return result.rows;
  } catch (error) {
    throw new Error(`Failed to update job publishing status: ${(error as Error).message}`, {
      cause: error,
    });
  }
};

export const updateJobByStatus = async (status: JobStatus, id: string, type: ConfigType, reason?: string): Promise<number | null> => {
  try {
    const tableName = type === ConfigType.PUSH ? 'tcs_push_jobs' : 'tcs_pull_jobs';

    const setClauses = ['status = $1', 'updated_at = NOW()'];
    const params: unknown[] = [status];
    let paramIndex = 2;

    if (status === JobStatus.REJECTED || (status === JobStatus.APPROVED && reason)) {
      setClauses.push(`comments = $${paramIndex}`);
      params.push(reason);
      paramIndex += 1;
    }

    params.push(id);

    const query = `
      UPDATE ${tableName}
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id;
    `;

    const result = await handlePostExecuteSqlStatement<{ id: number }>(
      {
        text: query,
        values: params,
      } satisfies PgQueryConfig,
      'configuration',
    );

    if (result.rowCount === 0) {
      throw new Error(`No job found with id: ${id}`);
    }

    return result.rowCount;
  } catch (error) {
    throw new Error(`Failed to update job status: ${(error as Error).message}`, { cause: error });
  }
};
