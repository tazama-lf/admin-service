// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as simulationLogsService from '../../src/services/simulation-logs.logic.service';
import * as simulationLogsRepository from '../../src/repositories/configuration/simulation-logs.repository';

jest.mock('../../src/repositories/configuration/simulation-logs.repository');
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
});
