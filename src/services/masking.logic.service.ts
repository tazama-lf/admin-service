import { countMasksWithFiltersInDB, findMasksWithFiltersInDB } from '../repositories/configuration/masking.repository';

export const findMasksWithFilters = async (
  limit = 10,
  offset = 0,
  payload: Record<string, string>,
  _tenantId: string,
): Promise<{ data: unknown; total: number; limit: number; offset: number }> => {
  const { status, txtp, sortOrder } = payload;

  const whereClauses: string[] = [];
  const queryParams: unknown[] = [];
  let paramIndex = 1;

  if (status) {
    const statusArray = status.split(',').map((s) => s.trim());
    whereClauses.push(`status = ANY($${paramIndex})`);
    queryParams.push(statusArray);
    paramIndex += 1;
  }

  if (txtp) {
    whereClauses.push(`txtp ILIKE $${paramIndex}`);
    queryParams.push(`%${txtp}%`);
    paramIndex += 1;
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';

  const total = await countMasksWithFiltersInDB(whereClause, queryParams);
  const dataParams = [...queryParams, limit, offset * limit];
  const response = await findMasksWithFiltersInDB(whereClause, paramIndex, dataParams, order);

  return {
    data: response.result,
    total,
    limit,
    offset,
  };
};
