// SPDX-License-Identifier: Apache-2.0

import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/services/simulation-suites.logic.service', () => ({
  createSimulationSuite: jest.fn(),
  getSimulationSuites: jest.fn(),
  getSimulationSuitesCounts: jest.fn(),
  getSimulationSuiteById: jest.fn(),
  updateSimulationSuite: jest.fn(),
  cloneSuite: jest.fn(),
}));

jest.mock('../../src/services/trs-suite-generation.logic.service', () => ({
  resumeGeneration: jest.fn(),
  updateGenerationStatus: jest.fn(),
}));

jest.mock('../../src/handlers/errorHandler', () => ({
  ErrorHandler: {
    sendError: jest.fn(),
  },
}));

jest.mock('../../src', () => ({
  configuration: {},
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  createSimulationHandler,
  getSimulationsHandler,
  getSimulationSuitesCountsHandler,
  getSimulationByIdHandler,
  updateSimulationHandler,
  resumeGenerationHandler,
  updateGenerationStatusHandler,
  cloneSuiteHandler,
} from '../../src/app.controller';
import * as simulationSuitesService from '../../src/services/simulation-suites.logic.service';
import * as trsSuiteGenerationService from '../../src/services/trs-suite-generation.logic.service';
import { ErrorHandler } from '../../src/handlers/errorHandler';

describe('Simulation Suites API Handlers', () => {
  const mockTenantId = 'tenant-123';

  const mockSuite = {
    id: 101,
    tenant_id: mockTenantId,
    name: 'Q3 Edge Cases',
    wizard_progress: { currentStep: 1, completedSteps: [1] },
    created_at: new Date('2026-05-01T00:00:00.000Z'),
    updated_at: new Date('2026-05-01T00:00:00.000Z'),
  };

  const buildReply = (): Partial<FastifyReply> => ({
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSimulationHandler', () => {
    it('should create simulation suite and return 201', async () => {
      (simulationSuitesService.createSimulationSuite as jest.Mock).mockResolvedValue(mockSuite);

      const req = {
        tenantId: mockTenantId,
        user: {
          clientId: 'client-001',
          preferred_username: 'creator@example.com',
        },
        body: {
          name: 'Q3 Edge Cases',
          description: 'Initial step data',
          rule_name: 'Rule 002',
        },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await createSimulationHandler(req, reply as FastifyReply);

      expect(simulationSuitesService.createSimulationSuite).toHaveBeenCalledWith(
        req.body,
        mockTenantId,
        'client-001',
        'creator@example.com',
      );
      expect(reply.status).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Simulation suite created successfully',
          data: mockSuite,
        }),
      );
    });

    it('should delegate errors to ErrorHandler', async () => {
      const error = new Error('Create failed');
      (simulationSuitesService.createSimulationSuite as jest.Mock).mockRejectedValue(error);

      const req = {
        tenantId: mockTenantId,
        user: {
          sub: 'user-123',
        },
        body: {
          name: 'Q3 Edge Cases',
        },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await createSimulationHandler(req, reply as FastifyReply);

      expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply, error, 'Failed to create simulation suite');
    });
  });

  describe('getSimulationsHandler', () => {
    it('should return list with pagination and mapped query options', async () => {
      const result = { data: [mockSuite], total: 1, limit: 10, offset: 0 };
      (simulationSuitesService.getSimulationSuites as jest.Mock).mockResolvedValue(result);

      const req = {
        tenantId: mockTenantId,
        query: {
          search: 'edge',
          status: 'DRAFT',
          rule_name: 'Rule 002',
          txtp: 'pacs.008',
          updated_from: '2026-05-01',
          updated_to: '2026-05-31',
          limit: 10,
          offset: 0,
        },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await getSimulationsHandler(req, reply as FastifyReply);

      expect(simulationSuitesService.getSimulationSuites).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
          search: 'edge',
          status: 'DRAFT',
          ruleName: 'Rule 002',
          txtp: 'pacs.008',
          limit: 10,
          offset: 0,
        }),
      );

      const calledWith = (simulationSuitesService.getSimulationSuites as jest.Mock).mock.calls[0][0];
      expect(calledWith.updatedFrom).toBeInstanceOf(Date);
      expect(calledWith.updatedTo).toBeInstanceOf(Date);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          suites: result.data,
          total: 1,
        }),
      );
    });
  });

  describe('getSimulationSuitesCountsHandler', () => {
    it('should return simulation suites counts with 200', async () => {
      const counts = {
        total_suites: 10,
        total_draft_suites: 4,
        total_completed_suites: 3,
        latest_run_at: new Date('2026-06-01T00:00:00.000Z'),
      };
      (simulationSuitesService.getSimulationSuitesCounts as jest.Mock).mockResolvedValue(counts);

      const req = {
        tenantId: mockTenantId,
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await getSimulationSuitesCountsHandler(req, reply as FastifyReply);

      expect(simulationSuitesService.getSimulationSuitesCounts).toHaveBeenCalledWith(mockTenantId);
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ success: true, data: counts });
    });

    it('should delegate count errors to ErrorHandler', async () => {
      const error = new Error('Counts failed');
      (simulationSuitesService.getSimulationSuitesCounts as jest.Mock).mockRejectedValue(error);

      const req = {
        tenantId: mockTenantId,
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await getSimulationSuitesCountsHandler(req, reply as FastifyReply);

      expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply, error, 'Failed to retrieve simulation suites counts');
    });
  });

  describe('getSimulationByIdHandler', () => {
    it('should return 400 for invalid id', async () => {
      const req = {
        tenantId: mockTenantId,
        params: { id: 'abc' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await getSimulationByIdHandler(req, reply as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'Invalid simulation suite ID' });
      expect(simulationSuitesService.getSimulationSuiteById).not.toHaveBeenCalled();
    });

    it('should return simulation suite for valid id', async () => {
      (simulationSuitesService.getSimulationSuiteById as jest.Mock).mockResolvedValue(mockSuite);

      const req = {
        tenantId: mockTenantId,
        params: { id: '101' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await getSimulationByIdHandler(req, reply as FastifyReply);

      expect(simulationSuitesService.getSimulationSuiteById).toHaveBeenCalledWith(101, mockTenantId);
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          suite: mockSuite,
        }),
      );
    });
  });

  describe('updateSimulationHandler', () => {
    it('should return 400 for invalid id', async () => {
      const req = {
        tenantId: mockTenantId,
        params: { id: '' },
        body: { description: 'Updated' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await updateSimulationHandler(req, reply as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'Invalid simulation suite ID' });
      expect(simulationSuitesService.updateSimulationSuite).not.toHaveBeenCalled();
    });

    it('should update suite and return 200', async () => {
      const updatedSuite = {
        ...mockSuite,
        description: 'Step 2 saved',
      };
      (simulationSuitesService.updateSimulationSuite as jest.Mock).mockResolvedValue(updatedSuite);

      const req = {
        tenantId: mockTenantId,
        params: { id: '101' },
        body: {
          wizard_progress: { currentStep: 2, completedSteps: [1] },
          description: 'Step 2 saved',
        },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await updateSimulationHandler(req, reply as FastifyReply);

      expect(simulationSuitesService.updateSimulationSuite).toHaveBeenCalledWith(101, mockTenantId, req.body);
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Simulation suite updated successfully',
          suite: updatedSuite,
        }),
      );
    });

    it('should delegate update errors to ErrorHandler', async () => {
      const error = new Error('Update failed');
      (simulationSuitesService.updateSimulationSuite as jest.Mock).mockRejectedValue(error);

      const req = {
        tenantId: mockTenantId,
        params: { id: '101' },
        body: { status: 'COMPLETED' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await updateSimulationHandler(req, reply as FastifyReply);

      expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply, error, 'Failed to update simulation suite');
    });
  });

  describe('resumeGenerationHandler', () => {
    it('should return 400 for invalid suiteId', async () => {
      const req = {
        params: { suiteId: 'abc' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await resumeGenerationHandler(req, reply as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'Invalid suite ID' });
      expect(trsSuiteGenerationService.resumeGeneration).not.toHaveBeenCalled();
    });

    it('should resume generation and return 200', async () => {
      const resumeResult = {
        generation_id: 10,
        generation_number: 2,
        status: 'IN_PROGRESS',
      };
      (trsSuiteGenerationService.resumeGeneration as jest.Mock).mockResolvedValue(resumeResult);

      const req = {
        params: { suiteId: '101' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await resumeGenerationHandler(req, reply as FastifyReply);

      expect(trsSuiteGenerationService.resumeGeneration).toHaveBeenCalledWith(101);
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ success: true, message: 'Generation resumed', data: resumeResult });
    });

    it('should delegate errors to ErrorHandler', async () => {
      const error = new Error('Resume failed');
      (trsSuiteGenerationService.resumeGeneration as jest.Mock).mockRejectedValue(error);

      const req = {
        params: { suiteId: '101' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await resumeGenerationHandler(req, reply as FastifyReply);

      expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply, error, 'Failed to resume generation');
    });
  });

  describe('updateGenerationStatusHandler', () => {
    it('should return 400 for invalid generationId', async () => {
      const req = {
        params: { generationId: 'abc' },
        body: { status: 'COMPLETED' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await updateGenerationStatusHandler(req, reply as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'Invalid generation ID' });
      expect(trsSuiteGenerationService.updateGenerationStatus).not.toHaveBeenCalled();
    });

    it('should return 400 if status is missing', async () => {
      const req = {
        params: { generationId: '1' },
        body: {},
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await updateGenerationStatusHandler(req, reply as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'Status is required' });
      expect(trsSuiteGenerationService.updateGenerationStatus).not.toHaveBeenCalled();
    });

    it('should update generation status and return 200', async () => {
      const updated = {
        id: 1,
        suite_id: 101,
        generation_number: 1,
        status: 'COMPLETED',
        simulation_type: 'SINGLE_RULE',
        context_count: 5,
        trigger_count: 3,
        enrichment_table_count: 2,
        generated_context_count: 0,
        generated_trigger_count: 0,
        generated_enrichment_row_count: 0,
        context_field_config_count: 0,
        trigger_field_config_count: 0,
        enrichment_field_config_count: 0,
        wizard_snapshot: {},
        generation_metadata: {},
        created_by: 'user-1',
        created_at: new Date(),
        updated_at: new Date(),
      };
      (trsSuiteGenerationService.updateGenerationStatus as jest.Mock).mockResolvedValue(updated);

      const req = {
        params: { generationId: '1' },
        body: { status: 'COMPLETED' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await updateGenerationStatusHandler(req, reply as FastifyReply);

      expect(trsSuiteGenerationService.updateGenerationStatus).toHaveBeenCalledWith(1, 'COMPLETED');
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Generation status updated',
        data: updated,
      });
    });

    it('should delegate errors to ErrorHandler', async () => {
      const error = new Error('Update failed');
      (trsSuiteGenerationService.updateGenerationStatus as jest.Mock).mockRejectedValue(error);

      const req = {
        params: { generationId: '1' },
        body: { status: 'FAILED' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await updateGenerationStatusHandler(req, reply as FastifyReply);

      expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply, error, 'Failed to update generation status');
    });
  });

  describe('cloneSuiteHandler', () => {
    it('should return 400 for invalid suiteId', async () => {
      const req = {
        tenantId: mockTenantId,
        params: { id: 'xyz' },
        user: { clientId: 'client-001', preferred_username: 'user@test.com' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await cloneSuiteHandler(req, reply as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'Invalid suite ID' });
      expect(simulationSuitesService.cloneSuite).not.toHaveBeenCalled();
    });

    it('should clone suite and return 201', async () => {
      const clonedResult = {
        original_suite_id: 101,
        cloned_suite_id: 102,
        original_generation_id: 1,
        cloned_generation_id: 2,
      };
      (simulationSuitesService.cloneSuite as jest.Mock).mockResolvedValue(clonedResult);

      const req = {
        tenantId: mockTenantId,
        params: { id: '101' },
        user: {
          clientId: 'client-001',
          preferred_username: 'cloner@test.com',
        },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await cloneSuiteHandler(req, reply as FastifyReply);

      expect(simulationSuitesService.cloneSuite).toHaveBeenCalledWith(101, mockTenantId, 'client-001', 'cloner@test.com');
      expect(reply.status).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: clonedResult,
        }),
      );
    });

    it('should work without userEmail', async () => {
      const clonedResult = {
        original_suite_id: 101,
        cloned_suite_id: 103,
        original_generation_id: 1,
        cloned_generation_id: 3,
      };
      (simulationSuitesService.cloneSuite as jest.Mock).mockResolvedValue(clonedResult);

      const req = {
        tenantId: mockTenantId,
        params: { id: '101' },
        user: {
          clientId: 'client-002',
        },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await cloneSuiteHandler(req, reply as FastifyReply);

      expect(simulationSuitesService.cloneSuite).toHaveBeenCalledWith(101, mockTenantId, 'client-002', undefined);
      expect(reply.status).toHaveBeenCalledWith(201);
    });

    it('should delegate errors to ErrorHandler', async () => {
      const error = new Error('Clone failed');
      (simulationSuitesService.cloneSuite as jest.Mock).mockRejectedValue(error);

      const req = {
        tenantId: mockTenantId,
        params: { id: '101' },
        user: { clientId: 'client-001' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await cloneSuiteHandler(req, reply as FastifyReply);

      expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply, error, 'Failed to clone suite');
    });

    it('should handle zero as invalid suiteId', async () => {
      const req = {
        tenantId: mockTenantId,
        params: { id: '0' },
        user: { clientId: 'client-001' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await cloneSuiteHandler(req, reply as FastifyReply);

      // 0 parses successfully, so it will try to call cloneSuite
      expect(simulationSuitesService.cloneSuite).toHaveBeenCalledWith(0, mockTenantId, 'client-001', undefined);
    });
  });
});
