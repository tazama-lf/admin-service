import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import { validateColumnKeys } from '../../utils/enrichment-utils';

const ALLOWED_MASKING_COLUMNS = new Set(['tenant_id', 'txtp', 'txtp_version']);

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
