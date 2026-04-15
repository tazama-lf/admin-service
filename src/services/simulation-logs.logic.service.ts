import type { SimulationLog, SimulationLogRequest, SimulationMessage } from '../interface/simulattionLogs.interface';
import { createSimulationLogsInDb, getSimulationLogsFromDb } from '../repositories/configuration/simulation-logs.repository';

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

export const getSimulationMessages = (_tenantId: string): SimulationMessage[] => [
  {
    messageId: 'msg_001',
    timestamp: '2024-04-14T10:00:00.000Z',
    endpoint: 'http://localhost:3002/dems-engine/cbe/1.0.0/iso/test_transaction',
    data: {
      msgid: 'msg001',
      amount: 1000,
      currency: 'PKR',
      country: 'PK',
      cnic: '1234-5678-910',
      date: '10-10-2025',
    },
  },
  {
    messageId: 'msg_002',
    timestamp: '2024-04-14T10:00:03.000Z',
    endpoint: 'http://localhost:3002/dems-engine/cbe/1.0.0/iso/test_transaction',
    data: {
      msgid: 'msg002',
      amount: 2500,
      currency: 'PKR',
      country: 'PK',
      cnic: '9876-5432-109',
      date: '11-10-2025',
    },
  },
  {
    messageId: 'msg_003',
    timestamp: '2024-04-14T10:00:08.000Z',
    endpoint: 'http://localhost:3002/dems-engine/cbe/1.0.0/iso/test_transaction',
    data: {
      msgid: 'msg003',
      amount: 5000,
      currency: 'PKR',
      country: 'PK',
      cnic: '5555-4444-333',
      date: '12-10-2025',
    },
  },
];
