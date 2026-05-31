// SPDX-License-Identifier: Apache-2.0

process.env.ACTIVE_CONDITIONS_ONLY = 'true';

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as simulationSuitesService from '../../src/services/simulation-suites.logic.service';
import * as simulationSuitesRepository from '../../src/repositories/simulation-studio/suites.repository';

const mockedSimulationSuitesRepository = simulationSuitesRepository as unknown as Record<
  string,
  jest.MockedFunction<(...args: any[]) => Promise<any>>
>;

jest.mock('pgsql-ast-parser', () => ({ parse: jest.fn() }), { virtual: true });

jest.mock('../../src/repositories/simulation-studio/suites.repository', () => ({
  getSimulationSuitesFromDb: jest.fn(),
  getSimulationSuiteByIdFromDb: jest.fn(),
  createSimulationSuiteInDb: jest.fn(),
  updateSimulationSuiteInDb: jest.fn(),
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
  });

  describe('getSimulationSuites', () => {
    it('should return simulation suites list', async () => {
      const options = { tenantId: mockTenantId, limit: 20, offset: 0 };
      const response = { data: [mockSuite], total: 1, limit: 20, offset: 0 };
      mockedSimulationSuitesRepository.getSimulationSuitesFromDb.mockResolvedValue(response);

      const result = await simulationSuitesService.getSimulationSuites(options as any);

      expect(result).toEqual(response);
      expect(simulationSuitesRepository.getSimulationSuitesFromDb).toHaveBeenCalledWith(options);
    });

    it('should wrap repository errors', async () => {
      mockedSimulationSuitesRepository.getSimulationSuitesFromDb.mockRejectedValue(new Error('DB failure'));

      await expect(simulationSuitesService.getSimulationSuites({ tenantId: mockTenantId } as any)).rejects.toThrow(
        'Failed to retrieve simulation suites: DB failure',
      );
    });
  });

  describe('getSimulationSuiteById', () => {
    it('should return suite when found', async () => {
      mockedSimulationSuitesRepository.getSimulationSuiteByIdFromDb.mockResolvedValue(mockSuite);

      const result = await simulationSuitesService.getSimulationSuiteById(1, mockTenantId);

      expect(result).toEqual(mockSuite);
      expect(simulationSuitesRepository.getSimulationSuiteByIdFromDb).toHaveBeenCalledWith(1, mockTenantId);
    });

    it('should throw not found when suite is missing', async () => {
      mockedSimulationSuitesRepository.getSimulationSuiteByIdFromDb.mockResolvedValue(null);

      await expect(simulationSuitesService.getSimulationSuiteById(99, mockTenantId)).rejects.toThrow(
        'Simulation suite with id 99 not found',
      );
    });
  });

  describe('createSimulationSuite', () => {
    it('should create suite successfully', async () => {
      const payload = {
        name: 'Q3 Edge Cases',
        description: 'Suite for regression tests',
        rule_name: 'Rule 002',
      };

      mockedSimulationSuitesRepository.createSimulationSuiteInDb.mockResolvedValue(mockSuite);

      const result = await simulationSuitesService.createSimulationSuite(payload as any, mockTenantId, mockUserId, mockUserEmail);

      expect(result).toEqual(mockSuite);
      expect(simulationSuitesRepository.createSimulationSuiteInDb).toHaveBeenCalledWith(payload, mockTenantId, mockUserId, mockUserEmail);
    });

    it('should validate empty name', async () => {
      await expect(
        simulationSuitesService.createSimulationSuite({ name: '   ' } as any, mockTenantId, mockUserId, mockUserEmail),
      ).rejects.toThrow('Simulation suite name is required');

      expect(simulationSuitesRepository.createSimulationSuiteInDb).not.toHaveBeenCalled();
    });

    it('should validate name length', async () => {
      await expect(
        simulationSuitesService.createSimulationSuite({ name: 'A'.repeat(121) } as any, mockTenantId, mockUserId, mockUserEmail),
      ).rejects.toThrow('Simulation suite name cannot exceed 120 characters');
    });

    it('should validate description length', async () => {
      await expect(
        simulationSuitesService.createSimulationSuite(
          { name: 'Valid Name', description: 'D'.repeat(501) } as any,
          mockTenantId,
          mockUserId,
          mockUserEmail,
        ),
      ).rejects.toThrow('Simulation suite description cannot exceed 500 characters');
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

      mockedSimulationSuitesRepository.updateSimulationSuiteInDb.mockResolvedValue(updatedSuite);

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
      await expect(simulationSuitesService.updateSimulationSuite(1, mockTenantId, { name: 'A'.repeat(121) } as any)).rejects.toThrow(
        'Simulation suite name cannot exceed 120 characters',
      );
    });

    it('should throw not found when suite does not exist', async () => {
      mockedSimulationSuitesRepository.updateSimulationSuiteInDb.mockResolvedValue(null);

      await expect(simulationSuitesService.updateSimulationSuite(99, mockTenantId, { status: 'DRAFT' } as any)).rejects.toThrow(
        'Simulation suite with id 99 not found',
      );
    });

    it('should wrap repository errors during update', async () => {
      mockedSimulationSuitesRepository.updateSimulationSuiteInDb.mockRejectedValue(new Error('DB update failed'));

      await expect(simulationSuitesService.updateSimulationSuite(1, mockTenantId, { status: 'DRAFT' } as any)).rejects.toThrow(
        'Failed to update simulation suite: DB update failed',
      );
    });
  });

  describe('saveSimulationSuiteDraft', () => {
    it('should merge draft payload into wizard_progress and metadata.wizardDraft', async () => {
      mockedSimulationSuitesRepository.getSimulationSuiteByIdFromDb.mockResolvedValue(mockSuite);
      mockedSimulationSuitesRepository.updateSimulationSuiteInDb.mockResolvedValue({
        ...mockSuite,
        wizard_progress: { currentStep: 2, completedSteps: [1, 2], screen2: true },
      });

      const result = await simulationSuitesService.saveSimulationSuiteDraft(1, mockTenantId, {
        screen: 2,
        data: { txtpConfigs: [] },
      });

      expect(result.wizard_progress).toEqual(expect.objectContaining({ currentStep: 2 }));
      expect(simulationSuitesRepository.updateSimulationSuiteInDb).toHaveBeenCalledWith(
        1,
        mockTenantId,
        expect.objectContaining({
          wizard_progress: expect.objectContaining({ screen2: true }),
          metadata: expect.objectContaining({
            wizardDraft: expect.objectContaining({ screen2: { txtpConfigs: [] } }),
          }),
        }),
      );
    });
  });

  describe('generateSimulationSuiteContext', () => {
    it('should generate bounded context rows from suite data', async () => {
      mockedSimulationSuitesRepository.getSimulationSuiteByIdFromDb.mockResolvedValue(mockSuite);

      const result = await simulationSuitesService.generateSimulationSuiteContext(1, mockTenantId, { count: 2 });

      expect(result.count).toBe(2);
      expect(result.rows[0]).toEqual(
        expect.objectContaining({
          row_index: 1,
          txtp: 'pacs.008',
        }),
      );
    });
  });

  describe('runSimulationSuite', () => {
    it('should persist run bootstrap metadata and return provisioning status', async () => {
      mockedSimulationSuitesRepository.getSimulationSuiteByIdFromDb.mockResolvedValue(mockSuite);
      mockedSimulationSuitesRepository.updateSimulationSuiteInDb.mockResolvedValue({
        ...mockSuite,
        status: 'RUNNING',
      });

      const result = await simulationSuitesService.runSimulationSuite(1, mockTenantId);

      expect(result.status).toBe('ENV_PROVISIONING');
      expect(result.phase).toBe('ENV_PROVISIONING');
      expect(result.runId).toContain('run-1-');
      expect(simulationSuitesRepository.updateSimulationSuiteInDb).toHaveBeenCalledWith(
        1,
        mockTenantId,
        expect.objectContaining({
          status: 'RUNNING',
          metadata: expect.objectContaining({
            simulationRuns: expect.any(Object),
          }),
        }),
      );
    });
  });

  describe('getSimulationSuiteRunStatus', () => {
    it('should return not found when run id is missing in metadata', async () => {
      mockedSimulationSuitesRepository.getSimulationSuiteByIdFromDb.mockResolvedValue(mockSuite);

      await expect(simulationSuitesService.getSimulationSuiteRunStatus(1, 'run-unknown', mockTenantId)).rejects.toThrow(
        'Run with id run-unknown not found for suite 1',
      );
    });

    it('should return stored run status payload', async () => {
      mockedSimulationSuitesRepository.getSimulationSuiteByIdFromDb.mockResolvedValue({
        ...mockSuite,
        metadata: {
          simulationRuns: {
            'run-1-1': {
              status: 'RUNNING',
              phase: 'TRANSACTION_LOOP',
              partialResults: [],
            },
          },
        },
      });

      const result = await simulationSuitesService.getSimulationSuiteRunStatus(1, 'run-1-1', mockTenantId);

      expect(result).toEqual(
        expect.objectContaining({
          runId: 'run-1-1',
          status: 'RUNNING',
          phase: 'TRANSACTION_LOOP',
          partialResults: [],
        }),
      );
    });
  });
});
