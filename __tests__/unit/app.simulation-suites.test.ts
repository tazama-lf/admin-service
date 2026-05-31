// SPDX-License-Identifier: Apache-2.0

import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('pgsql-ast-parser', () => ({ parse: jest.fn() }), { virtual: true });

jest.mock('../../src/services/simulation-suites.logic.service', () => ({
  createSimulationSuite: jest.fn(),
  getSimulationSuites: jest.fn(),
  getSimulationSuiteById: jest.fn(),
  updateSimulationSuite: jest.fn(),
  saveSimulationSuiteDraft: jest.fn(),
  generateSimulationSuiteContext: jest.fn(),
  runSimulationSuite: jest.fn(),
  getSimulationSuiteRunStatus: jest.fn(),
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
  createSimulationSuiteHandler,
  getSimulationSuitesHandler,
  getSimulationSuiteByIdHandler,
  updateSimulationSuiteHandler,
  putSimulationSuiteDraftHandler,
  generateSimulationContextHandler,
  runSimulationSuiteHandler,
  getSimulationRunStatusHandler,
} from '../../src/app.controller';
import * as simulationSuitesService from '../../src/services/simulation-suites.logic.service';
import { ErrorHandler } from '../../src/handlers/errorHandler';

const mockedSimulationSuitesService = simulationSuitesService as unknown as Record<
  string,
  jest.MockedFunction<(...args: any[]) => Promise<any>>
>;

describe('Simulation Studio Suites API Handlers', () => {
  const mockTenantId = 'tenant-123';

  const mockSuite = {
    id: 101,
    tenant_id: mockTenantId,
    name: 'Q3 Edge Cases',
    status: 'DRAFT',
    wizard_progress: { currentStep: 1, completedSteps: [1] },
    created_at: new Date('2026-05-01T00:00:00.000Z'),
    updated_at: new Date('2026-05-01T00:00:00.000Z'),
  };

  const buildReply = (): any => ({
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSimulationSuiteHandler', () => {
    it('should create simulation suite and return 201', async () => {
      mockedSimulationSuitesService.createSimulationSuite.mockResolvedValue(mockSuite);

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

      await createSimulationSuiteHandler(req, reply as FastifyReply);

      expect(simulationSuitesService.createSimulationSuite).toHaveBeenCalledWith(
        req.body as any,
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
      mockedSimulationSuitesService.createSimulationSuite.mockRejectedValue(error);

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

      await createSimulationSuiteHandler(req, reply as FastifyReply);

      expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply as any, error, 'Failed to create simulation suite');
    });
  });

  describe('getSimulationSuitesHandler', () => {
    it('should return list with pagination and mapped query options', async () => {
      const result = { data: [mockSuite], total: 1, limit: 10, offset: 0 };
      mockedSimulationSuitesService.getSimulationSuites.mockResolvedValue(result);

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

      await getSimulationSuitesHandler(req, reply as FastifyReply);

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

      const calledWith = mockedSimulationSuitesService.getSimulationSuites.mock.calls[0][0] as any;
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

    it('should honor rule/page aliases when rule_name/offset are omitted', async () => {
      const result = { data: [mockSuite], total: 1, limit: 10, offset: 10 };
      mockedSimulationSuitesService.getSimulationSuites.mockResolvedValue(result);

      const req = {
        tenantId: mockTenantId,
        query: {
          rule: 'Rule Alias',
          page: 2,
          limit: 10,
        },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await getSimulationSuitesHandler(req, reply as FastifyReply);

      expect(simulationSuitesService.getSimulationSuites).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
          ruleName: 'Rule Alias',
          offset: 10,
          limit: 10,
        }),
      );
      expect(reply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getSimulationSuiteByIdHandler', () => {
    it('should return 400 for invalid id', async () => {
      const req = {
        tenantId: mockTenantId,
        params: { id: 'abc' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await getSimulationSuiteByIdHandler(req, reply as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'Invalid simulation suite ID' });
      expect(simulationSuitesService.getSimulationSuiteById).not.toHaveBeenCalled();
    });

    it('should return simulation suite for valid id', async () => {
      mockedSimulationSuitesService.getSimulationSuiteById.mockResolvedValue(mockSuite);

      const req = {
        tenantId: mockTenantId,
        params: { id: '101' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await getSimulationSuiteByIdHandler(req, reply as FastifyReply);

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

  describe('updateSimulationSuiteHandler', () => {
    it('should return 400 for invalid id', async () => {
      const req = {
        tenantId: mockTenantId,
        params: { id: '' },
        body: { description: 'Updated' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await updateSimulationSuiteHandler(req, reply as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'Invalid simulation suite ID' });
      expect(simulationSuitesService.updateSimulationSuite).not.toHaveBeenCalled();
    });

    it('should update suite and return 200', async () => {
      const updatedSuite = {
        ...mockSuite,
        description: 'Step 2 saved',
      };
      mockedSimulationSuitesService.updateSimulationSuite.mockResolvedValue(updatedSuite);

      const req = {
        tenantId: mockTenantId,
        params: { id: '101' },
        body: {
          wizard_progress: { currentStep: 2, completedSteps: [1] },
          description: 'Step 2 saved',
        },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await updateSimulationSuiteHandler(req, reply as FastifyReply);

      expect(simulationSuitesService.updateSimulationSuite).toHaveBeenCalledWith(101, mockTenantId, req.body as any);
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
      mockedSimulationSuitesService.updateSimulationSuite.mockRejectedValue(error);

      const req = {
        tenantId: mockTenantId,
        params: { id: '101' },
        body: { status: 'COMPLETED' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await updateSimulationSuiteHandler(req, reply as FastifyReply);

      expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply as any, error, 'Failed to update simulation suite');
    });
  });

  describe('putSimulationSuiteDraftHandler', () => {
    it('should save draft and return 200', async () => {
      const updatedSuite = { ...mockSuite, wizard_progress: { currentStep: 2, completedSteps: [1, 2] } };
      mockedSimulationSuitesService.saveSimulationSuiteDraft.mockResolvedValue(updatedSuite);

      const req = {
        tenantId: mockTenantId,
        params: { id: '101' },
        body: { screen: 2, data: { txtpConfigs: [] } },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await putSimulationSuiteDraftHandler(req, reply as FastifyReply);

      expect(simulationSuitesService.saveSimulationSuiteDraft).toHaveBeenCalledWith(101, mockTenantId, req.body as any);
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Simulation suite draft saved successfully',
          suite: updatedSuite,
        }),
      );
    });
  });

  describe('generateSimulationContextHandler', () => {
    it('should generate suite context and return 200', async () => {
      mockedSimulationSuitesService.generateSimulationSuiteContext.mockResolvedValue({
        rows: [{ row_index: 1, txtp: 'pacs.008', payload: { generatedIndex: 1 } }],
        count: 1,
      });

      const req = {
        tenantId: mockTenantId,
        params: { id: '101' },
        query: { count: 1 },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await generateSimulationContextHandler(req, reply as FastifyReply);

      expect(simulationSuitesService.generateSimulationSuiteContext).toHaveBeenCalledWith(101, mockTenantId, { count: 1 });
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          count: 1,
        }),
      );
    });
  });

  describe('runSimulationSuiteHandler', () => {
    it('should start run and return run state', async () => {
      mockedSimulationSuitesService.runSimulationSuite.mockResolvedValue({
        runId: 'run-101-123',
        status: 'ENV_PROVISIONING',
        phase: 'ENV_PROVISIONING',
      });

      const req = {
        tenantId: mockTenantId,
        params: { id: '101' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await runSimulationSuiteHandler(req, reply as FastifyReply);

      expect(simulationSuitesService.runSimulationSuite).toHaveBeenCalledWith(101, mockTenantId);
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          runId: 'run-101-123',
          status: 'ENV_PROVISIONING',
        }),
      );
    });
  });

  describe('getSimulationRunStatusHandler', () => {
    it('should return 400 for missing runId', async () => {
      const req = {
        tenantId: mockTenantId,
        params: { id: '101', runId: '' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await getSimulationRunStatusHandler(req, reply as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'Invalid run ID' });
      expect(simulationSuitesService.getSimulationSuiteRunStatus).not.toHaveBeenCalled();
    });

    it('should return run status payload for valid suite and run ids', async () => {
      mockedSimulationSuitesService.getSimulationSuiteRunStatus.mockResolvedValue({
        runId: 'run-101-123',
        status: 'RUNNING',
        phase: 'TRANSACTION_LOOP',
        partialResults: [],
      });

      const req = {
        tenantId: mockTenantId,
        params: { id: '101', runId: 'run-101-123' },
      } as unknown as FastifyRequest;
      const reply = buildReply();

      await getSimulationRunStatusHandler(req, reply as FastifyReply);

      expect(simulationSuitesService.getSimulationSuiteRunStatus).toHaveBeenCalledWith(101, 'run-101-123', mockTenantId);
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          status: 'RUNNING',
          phase: 'TRANSACTION_LOOP',
        }),
      );
    });
  });
});
