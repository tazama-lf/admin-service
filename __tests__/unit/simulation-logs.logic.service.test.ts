// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as simulationLogsService from '../../src/services/simulation-logs.logic.service';
import * as simulationLogsRepository from '../../src/repositories/configuration/simulation-logs.repository';
import * as evaluationRepository from '../../src/repositories/configuration/evaluation.repository';

jest.mock('../../src/repositories/configuration/simulation-logs.repository');
jest.mock('../../src/repositories/configuration/evaluation.repository');
jest.mock('../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Simulation Logs Logic Service', () => {
  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';
  const mockRuleId = 'rule-123';
  const mockEmail = 'test@example.com';

  const mockSimulationLog = {
    id: 1,
    user_id: mockUserId,
    tenant_id: mockTenantId,
    rule_id: mockRuleId,
    old_data: { config: 'old' },
    new_data: { config: 'new' },
    description: 'Test log',
    category: 'rule',
    created_by_email: mockEmail,
    created_at: '2026-01-01T10:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSimulationLogs', () => {
    it('should successfully create simulation log', async () => {
      (simulationLogsRepository.createSimulationLogsInDb as jest.Mock).mockResolvedValue(undefined);

      await simulationLogsService.createSimulationLogs({
        userId: mockUserId,
        tenantId: mockTenantId,
        ruleId: mockRuleId,
        oldData: { config: 'old' },
        newData: { config: 'new' },
        description: 'Test log',
        category: 'rule',
        createdByEmail: mockEmail,
      });

      expect(simulationLogsRepository.createSimulationLogsInDb).toHaveBeenCalledWith(
        mockUserId,
        mockTenantId,
        mockRuleId,
        { config: 'old' },
        { config: 'new' },
        'Test log',
        'rule',
        mockEmail,
      );
    });

    it('should create log with empty description when not provided', async () => {
      (simulationLogsRepository.createSimulationLogsInDb as jest.Mock).mockResolvedValue(undefined);

      await simulationLogsService.createSimulationLogs({
        userId: mockUserId,
        tenantId: mockTenantId,
        ruleId: mockRuleId,
        oldData: { config: 'old' },
        newData: { config: 'new' },
        category: 'rule',
        createdByEmail: mockEmail,
      });

      expect(simulationLogsRepository.createSimulationLogsInDb).toHaveBeenCalledWith(
        mockUserId,
        mockTenantId,
        mockRuleId,
        { config: 'old' },
        { config: 'new' },
        '',
        'rule',
        mockEmail,
      );
    });

    it('should throw error when log creation fails', async () => {
      (simulationLogsRepository.createSimulationLogsInDb as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        simulationLogsService.createSimulationLogs({
          userId: mockUserId,
          tenantId: mockTenantId,
          ruleId: mockRuleId,
          oldData: { config: 'old' },
          newData: { config: 'new' },
          category: 'rule',
          createdByEmail: mockEmail,
        }),
      ).rejects.toThrow('Database error');
    });
  });

  describe('getSimulationLogs', () => {
    it('should retrieve simulation logs with default parameters', async () => {
      const mockLogs = [mockSimulationLog];
      (simulationLogsRepository.getSimulationLogsFromDb as jest.Mock).mockResolvedValue(mockLogs);

      const result = await simulationLogsService.getSimulationLogs(mockRuleId, mockTenantId);

      expect(result).toEqual(mockLogs);
      expect(simulationLogsRepository.getSimulationLogsFromDb).toHaveBeenCalledWith({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
        category: undefined,
        sortBy: 'created_at',
        sortOrder: 'desc',
        limit: undefined,
        offset: undefined,
      });
    });

    it('should retrieve logs with category filter', async () => {
      const mockLogs = [mockSimulationLog];
      (simulationLogsRepository.getSimulationLogsFromDb as jest.Mock).mockResolvedValue(mockLogs);

      const result = await simulationLogsService.getSimulationLogs(mockRuleId, mockTenantId, 'rule');

      expect(result).toEqual(mockLogs);
      expect(simulationLogsRepository.getSimulationLogsFromDb).toHaveBeenCalledWith({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
        category: 'rule',
        sortBy: 'created_at',
        sortOrder: 'desc',
        limit: undefined,
        offset: undefined,
      });
    });

    it('should retrieve logs with custom sort parameters', async () => {
      const mockLogs = [mockSimulationLog];
      (simulationLogsRepository.getSimulationLogsFromDb as jest.Mock).mockResolvedValue(mockLogs);

      const result = await simulationLogsService.getSimulationLogs(mockRuleId, mockTenantId, undefined, 'updated_at', 'asc');

      expect(result).toEqual(mockLogs);
      expect(simulationLogsRepository.getSimulationLogsFromDb).toHaveBeenCalledWith({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
        category: undefined,
        sortBy: 'updated_at',
        sortOrder: 'asc',
        limit: undefined,
        offset: undefined,
      });
    });

    it('should retrieve logs with pagination', async () => {
      const mockLogs = [mockSimulationLog];
      (simulationLogsRepository.getSimulationLogsFromDb as jest.Mock).mockResolvedValue(mockLogs);

      const result = await simulationLogsService.getSimulationLogs(mockRuleId, mockTenantId, undefined, 'created_at', 'desc', 10, 20);

      expect(result).toEqual(mockLogs);
      expect(simulationLogsRepository.getSimulationLogsFromDb).toHaveBeenCalledWith({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
        category: undefined,
        sortBy: 'created_at',
        sortOrder: 'desc',
        limit: 10,
        offset: 20,
      });
    });

    it('should handle empty results', async () => {
      (simulationLogsRepository.getSimulationLogsFromDb as jest.Mock).mockResolvedValue([]);

      const result = await simulationLogsService.getSimulationLogs(mockRuleId, mockTenantId);

      expect(result).toEqual([]);
    });

    it('should throw error on repository failure', async () => {
      (simulationLogsRepository.getSimulationLogsFromDb as jest.Mock).mockRejectedValue(new Error('Query failed'));

      await expect(simulationLogsService.getSimulationLogs(mockRuleId, mockTenantId)).rejects.toThrow('Query failed');
    });
  });

  describe('getSimulationMessages', () => {
    it('should delegate to getSimulationMessagesFromDb', async () => {
      const mockMessages = [{ id: 'msg-1' }];
      (simulationLogsRepository.getSimulationMessagesFromDb as jest.Mock).mockResolvedValue(mockMessages);

      const result = await simulationLogsService.getSimulationMessages('tenant-1', 'sim001');

      expect(result).toEqual(mockMessages);
      expect(simulationLogsRepository.getSimulationMessagesFromDb).toHaveBeenCalledWith('tenant-1', 'sim001');
    });
  });

  describe('stageSimulationItems', () => {
    it('should delegate to stageItemsInSimTable', async () => {
      (simulationLogsRepository.stageItemsInSimTable as jest.Mock).mockResolvedValue({ tableName: 'sim001' });

      const result = await simulationLogsService.stageSimulationItems([{ foo: 'bar' }]);

      expect(result).toEqual({ tableName: 'sim001' });
      expect(simulationLogsRepository.stageItemsInSimTable).toHaveBeenCalledWith([{ foo: 'bar' }]);
    });
  });

  describe('deleteEvaluationsByTenant', () => {
    it('should call deleteEvaluationsByTenantInDb with tenantId', async () => {
      (simulationLogsRepository.deleteEvaluationsByTenantInDb as jest.Mock).mockResolvedValue(undefined);

      await simulationLogsService.deleteEvaluationsByTenant('tenant-1');

      expect(simulationLogsRepository.deleteEvaluationsByTenantInDb).toHaveBeenCalledWith('tenant-1');
      expect(simulationLogsRepository.deleteEvaluationsByTenantInDb).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from repository', async () => {
      (simulationLogsRepository.deleteEvaluationsByTenantInDb as jest.Mock).mockRejectedValue(new Error('Truncate failed'));

      await expect(simulationLogsService.deleteEvaluationsByTenant('tenant-1')).rejects.toThrow('Truncate failed');
    });
  });

  describe('saveEvaluationsInResultsTable', () => {
    it('should delegate to saveEvaluationsInDb with evaluations and tableName', async () => {
      (evaluationRepository.saveEvaluationsInDb as jest.Mock).mockResolvedValue(undefined);

      const evals = [{ iteration: 1, evaluation: {}, messageid: 'msg-1', tenantid: 'tenant-1', credttm: new Date() }];
      await simulationLogsService.saveEvaluationsInResultsTable(evals, 'sim001');

      expect(evaluationRepository.saveEvaluationsInDb).toHaveBeenCalledWith(evals, 'sim001');
    });

    it('should call saveEvaluationsInDb without tableName', async () => {
      (evaluationRepository.saveEvaluationsInDb as jest.Mock).mockResolvedValue(undefined);

      await simulationLogsService.saveEvaluationsInResultsTable([]);

      expect(evaluationRepository.saveEvaluationsInDb).toHaveBeenCalledWith([], undefined);
    });
  });

  describe('saveRecordInTrsSimulation', () => {
    it('should delegate to saveRecordInTrsSimulationInDb', async () => {
      (simulationLogsRepository.saveRecordInTrsSimulationInDb as jest.Mock).mockResolvedValue(undefined);

      const data = { simulationId: 'sim-1', totalRecord: 10, recordProcessed: 5, simStatus: 'running', tenantId: 'tenant-1' };
      await simulationLogsService.saveRecordInTrsSimulation(data);

      expect(simulationLogsRepository.saveRecordInTrsSimulationInDb).toHaveBeenCalledWith(data);
    });

    it('should propagate errors from repository', async () => {
      (simulationLogsRepository.saveRecordInTrsSimulationInDb as jest.Mock).mockRejectedValue(new Error('Insert failed'));

      await expect(
        simulationLogsService.saveRecordInTrsSimulation({
          simulationId: 'sim-1',
          totalRecord: 1,
          recordProcessed: 0,
          simStatus: 'failed',
          tenantId: 'tenant-1',
        }),
      ).rejects.toThrow('Insert failed');
    });
  });

  describe('fetchSimulationItems', () => {
    it('should delegate to fetchSimulationItemsFromTable', async () => {
      const mockItems = [{ payload: {}, endpointPath: '/ep', credttm: '2026-01-01', tenantId: 'tenant-1', msgid: 'msg-1' }];
      (simulationLogsRepository.fetchSimulationItemsFromTable as jest.Mock).mockResolvedValue(mockItems);

      const result = await simulationLogsService.fetchSimulationItems('sim001', 'tenant-1');

      expect(result).toEqual(mockItems);
      expect(simulationLogsRepository.fetchSimulationItemsFromTable).toHaveBeenCalledWith('sim001', 'tenant-1');
    });
  });

  describe('handleDlhFetchCount', () => {
    it('should delegate to fetchCountFromDlh', async () => {
      (simulationLogsRepository.fetchCountFromDlh as jest.Mock).mockResolvedValue({ rowCount: 42 });

      const result = await simulationLogsService.handleDlhFetchCount([{ txtp: 'pacs.002' }], 'token-abc');

      expect(result).toEqual({ rowCount: 42 });
      expect(simulationLogsRepository.fetchCountFromDlh).toHaveBeenCalledWith([{ txtp: 'pacs.002' }], 'token-abc');
    });

    it('should propagate errors from repository', async () => {
      (simulationLogsRepository.fetchCountFromDlh as jest.Mock).mockRejectedValue(new Error('DLH error'));

      await expect(simulationLogsService.handleDlhFetchCount([], 'token')).rejects.toThrow('DLH error');
    });
  });
});
