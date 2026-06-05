// SPDX-License-Identifier: Apache-2.0
process.env.PORT = '3000';
process.env.ACTIVE_CONDITIONS_ONLY = 'true';

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as simulationSuitesService from '../../src/services/simulation-suites.logic.service';
import * as simulationSuitesRepository from '../../src/repositories/simulation-studio/suites.repository';
import * as trsGenService from '../../src/services/trs-suite-generation.logic.service';
import * as triggerService from '../../src/services/trigger-txtp-config.logic.service';

jest.mock('../../src/repositories/simulation-studio/suites.repository', () => ({
  getSimulationSuitesCountsFromDb: jest.fn(),
  getSimulationSuitesFromDb: jest.fn(),
  getSimulationSuiteByIdFromDb: jest.fn(),
  createSimulationSuiteInDb: jest.fn(),
  updateSimulationSuiteInDb: jest.fn(),
}));

jest.mock('../../src/services/trs-suite-generation.logic.service', () => ({
  createSuiteGeneration: jest.fn(),
  createContextTxtpConfig: jest.fn(),
  recalculateGenerationCounts: jest.fn(),
  cloneGeneration: jest.fn(),
  getLatestGenerationBySuiteId: jest.fn(),
  getNextGenerationNumber: jest.fn(),
  cloneGenerationDataInDb: jest.fn(),
}));

jest.mock('../../src/services/trigger-txtp-config.logic.service', () => ({
  createTriggerTxtpConfig: jest.fn(),
}));

