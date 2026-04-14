import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';

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
