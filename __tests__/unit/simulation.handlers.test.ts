// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { FastifyRequest, FastifyReply } from 'fastify';

jest.mock('../../src/services/simulation.logic.service');
jest.mock('../../src/handlers/errorHandler', () => ({
  ErrorHandler: {
    sendError: jest.fn(),
  },
}));
jest.mock('../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: jest.fn(),
}));

import * as simulationService from '../../src/services/simulation.logic.service';
import { ErrorHandler } from '../../src/handlers/errorHandler';
import {
  createSimulationHandler,
  getAllSimulationsHandler,
  getSimulationStatsHandler,
  getSimulationResultsHandler,
} from '../../src/app.controller';

const mockService = simulationService as jest.Mocked<typeof simulationService>;

const makeReply = () => {
  const reply = {
    code: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as FastifyReply;
  return reply;
};

const makeReq = (
  overrides: Partial<FastifyRequest> & { tenantId?: string; body?: unknown; params?: unknown; query?: unknown },
): FastifyRequest => overrides as unknown as FastifyRequest;

describe('Simulation HTTP Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSimulationHandler', () => {
    it('creates simulation and responds 201', async () => {
      mockService.createSimulation.mockResolvedValue({
        message: 'Simulation sim001 created successfully',
        simulation_id: 'sim001',
      });

      const req = makeReq({ tenantId: 'tenant-1', body: { simulation_id: 'sim001' } });
      const reply = makeReply();

      await createSimulationHandler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Simulation sim001 created successfully',
        simulation_id: 'sim001',
      });
    });

    it('calls ErrorHandler.sendError on failure', async () => {
      const err = new Error('insert failed');
      mockService.createSimulation.mockRejectedValue(err);

      const req = makeReq({ tenantId: 'tenant-1', body: {} });
      const reply = makeReply();

      await createSimulationHandler(req, reply);

      expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply, err, 'Failed to create simulation');
    });
  });

  describe('getAllSimulationsHandler', () => {
    it('returns paginated simulations with 200', async () => {
      mockService.findSimulations.mockResolvedValue({
        data: [{ simulation_id: 'sim001' }],
        total: 1,
        limit: 10,
        offset: 0,
      });

      const req = makeReq({ tenantId: 'tenant-1', params: { limit: '10', offset: '0' } });
      const reply = makeReply();

      await getAllSimulationsHandler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          total: 1,
          limit: 10,
          offset: 0,
          pages: 1,
        }),
      );
    });

    it('uses default limit and offset when not provided in params', async () => {
      mockService.findSimulations.mockResolvedValue({ data: [], total: 0, limit: 10, offset: 0 });

      const req = makeReq({ tenantId: 'tenant-1', params: {} });
      const reply = makeReply();

      await getAllSimulationsHandler(req, reply);

      expect(mockService.findSimulations).toHaveBeenCalledWith(10, 0, 'tenant-1');
    });

    it('calculates pages correctly', async () => {
      mockService.findSimulations.mockResolvedValue({ data: [], total: 25, limit: 10, offset: 0 });

      const req = makeReq({ tenantId: 'tenant-1', params: { limit: '10', offset: '0' } });
      const reply = makeReply();

      await getAllSimulationsHandler(req, reply);

      const sent = (reply.send as jest.Mock).mock.calls[0][0] as any;
      expect(sent.pages).toBe(3);
    });

    it('calls ErrorHandler on failure', async () => {
      const err = new Error('query failed');
      mockService.findSimulations.mockRejectedValue(err);

      const req = makeReq({ tenantId: 'tenant-1', params: {} });
      const reply = makeReply();

      await getAllSimulationsHandler(req, reply);

      expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply, err, 'Failed to get simulations');
    });
  });

  describe('getSimulationStatsHandler', () => {
    const mockStats = {
      total_no_of_records: 100,
      records_evaluated: 80,
      alerts_generated: 20,
      alerts_not_generated: 60,
      run_date_time: '2026-05-06 10:00',
      replay_duration: '2m 30s',
    };

    it('returns stats with 200 on success', async () => {
      mockService.getSimulationStats.mockResolvedValue(mockStats);

      const req = makeReq({ tenantId: 'tenant-1', query: { sim: 'sim015', iteration_no: '1' } });
      const reply = makeReply();

      await getSimulationStatsHandler(req, reply);

      expect(mockService.getSimulationStats).toHaveBeenCalledWith('sim015', '1', 'tenant-1');
      expect(reply.code).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ success: true, ...mockStats });
    });

    it('lowercases sim before calling service', async () => {
      mockService.getSimulationStats.mockResolvedValue(mockStats);

      const req = makeReq({ tenantId: 'tenant-1', query: { sim: '  SIM015  ', iteration_no: '1' } });
      const reply = makeReply();

      await getSimulationStatsHandler(req, reply);

      expect(mockService.getSimulationStats).toHaveBeenCalledWith('sim015', '1', 'tenant-1');
    });

    it('returns 400 when sim is missing', async () => {
      const req = makeReq({ tenantId: 'tenant-1', query: { iteration_no: '1' } });
      const reply = makeReply();

      await getSimulationStatsHandler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: expect.stringContaining('sim') }));
    });

    it('returns 400 when iteration_no is missing', async () => {
      const req = makeReq({ tenantId: 'tenant-1', query: { sim: 'sim015' } });
      const reply = makeReply();

      await getSimulationStatsHandler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringContaining('iteration_no') }),
      );
    });

    it('returns 400 when iteration_no is not numeric', async () => {
      const req = makeReq({ tenantId: 'tenant-1', query: { sim: 'sim015', iteration_no: 'abc' } });
      const reply = makeReply();

      await getSimulationStatsHandler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: expect.stringContaining('numeric') }));
    });

    it('calls ErrorHandler on service failure', async () => {
      const err = new Error('stats error');
      mockService.getSimulationStats.mockRejectedValue(err);

      const req = makeReq({ tenantId: 'tenant-1', query: { sim: 'sim015', iteration_no: '1' } });
      const reply = makeReply();

      await getSimulationStatsHandler(req, reply);

      expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply, err, 'Failed to get simulation stats');
    });
  });

  describe('getSimulationResultsHandler', () => {
    const mockResults = {
      data: [{ msg_id: 'msg001', msg_type: 'pacs.008', outcome: 'Hit', time: null, triggered_rules: [], triggered_typologies: [] }],
      total: 1,
      limit: 10,
      offset: 0,
    };

    it('returns results with 200 on success', async () => {
      mockService.getSimulationResults.mockResolvedValue(mockResults);

      const req = makeReq({
        tenantId: 'tenant-1',
        query: { sim: 'sim015', iteration_no: '1', limit: '10', offset: '0' },
      });
      const reply = makeReply();

      await getSimulationResultsHandler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ success: true, ...mockResults });
    });

    it('passes all query params and filters to service', async () => {
      mockService.getSimulationResults.mockResolvedValue(mockResults);

      const req = makeReq({
        tenantId: 'tenant-1',
        query: {
          sim: 'sim015',
          iteration_no: '2',
          limit: '5',
          offset: '1',
          msg_id: 'abc',
          msg_type: 'pacs',
          outcome: 'Hit',
        },
      });
      const reply = makeReply();

      await getSimulationResultsHandler(req, reply);

      expect(mockService.getSimulationResults).toHaveBeenCalledWith('sim015', '2', 'tenant-1', 5, 5, {
        msg_id: 'abc',
        msg_type: 'pacs',
        outcome: 'Hit',
      });
    });

    it('uses default limit=10 and offset=0 when not provided', async () => {
      mockService.getSimulationResults.mockResolvedValue(mockResults);

      const req = makeReq({ tenantId: 'tenant-1', query: { sim: 'sim015', iteration_no: '1' } });
      const reply = makeReply();

      await getSimulationResultsHandler(req, reply);

      expect(mockService.getSimulationResults).toHaveBeenCalledWith('sim015', '1', 'tenant-1', 10, 0, {
        msg_id: undefined,
        msg_type: undefined,
        outcome: undefined,
      });
    });

    it('returns 400 when sim is missing', async () => {
      const req = makeReq({ tenantId: 'tenant-1', query: { iteration_no: '1' } });
      const reply = makeReply();

      await getSimulationResultsHandler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: expect.stringContaining('sim') }));
    });

    it('returns 400 when iteration_no is missing', async () => {
      const req = makeReq({ tenantId: 'tenant-1', query: { sim: 'sim015' } });
      const reply = makeReply();

      await getSimulationResultsHandler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('returns 400 when iteration_no is not numeric', async () => {
      const req = makeReq({ tenantId: 'tenant-1', query: { sim: 'sim015', iteration_no: 'two' } });
      const reply = makeReply();

      await getSimulationResultsHandler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('returns 400 when outcome is invalid', async () => {
      const req = makeReq({
        tenantId: 'tenant-1',
        query: { sim: 'sim015', iteration_no: '1', outcome: 'Maybe' },
      });
      const reply = makeReply();

      await getSimulationResultsHandler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('"Hit" or "No-Hit"') }));
    });

    it('accepts "No-Hit" as valid outcome', async () => {
      mockService.getSimulationResults.mockResolvedValue(mockResults);

      const req = makeReq({
        tenantId: 'tenant-1',
        query: { sim: 'sim015', iteration_no: '1', outcome: 'No-Hit' },
      });
      const reply = makeReply();

      await getSimulationResultsHandler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(200);
    });

    it('lowercases sim before calling service', async () => {
      mockService.getSimulationResults.mockResolvedValue(mockResults);

      const req = makeReq({
        tenantId: 'tenant-1',
        query: { sim: '  SIM015  ', iteration_no: '1' },
      });
      const reply = makeReply();

      await getSimulationResultsHandler(req, reply);

      expect(mockService.getSimulationResults).toHaveBeenCalledWith('sim015', '1', 'tenant-1', 10, 0, expect.anything());
    });

    it('calls ErrorHandler on service failure', async () => {
      const err = new Error('results error');
      mockService.getSimulationResults.mockRejectedValue(err);

      const req = makeReq({ tenantId: 'tenant-1', query: { sim: 'sim015', iteration_no: '1' } });
      const reply = makeReply();

      await getSimulationResultsHandler(req, reply);

      expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply, err, 'Failed to get simulation results');
    });
  });
});
