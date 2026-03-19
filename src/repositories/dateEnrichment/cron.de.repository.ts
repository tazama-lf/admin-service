import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { type CronJob, JobStatus, type PaginatedResult } from '../../interface/data-enrichment.interface';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import { validateColumnKeys } from '../../utils/enrichment-utils';

const ALLOWED_CRON_INSERT_COLUMNS = new Set(['name', 'cron', 'iterations', 'status', 'tenant_id', 'comments', 'schedule_id']);

const ALLOWED_CRON_UPDATE_COLUMNS = new Set(['name', 'cron', 'iterations', 'status', 'comments']);

export const createCronJob = async (cronData: Record<string, unknown>): Promise<number> => {
  try {
    const keys = Object.keys(cronData);
    validateColumnKeys(keys, ALLOWED_CRON_INSERT_COLUMNS, 'tcs_cron_jobs insert');
    const values = Object.values(cronData);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const insertQuery = `
      INSERT INTO tcs_cron_jobs (${keys.join(', ')})
      VALUES (${placeholders})
      RETURNING id;
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
      throw new Error('Failed to insert cron job: No ID returned.');
    }

    return insertedId;
  } catch (error) {
    throw new Error(`Failed to create cron job: ${(error as Error).message}`, { cause: error });
  }
};

export const findCronJobById = async (id: string): Promise<CronJob | null> => {
  try {
    const query = 'SELECT * FROM tcs_cron_jobs WHERE id = $1 LIMIT 1;';
    const result = await handlePostExecuteSqlStatement<CronJob>(
      {
        text: query,
        values: [id],
      } satisfies PgQueryConfig,
      'configuration',
    );
    return result.rows[0] ?? null;
  } catch (error) {
    throw new Error(`Failed to find cron job: ${(error as Error).message}`, { cause: error });
  }
};

export const updateCronJob = async (id: string, attr: Record<string, unknown>): Promise<number | null> => {
  try {
    const keys = Object.keys(attr);
    validateColumnKeys(keys, ALLOWED_CRON_UPDATE_COLUMNS, 'tcs_cron_jobs update');
    const values = Object.values(attr);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ') + ', updated_at = NOW()';

    const query = `
      UPDATE tcs_cron_jobs 
      SET ${setClause} 
      WHERE id = $${keys.length + 1};
    `;

    const result = await handlePostExecuteSqlStatement<CronJob>(
      {
        text: query,
        values: [...values, id],
      } satisfies PgQueryConfig,
      'configuration',
    );

    if (result.rowCount === 0) {
      throw new Error(`No cron job found with id: ${id}`);
    }
    return result.rowCount;
  } catch (error) {
    throw new Error(`Failed to update cron job: ${(error as Error).message}`, { cause: error });
  }
};

export const getAllCronJobs = async (
  limit = 10,
  offset = 0,
  payload: Record<string, string>,
  tenantId: string,
): Promise<PaginatedResult<CronJob>> => {
  const { status, name, createdAt } = payload;
  const whereClauses: string[] = ['tenant_id = $1'];
  const queryParams: unknown[] = [tenantId];
  let paramIndex = 2;
  if (status) {
    const statusArray = status.split(',').map((s) => s.trim());
    whereClauses.push(`status = ANY($${paramIndex})`);
    queryParams.push(statusArray);
    paramIndex += 1;
  }
  if (name) {
    whereClauses.push(`name LIKE $${paramIndex}`);
    queryParams.push(`%${name}%`);
    paramIndex += 1;
  }
  if (createdAt) {
    whereClauses.push(`DATE(created_at) = $${paramIndex}`);
    queryParams.push(createdAt);
    paramIndex += 1;
  }
  const whereClause = `WHERE ${whereClauses.join(' AND ')}`;
  const countQuery = `
      SELECT COUNT(*) as total
      FROM tcs_cron_jobs
      ${whereClause}
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
    SELECT * FROM tcs_cron_jobs ${whereClause}  ORDER BY updated_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  const dataParams = [...queryParams, limit, offset * 10];
  const dataResult = await handlePostExecuteSqlStatement<CronJob>(
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

export const getCronJobByStatus = async (tenantId: string, status: JobStatus, page: number, limit: number): Promise<CronJob[]> => {
  try {
    const offset = (page - 1) * limit;

    const query = `
      SELECT *
      FROM tcs_cron_jobs
      WHERE tenant_id = $1
        AND status = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4;
    `;

    const result = await handlePostExecuteSqlStatement<CronJob>(
      {
        text: query,
        values: [tenantId, status, limit, offset],
      } satisfies PgQueryConfig,
      'configuration',
    );

    return result.rows;
  } catch (error) {
    throw new Error(`Failed to fetch cron jobs: ${(error as Error).message}`, { cause: error });
  }
};

export const updateCronJobByStatus = async (status: JobStatus, id: string, reason?: string): Promise<number | null> => {
  try {
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
      UPDATE tcs_cron_jobs
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
      throw new Error(`No cron job found with id: ${id}`);
    }

    return result.rowCount;
  } catch (error) {
    throw new Error(`Failed to update cron job status: ${(error as Error).message}`, {
      cause: error,
    });
  }
};
