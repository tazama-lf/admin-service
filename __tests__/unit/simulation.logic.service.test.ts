// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as repo from '../../src/repositories/configuration/simulation.repository';
import { createSimulation, findSimulations, getSimulationStats, getSimulationResults } from '../../src/services/simulation.logic.service';

jest.mock('../../src/repositories/configuration/simulation.repository');
jest.mock('../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
}));

const mockRepo = repo as jest.Mocked<typeof repo>;

describe('simulation.logic.service', () => {
  const tenantId = 'tenant-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSimulation', () => {
    it('creates simulation and returns simulation_id + message', async () => {
      mockRepo.createSimulationInDB.mockResolvedValue('sim001');

      const result = await createSimulation({ simulation_id: 'sim001', total_record: 100, sim_status: 'RUNNING' }, tenantId);

      expect(result.simulation_id).toBe('sim001');
      expect(result.message).toContain('sim001');
      expect(mockRepo.createSimulationInDB).toHaveBeenCalledWith({
        simulation_id: 'sim001',
        tenant_id: tenantId,
        total_record: 100,
        sim_status: 'RUNNING',
      });
    });

    it('omits undefined optional fields from the insert data', async () => {
      mockRepo.createSimulationInDB.mockResolvedValue('sim002');

      await createSimulation({ simulation_id: 'sim002' }, tenantId);

      expect(mockRepo.createSimulationInDB).toHaveBeenCalledWith({
        simulation_id: 'sim002',
        tenant_id: tenantId,
      });
    });

    it('throws when simulation_id is missing', async () => {
      await expect(createSimulation({}, tenantId)).rejects.toThrow('simulation_id is required');
      expect(mockRepo.createSimulationInDB).not.toHaveBeenCalled();
    });

    it('propagates repository errors', async () => {
      mockRepo.createSimulationInDB.mockRejectedValue(new Error('DB insert failed'));

      await expect(createSimulation({ simulation_id: 'sim003' }, tenantId)).rejects.toThrow('DB insert failed');
    });

    it('includes record_processed when provided', async () => {
      mockRepo.createSimulationInDB.mockResolvedValue('sim004');

      await createSimulation({ simulation_id: 'sim004', record_processed: 50 }, tenantId);

      expect(mockRepo.createSimulationInDB).toHaveBeenCalledWith(expect.objectContaining({ record_processed: 50 }));
    });
  });

  describe('findSimulations', () => {
    it('returns paginated simulation list', async () => {
      const mockRows = [{ simulation_id: 'sim001', sim_status: 'COMPLETED' }];
      mockRepo.countSimulationsInDB.mockResolvedValue(25);
      mockRepo.findSimulationsInDB.mockResolvedValue({ result: mockRows });

      const result = await findSimulations(10, 0, tenantId);

      expect(result.total).toBe(25);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
      expect(result.data).toEqual(mockRows);
      expect(mockRepo.findSimulationsInDB).toHaveBeenCalledWith(tenantId, 10, 0);
    });

    it('calculates correct DB offset from page offset', async () => {
      mockRepo.countSimulationsInDB.mockResolvedValue(100);
      mockRepo.findSimulationsInDB.mockResolvedValue({ result: [] });

      await findSimulations(10, 2, tenantId);

      expect(mockRepo.findSimulationsInDB).toHaveBeenCalledWith(tenantId, 10, 20);
    });

    it('uses default limit=10 and offset=0', async () => {
      mockRepo.countSimulationsInDB.mockResolvedValue(0);
      mockRepo.findSimulationsInDB.mockResolvedValue({ result: [] });

      const result = await findSimulations(undefined as any, undefined as any, tenantId);

      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it('propagates count error', async () => {
      mockRepo.countSimulationsInDB.mockRejectedValue(new Error('count failed'));

      await expect(findSimulations(10, 0, tenantId)).rejects.toThrow('count failed');
    });

    it('propagates find error', async () => {
      mockRepo.countSimulationsInDB.mockResolvedValue(5);
      mockRepo.findSimulationsInDB.mockRejectedValue(new Error('query failed'));

      await expect(findSimulations(10, 0, tenantId)).rejects.toThrow('query failed');
    });
  });

  describe('getSimulationStats', () => {
    const mockStats = {
      total_no_of_records: 200,
      records_evaluated: 150,
      alerts_generated: 30,
      alerts_not_generated: 120,
      run_date_time: '2026-05-06 10:00',
      replay_duration: '2m 30s',
    };

    it('returns stats from repository', async () => {
      mockRepo.getSimulationStatsFromDB.mockResolvedValue(mockStats);

      const result = await getSimulationStats('sim015', '1', tenantId);

      expect(result).toEqual(mockStats);
      expect(mockRepo.getSimulationStatsFromDB).toHaveBeenCalledWith('sim015', '1', tenantId);
    });

    it('propagates repository error', async () => {
      mockRepo.getSimulationStatsFromDB.mockRejectedValue(new Error('stats failed'));

      await expect(getSimulationStats('sim015', '1', tenantId)).rejects.toThrow('stats failed');
    });

    it('returns null run_date_time and replay_duration when unavailable', async () => {
      mockRepo.getSimulationStatsFromDB.mockResolvedValue({
        ...mockStats,
        run_date_time: null,
        replay_duration: null,
      });

      const result = await getSimulationStats('sim015', '2', tenantId);
      expect(result.run_date_time).toBeNull();
      expect(result.replay_duration).toBeNull();
    });
  });

  describe('getSimulationResults', () => {
    const mockResponse = {
      data: [
        {
          msg_id: 'msg001',
          msg_type: 'pacs.008',
          outcome: 'Hit',
          time: '2026-05-06T05:00:00.000Z',
          triggered_rules: [{ id: 'r1', ruleId: 'r1', description: '', status: 'triggered' }],
          triggered_typologies: [{ name: 'typo-001', score: 90, rules: [] }],
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    };

    it('returns results from repository', async () => {
      mockRepo.getSimulationResultsFromDB.mockResolvedValue(mockResponse);

      const result = await getSimulationResults('sim015', '1', tenantId, 10, 0, {});

      expect(result).toEqual(mockResponse);
      expect(mockRepo.getSimulationResultsFromDB).toHaveBeenCalledWith('sim015', '1', tenantId, 10, 0, {});
    });

    it('passes filters through to repository', async () => {
      mockRepo.getSimulationResultsFromDB.mockResolvedValue({ ...mockResponse, total: 0, data: [] });

      await getSimulationResults('sim015', '1', tenantId, 5, 10, {
        msg_id: 'abc',
        msg_type: 'pacs',
        outcome: 'Hit',
      });

      expect(mockRepo.getSimulationResultsFromDB).toHaveBeenCalledWith('sim015', '1', tenantId, 5, 10, {
        msg_id: 'abc',
        msg_type: 'pacs',
        outcome: 'Hit',
      });
    });

    it('uses empty filters object when not provided', async () => {
      mockRepo.getSimulationResultsFromDB.mockResolvedValue({ ...mockResponse, total: 0, data: [] });

      await getSimulationResults('sim015', '1', tenantId, 10, 0);

      expect(mockRepo.getSimulationResultsFromDB).toHaveBeenCalledWith('sim015', '1', tenantId, 10, 0, {});
    });

    it('propagates repository error', async () => {
      mockRepo.getSimulationResultsFromDB.mockRejectedValue(new Error('results failed'));

      await expect(getSimulationResults('sim015', '1', tenantId, 10, 0)).rejects.toThrow('results failed');
    });
  });
});
