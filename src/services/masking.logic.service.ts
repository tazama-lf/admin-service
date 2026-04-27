import { loggerService } from '..';
import type { ExcludedTypeProps } from '../interface/masking.interface';
import {
  countMasksWithFiltersInDB,
  findMasksWithFiltersInDB,
  createMasking,
  updateMaskingInDB,
  findMaskByIdInDB,
  getExcludedTypes,
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

export const handleGetExcludedTypes = async (tenantId: string): Promise<ExcludedTypeProps[] | null> => {
  try {
    loggerService.log(`Started handling get job history request for tenant: ${tenantId}`);

    const result = await getExcludedTypes(tenantId);

    loggerService.log(`Retrieved ${result?.length} job history records successfully.`);
    return result;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: getting job history with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const findMasksWithFilters = async (
  limit = 10,
  offset = 0,
  payload: Record<string, string>,
  tenantId: string,
): Promise<{ data: unknown; total: number; limit: number; offset: number }> => {
  const { status, txtp, sortOrder } = payload;

  const whereClauses: string[] = ['tenant_id = $1'];
  const queryParams: unknown[] = [tenantId];
  let paramIndex = 2;

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

  const whereClause = `WHERE ${whereClauses.join(' AND ')}`;
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

export const handleReviewMask = async (
  id: number,
  tenantId: string,
  action: 'approve' | 'reject',
  comments?: string,
): Promise<Record<string, unknown>> => {
  try {
    loggerService.log(`Started handling review (${action}) request for mask id ${id}`);

    const mask = await findMaskByIdInDB(id, tenantId);
    if (!mask) {
      throw new Error(`Masking configuration with id ${id} not found`);
    }

    if (mask.status !== 'STATUS_03_UNDER_REVIEW') {
      throw new Error(
        `Cannot review masking configuration with status '${mask.status as string}'. Only configurations with status 'STATUS_03_UNDER_REVIEW' can be reviewed.`,
      );
    }

    if (action === 'reject' && !comments?.trim()) {
      throw new Error('A comment is required when rejecting a masking configuration');
    }

    const targetStatus = action === 'approve' ? 'STATUS_04_APPROVED' : 'STATUS_05_REJECTED';
    const updatePayload: Record<string, unknown> = { status: targetStatus };
    if (comments?.trim()) {
      updatePayload.comments = comments.trim();
    }

    const updated = await updateMaskingInDB(id, tenantId, updatePayload);
    loggerService.log(`Mask configuration with id ${id} ${action}d successfully`);
    return updated;
  } catch (error: unknown) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: reviewing masking configuration with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};
