import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import { validateColumnKeys } from '../../utils/enrichment-utils';

const ALLOWED_MASKING_COLUMNS = new Set(['tenant_id', 'txtp', 'txtp_version']);

const ALLOWED_UPDATE_COLUMNS = new Set(['txtp', 'txtp_version', 'tokenize', 'status', 'fields_masked', 'total_fields', 'comments']);

export const createMasking = async (maskingData: Record<string, unknown>): Promise<number> => {
  try {
    const keys = Object.keys(maskingData);
    validateColumnKeys(keys, ALLOWED_MASKING_COLUMNS, 'trs_masking insert');
    const values = Object.values(maskingData);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const insertQuery = `
      INSERT INTO trs_masking (${keys.join(', ')})
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
      throw new Error('Failed to insert masking configuration: No ID returned.');
    }

    return insertedId;
  } catch (error) {
    throw new Error(`Failed to create masking configuration: ${(error as Error).message}`, { cause: error });
  }
};

export const countMasksWithFiltersInDB = async (whereClauses: string, queryParams: unknown[]): Promise<number> => {
  const query = `
    SELECT COUNT(*)
    FROM trs_masking
    ${whereClauses}
  `;

  const countResult = await handlePostExecuteSqlStatement<{ count: string }>(
    {
      text: query,
      values: queryParams,
    } satisfies PgQueryConfig,
    'configuration',
  );

  return parseInt(countResult.rows[0].count, 10) || 0;
};

export const findMasksWithFiltersInDB = async (
  whereClause: string,
  paramIndex: number,
  dataParams: unknown[],
  sortOrder: 'ASC' | 'DESC' = 'DESC',
): Promise<{ result: unknown }> => {
  const dataQuery = `
    SELECT
      id,
      tenant_id,
      txtp,
      txtp_version,
      status,
      fields_masked,
      total_fields,
      comments,
      created_at,
      updated_at
    FROM trs_masking
    ${whereClause}
    ORDER BY updated_at ${sortOrder}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const result = await handlePostExecuteSqlStatement<{ result: unknown }>(
    {
      text: dataQuery,
      values: dataParams,
    } satisfies PgQueryConfig,
    'configuration',
  );

  return { result: result.rows };
};

export const findMaskByIdInDB = async (id: number, tenantId: string): Promise<Record<string, unknown> | null> => {
  const query = `
    SELECT
      id,
      tenant_id,
      txtp,
      txtp_version,
      status,
      fields_masked,
      total_fields,
      comments,
      created_at,
      updated_at
    FROM trs_masking
    WHERE id = $1 AND tenant_id = $2
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: query, values: [id, tenantId] } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows[0] ?? null;
};

export const updateMaskingInDB = async (
  id: number,
  tenantId: string,
  updateData: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const keys = Object.keys(updateData).filter((k) => ALLOWED_UPDATE_COLUMNS.has(k));

  if (keys.length === 0) {
    throw new Error('No valid fields provided for update');
  }

  const setClauses = keys.map((key, i) => `${key} = $${i + 1}`);
  setClauses.push('updated_at = NOW()');
  const values: unknown[] = keys.map((k) => updateData[k]);

  const query = `
    UPDATE trs_masking
    SET ${setClauses.join(', ')}
    WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2}
    RETURNING id, tenant_id, txtp, txtp_version, tokenize, status, fields_masked, total_fields, comments, created_at, updated_at
  `;

  values.push(id, tenantId);

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    { text: query, values } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    throw new Error(`Masking configuration with id ${id} not found`);
  }

  return result.rows[0];
};
