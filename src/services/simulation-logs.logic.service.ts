import type { IRecordCount, SimulationLog, SimulationLogRequest, SimulationMessage } from '../interface/simulattionLogs.interface';
import {
  createSimulationLogsInDb,
  getSimulationLogsFromDb,
  getSimulationMessagesFromDb,
  stageItemsInSimTable,
  truncateEvaluationResultsInDb,
  saveRecordInTrsSimulationInDb,
  fetchSimulationItemsFromTable,
  type SimulationItemRow,
  fetchCountFromDlh,
} from '../repositories/configuration/simulation-logs.repository';
import { saveEvaluationsInDb, type EvaluationRow } from '../repositories/configuration/evaluation.repository';

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

export const stageSimulationItems = async (items: Array<Record<string, unknown>>): Promise<{ tableName: string | null }> =>
  await stageItemsInSimTable(items);

export const truncateEvaluationResults = async (): Promise<void> => {
  await truncateEvaluationResultsInDb();
};

export const saveEvaluationsInResultsTable = async (evaluations: EvaluationRow[], tableName?: string): Promise<void> => {
  await saveEvaluationsInDb(evaluations, tableName);
};

export const saveRecordInTrsSimulation = async (simulationData: {
  simulationId: string | undefined;
  totalRecord: number;
  recordProcessed: number;
  simStatus: string;
  tenantId: string;
}): Promise<void> => {
  await saveRecordInTrsSimulationInDb(simulationData);
};

export const fetchSimulationItems = async (tableName: string, tenantId: string): Promise<SimulationItemRow[]> =>
  await fetchSimulationItemsFromTable(tableName, tenantId);

export const handleDlhFetchCount = async (queries: Array<Record<string, unknown>>, token: string): Promise<IRecordCount> =>
  await fetchCountFromDlh(queries, token);
