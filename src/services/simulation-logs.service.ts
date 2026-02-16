import type { SimulationLog, SimulationLogRequest } from '../interface/simulattionLogs.interface';
import { fetchSimulationLogs, insertSimulationLogToDB } from '../repositories/configuration/simulation-logs.repository';

export const insertSimulationLogs = async ({
  userId,
  tenantId,
  ruleId,
  oldData,
  newData,
  description = '',
  category,
}: SimulationLogRequest): Promise<void> => {
  await insertSimulationLogToDB(userId, tenantId, ruleId, oldData, newData, description, category);
};

export const getSimulationLogs = async (
  ruleId: string,
  tenantId: string,
  category?: string,
  sortBy: 'created_at' | 'updated_at' = 'created_at',
  sortOrder: 'asc' | 'desc' = 'desc',
  limit?: number,
  offset?: number,
): Promise<SimulationLog[]> => await fetchSimulationLogs({ ruleId, tenantId, category, sortBy, sortOrder, limit, offset });
