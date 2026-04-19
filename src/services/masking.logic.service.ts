import { loggerService } from '..';
import {
  countMasksWithFiltersInDB,
  findMasksWithFiltersInDB,
  createMasking,
  updateMaskingInDB,
  findMaskByIdInDB,
} from '../repositories/configuration/masking.repository';

export const handlePostMask = async (mask: Record<string, unknown>, tenantId: string): Promise<{ message: string; id: number }> => {
  try {
    loggerService.log('Started handling post request of mask configuration executed');

    const maskData = (mask.maskData as Record<string, unknown>) || mask;
    const body = { ...maskData, tenant_id: tenantId };
    const createdMaskId = await createMasking(body);

    loggerService.log('New mask configuration was saved successfully.');

    return {
      message: `Masking Configuration with id ${createdMaskId} created Successfully`,
      id: createdMaskId,
    };
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: posting masking configuration with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

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

export const handleUpdateMask = async (
  id: number,
  tenantId: string,
  updateData: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  try {
    loggerService.log(`Started handling update request for mask id ${id}`);
    const updated = await updateMaskingInDB(id, tenantId, updateData);
    loggerService.log(`Mask configuration with id ${id} updated successfully`);
    return updated;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: updating masking configuration with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleGetMaskById = async (id: number, tenantId: string): Promise<Record<string, unknown> | null> => {
  try {
    loggerService.log(`Started handling get request for mask id ${id}`);
    const mask = await findMaskByIdInDB(id, tenantId);
    loggerService.log(`Mask configuration with id ${id} retrieved successfully`);
    return mask;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: getting masking configuration with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};