describe('Simulation Suites Logic Service', () => {
  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';
  const mockUserEmail = 'test@example.com';

  const mockSuite = {
    id: 1,
    tenant_id: mockTenantId,
    name: 'Q3 Edge Cases',
    description: 'Suite for regression tests',
    simulation_type: 'SINGLE_RULE',
    status: 'DRAFT',
    rule_name: 'Rule 002',
    rule_version: 'v1.0',
    primary_txtp: 'pacs.008',
    primary_txtp_version: 'v1.0',
    iteration_count: 0,
    run_count: 0,
    wizard_progress: { currentStep: 1, completedSteps: [1] },
    metadata: {},
    created_by: mockUserId,
    created_at: new Date('2026-05-01T00:00:00.000Z'),
    updated_at: new Date('2026-05-01T00:00:00.000Z'),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    (trsGenService.createSuiteGeneration as jest.Mock).mockResolvedValue({ id: 7, suite_id: 1 });
    (trsGenService.createContextTxtpConfig as jest.Mock).mockResolvedValue({ context_txtp_config_id: 1, field_strategies: [] });
    (triggerService.createTriggerTxtpConfig as jest.Mock).mockResolvedValue({ trigger_txtp_config_id: 1, field_overrides: [] });
    (trsGenService.recalculateGenerationCounts as jest.Mock).mockResolvedValue(undefined);
  });

  describe('getSimulationSuites', () => {
    it('should return simulation suites list', async () => {
      const options = { tenantId: mockTenantId, limit: 20, offset: 0 };
      const response = { data: [mockSuite], total: 1, limit: 20, offset: 0 };
      (simulationSuitesRepository.getSimulationSuitesFromDb as jest.Mock).mockResolvedValue(response);

      const result = await simulationSuitesService.getSimulationSuites(options as any);

      expect(result).toEqual(response);
      expect(simulationSuitesRepository.getSimulationSuitesFromDb).toHaveBeenCalledWith(options);
    });

    it('should wrap repository errors', async () => {
      (simulationSuitesRepository.getSimulationSuitesFromDb as jest.Mock).mockRejectedValue(new Error('DB failure'));

      await expect(simulationSuitesService.getSimulationSuites({ tenantId: mockTenantId } as any)).rejects.toThrow(
        'Failed to retrieve simulation suites: DB failure',
      );
    });

    it('wraps non-Error thrown value with Unknown error', async () => {
      (simulationSuitesRepository.getSimulationSuitesFromDb as jest.Mock).mockRejectedValue('string failure');
      await expect(simulationSuitesService.getSimulationSuites({ tenantId: mockTenantId } as any)).rejects.toThrow('Unknown error');
    });
  });

  describe('getSimulationSuitesCounts', () => {
    it('should return suites counts', async () => {
      const response = {
        total_suites: 10,
        total_draft_suites: 4,
        total_completed_suites: 3,
        latest_run_at: new Date('2026-06-01T00:00:00.000Z'),
      };
      (simulationSuitesRepository.getSimulationSuitesCountsFromDb as jest.Mock).mockResolvedValue(response);

      const result = await simulationSuitesService.getSimulationSuitesCounts(mockTenantId);

      expect(result).toEqual(response);
      expect(simulationSuitesRepository.getSimulationSuitesCountsFromDb).toHaveBeenCalledWith(mockTenantId);
    });

    it('should wrap repository errors for counts', async () => {
      (simulationSuitesRepository.getSimulationSuitesCountsFromDb as jest.Mock).mockRejectedValue(new Error('DB failure'));

      await expect(simulationSuitesService.getSimulationSuitesCounts(mockTenantId)).rejects.toThrow(
        'Failed to retrieve simulation suites counts: DB failure',
      );
    });
  });

  describe('getSimulationSuiteById', () => {
    it('should return suite when found', async () => {
      (simulationSuitesRepository.getSimulationSuiteByIdFromDb as jest.Mock).mockResolvedValue(mockSuite);

      const result = await simulationSuitesService.getSimulationSuiteById(1, mockTenantId);

      expect(result).toEqual(mockSuite);
      expect(simulationSuitesRepository.getSimulationSuiteByIdFromDb).toHaveBeenCalledWith(1, mockTenantId);
    });

    it('should throw not found when suite is missing', async () => {
      (simulationSuitesRepository.getSimulationSuiteByIdFromDb as jest.Mock).mockResolvedValue(null);

      await expect(simulationSuitesService.getSimulationSuiteById(99, mockTenantId)).rejects.toThrow(
        'Simulation suite with id 99 not found',
      );
    });

    it('wraps non-HttpException repo error in 500', async () => {
      (simulationSuitesRepository.getSimulationSuiteByIdFromDb as jest.Mock).mockRejectedValue(new Error('DB crash') as never);

      await expect(simulationSuitesService.getSimulationSuiteById(1, mockTenantId)).rejects.toThrow(
        'Failed to retrieve simulation suite: DB crash',
      );
    });

    it('wraps non-Error thrown value with Unknown error', async () => {
      (simulationSuitesRepository.getSimulationSuiteByIdFromDb as jest.Mock).mockRejectedValue('string failure');
      await expect(simulationSuitesService.getSimulationSuiteById(1, mockTenantId)).rejects.toThrow('Unknown error');
    });
  });

  describe('createSimulationSuite', () => {
    it('should create suite successfully', async () => {
      const payload = {
        name: 'Q3 Edge Cases',
        description: 'Suite for regression tests',
        rule_name: 'Rule 002',
      };

      (simulationSuitesRepository.createSimulationSuiteInDb as jest.Mock).mockResolvedValue(mockSuite);

      const result = await simulationSuitesService.createSimulationSuite(payload as any, mockTenantId, mockUserId, mockUserEmail);

      expect(result).toEqual({ ...mockSuite, generation_id: 7 });
      expect(simulationSuitesRepository.createSimulationSuiteInDb).toHaveBeenCalledWith(
        expect.objectContaining(payload),
        mockTenantId,
        mockUserId,
        mockUserEmail,
      );
      expect(trsGenService.recalculateGenerationCounts).toHaveBeenCalledWith(7);
    });

    it('should validate empty name', async () => {
      await expect(
        simulationSuitesService.createSimulationSuite({ name: '   ' } as any, mockTenantId, mockUserId, mockUserEmail),
      ).rejects.toThrow('Simulation suite name is required');

      expect(simulationSuitesRepository.createSimulationSuiteInDb).not.toHaveBeenCalled();
    });

    it('should validate name length', async () => {
      await expect(
        simulationSuitesService.createSimulationSuite({ name: 'A'.repeat(51) } as any, mockTenantId, mockUserId, mockUserEmail),
      ).rejects.toThrow('Simulation suite name cannot exceed 50 characters');
    });

    it('should validate description length', async () => {
      await expect(
        simulationSuitesService.createSimulationSuite(
          { name: 'Valid Name', description: 'D'.repeat(301) } as any,
          mockTenantId,
          mockUserId,
          mockUserEmail,
        ),
      ).rejects.toThrow('Simulation suite description cannot exceed 300 characters');
    });

    it('wraps non-HttpException error from trigger config creation in 500', async () => {
      (simulationSuitesRepository.createSimulationSuiteInDb as jest.Mock).mockResolvedValue(mockSuite);
      jest.spyOn(triggerService, 'createTriggerTxtpConfig').mockRejectedValue(new Error('trigger DB fail'));

      await expect(simulationSuitesService.createSimulationSuite({ name: 'Test' } as any, mockTenantId, mockUserId)).rejects.toThrow(
        'Failed to create simulation suite: trigger DB fail',
      );
    });

    it('skips txtp config creation when primary_txtp is absent', async () => {
      const suiteWithoutTxtp = { ...mockSuite, primary_txtp: null, primary_txtp_version: null };
      (simulationSuitesRepository.createSimulationSuiteInDb as jest.Mock).mockResolvedValue(suiteWithoutTxtp);

      const result = await simulationSuitesService.createSimulationSuite({ name: 'Test' } as any, mockTenantId, mockUserId);

      expect(trsGenService.createContextTxtpConfig).not.toHaveBeenCalled();
      expect(triggerService.createTriggerTxtpConfig).not.toHaveBeenCalled();
      expect(trsGenService.recalculateGenerationCounts).not.toHaveBeenCalled();
      expect(result).toEqual({ ...suiteWithoutTxtp, generation_id: 7 });
    });
  });

  describe('updateSimulationSuite', () => {
    it('should update suite successfully', async () => {
      const payload = {
        description: 'Updated description',
        wizard_progress: { currentStep: 2, completedSteps: [1] },
      };

      const updatedSuite = {
        ...mockSuite,
        description: 'Updated description',
      };

      (simulationSuitesRepository.updateSimulationSuiteInDb as jest.Mock).mockResolvedValue(updatedSuite);

      const result = await simulationSuitesService.updateSimulationSuite(1, mockTenantId, payload as any);

      expect(result).toEqual(updatedSuite);
      expect(simulationSuitesRepository.updateSimulationSuiteInDb).toHaveBeenCalledWith(1, mockTenantId, payload);
    });

    it('should validate empty name during update', async () => {
      await expect(simulationSuitesService.updateSimulationSuite(1, mockTenantId, { name: '   ' } as any)).rejects.toThrow(
        'Simulation suite name cannot be empty',
      );

      expect(simulationSuitesRepository.updateSimulationSuiteInDb).not.toHaveBeenCalled();
    });

    it('should validate name length during update', async () => {
      await expect(simulationSuitesService.updateSimulationSuite(1, mockTenantId, { name: 'A'.repeat(51) } as any)).rejects.toThrow(
        'Simulation suite name cannot exceed 50 characters',
      );
    });

    it('should throw not found when suite does not exist', async () => {
      (simulationSuitesRepository.updateSimulationSuiteInDb as jest.Mock).mockResolvedValue(null);

      await expect(simulationSuitesService.updateSimulationSuite(99, mockTenantId, { status: 'DRAFT' } as any)).rejects.toThrow(
        'Simulation suite with id 99 not found',
      );
    });

    it('should wrap repository errors during update', async () => {
      (simulationSuitesRepository.updateSimulationSuiteInDb as jest.Mock).mockRejectedValue(new Error('DB update failed'));

      await expect(simulationSuitesService.updateSimulationSuite(1, mockTenantId, { status: 'DRAFT' } as any)).rejects.toThrow(
        'Failed to update simulation suite: DB update failed',
      );
    });

    it('wraps non-Error thrown value with Unknown error', async () => {
      (simulationSuitesRepository.updateSimulationSuiteInDb as jest.Mock).mockRejectedValue('string failure');
      await expect(simulationSuitesService.updateSimulationSuite(1, mockTenantId, { status: 'DRAFT' } as any)).rejects.toThrow(
        'Unknown error',
      );
    });
  });

  describe('cloneSuite', () => {
    it('should clone suite with generation', async () => {
      (simulationSuitesRepository.getSimulationSuiteByIdFromDb as jest.Mock).mockResolvedValue(null);

      await expect(simulationSuitesService.cloneSuite(999, mockTenantId, mockUserId, mockUserEmail)).rejects.toThrow('Suite 999 not found');
    });

    it('should handle suite not found', async () => {
      (simulationSuitesRepository.getSimulationSuiteByIdFromDb as jest.Mock).mockResolvedValueOnce(null);

      await expect(simulationSuitesService.cloneSuite(999, mockTenantId, mockUserId)).rejects.toThrow('not found');
    });

    it('should handle suite without generation', async () => {
      (simulationSuitesRepository.getSimulationSuiteByIdFromDb as jest.Mock).mockResolvedValue(null);

      await expect(simulationSuitesService.cloneSuite(999, mockTenantId, mockUserId)).rejects.toThrow('Suite 999 not found');
    });

    it('should wrap database errors', async () => {
      (simulationSuitesRepository.getSimulationSuiteByIdFromDb as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      await expect(simulationSuitesService.cloneSuite(1, mockTenantId, mockUserId)).rejects.toThrow('Failed to clone suite');
    });

    it('should pass userEmail parameter', async () => {
      (simulationSuitesRepository.getSimulationSuiteByIdFromDb as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      await expect(simulationSuitesService.cloneSuite(1, mockTenantId, mockUserId, mockUserEmail)).rejects.toThrow(
        'Failed to clone suite: DB error',
      );
    });
  });
});
