import type { SimulationLog, SimulationLogRequest, SimulationMessage } from '../interface/simulattionLogs.interface';
import {
  createSimulationLogsInDb,
  getSimulationLogsFromDb,
  getSimulationMessagesFromDb,
  fetchDataFromDlh,
} from '../repositories/configuration/simulation-logs.repository';

export const createSimulationLogs = async ({
  userId,
  tenantId,
  ruleId,
  oldData,
  newData,
  description = '',
  category,
  createdByEmail,
}: SimulationLogRequest): Promise<void> => {
  await createSimulationLogsInDb(userId, tenantId, ruleId, oldData, newData, description, category, createdByEmail);
};

export const getSimulationLogs = async (
  ruleId: string,
  tenantId: string,
  category?: string,
  sortBy: 'created_at' | 'updated_at' = 'created_at',
  sortOrder: 'asc' | 'desc' = 'desc',
  limit?: number,
  offset?: number,
): Promise<SimulationLog[]> => await getSimulationLogsFromDb({ ruleId, tenantId, category, sortBy, sortOrder, limit, offset });

export const getSimulationMessages = async (tenantId: string, tableName: string): Promise<SimulationMessage[]> =>
  await getSimulationMessagesFromDb(tenantId, tableName);

export const fetchFromDlh = async (queries: Array<Record<string, unknown>>, token: string): Promise<Record<string, unknown>> =>
  await fetchDataFromDlh(queries, token);
