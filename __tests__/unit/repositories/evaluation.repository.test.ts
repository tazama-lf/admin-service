import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHandlePostExecuteSqlStatement = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockSimulationConnect = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandlePostExecuteSqlStatement(...args),
}));

jest.mock('../../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
  databaseManager: {
    _simulation: {
      connect: (...args: unknown[]) => mockSimulationConnect(...args),
    },
  },
}));

import { saveEvaluationsInDb, fetchAllEvaluations } from '../../../src/repositories/configuration/evaluation.repository';
import type { EvaluationRow } from '../../../src/repositories/configuration/evaluation.repository';

describe('Evaluation Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulationConnect.mockResolvedValue({ query: mockClientQuery, release: mockClientRelease });
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('saveEvaluationsInDb', () => {
    const makeRow = (id: string): EvaluationRow => ({
      iteration: 1,
      evaluation: { result: id },
      messageid: `msg-${id}`,
      tenantid: 'tenant-1',
      credttm: new Date('2026-01-01'),
    });

    it('should return immediately when evaluations array is empty', async () => {
      await saveEvaluationsInDb([]);
      expect(mockSimulationConnect).not.toHaveBeenCalled();
    });

    it('should throw when tableName is not provided', async () => {
      await expect(saveEvaluationsInDb([makeRow('1')])).rejects.toThrow('tableName is required');
      expect(mockSimulationConnect).not.toHaveBeenCalled();
    });

    it('should create table and insert within a serializable transaction', async () => {
      await saveEvaluationsInDb([makeRow('1')], 'sim001');

      expect(mockSimulationConnect).toHaveBeenCalledTimes(1);
      expect(mockClientRelease).toHaveBeenCalledTimes(1);

      const beginCall = mockClientQuery.mock.calls[0][0] as string;
      expect(beginCall).toContain('SERIALIZABLE');

      const createCall = mockClientQuery.mock.calls[1][0] as string;
      expect(createCall).toContain('CREATE TABLE IF NOT EXISTS');
      expect(createCall).toContain('sim001_results');

      const commitCall = mockClientQuery.mock.calls[4][0] as string;
      expect(commitCall).toBe('COMMIT');
    });

    it('should use MAX(iteration)+1 as the next iteration', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
        .mockResolvedValueOnce({ rows: [{ max_iteration: '2' }] }) // SELECT MAX
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await saveEvaluationsInDb([makeRow('1')], 'sim001');

      const insertValues = mockClientQuery.mock.calls[3][1] as unknown[];
      expect(insertValues[1]).toBe(3);
    });

    it('should use iteration 1 when max_iteration returns 0', async () => {
      // Default mock returns { rows: [] } → max_iteration undefined → 0 → nextIteration = 1
      await saveEvaluationsInDb([makeRow('1')], 'sim001');

      const insertValues = mockClientQuery.mock.calls[3][1] as unknown[];
      expect(insertValues[1]).toBe(1);
    });

    it('should rollback and rethrow when a query fails', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
        .mockResolvedValueOnce({ rows: [] }) // SELECT MAX
        .mockRejectedValueOnce(new Error('DB error')); // INSERT fails

      await expect(saveEvaluationsInDb([makeRow('1')], 'sim001')).rejects.toThrow('DB error');

      const rollbackCall = mockClientQuery.mock.calls[4][0] as string;
      expect(rollbackCall).toBe('ROLLBACK');
      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it('should insert multiple evaluations with correct placeholder count', async () => {
      await saveEvaluationsInDb([makeRow('a'), makeRow('b')], 'sim002');

      const insertValues = mockClientQuery.mock.calls[3][1] as unknown[];
      expect(insertValues).toHaveLength(10);
    });

    it('should not use ON CONFLICT in the insert query', async () => {
      await saveEvaluationsInDb([makeRow('1')], 'sim001');

      const insertSql = mockClientQuery.mock.calls[3][0] as string;
      expect(insertSql).not.toContain('ON CONFLICT');
    });

    it('should stringify evaluation JSON before inserting', async () => {
      const evalData = { score: 99 };
      await saveEvaluationsInDb(
        [{ iteration: 1, evaluation: evalData, messageid: 'msg-1', tenantid: 'tenant-1', credttm: new Date() }],
        'sim001',
      );

      const insertValues = mockClientQuery.mock.calls[3][1] as unknown[];
      expect(insertValues[0]).toBe(JSON.stringify(evalData));
    });
  });

  describe('fetchAllEvaluations', () => {
    it('should return all evaluation rows', async () => {
      const mockRows = [
        { evaluation: { score: 100 }, messageid: 'msg-1', tenantid: 'tenant-1', credttm: new Date() },
        { evaluation: { score: 50 }, messageid: 'msg-2', tenantid: 'tenant-1', credttm: new Date() },
      ];
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: mockRows, rowCount: 2 });

      const result = await fetchAllEvaluations('tenant-1');

      expect(result).toEqual(mockRows);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.objectContaining({ values: ['tenant-1'] }), 'evaluation');
    });

    it('should return empty array when no evaluations exist', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await fetchAllEvaluations('tenant-1');

      expect(result).toEqual([]);
    });

    it('should query the evaluation table with WHERE tenantid clause', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      await fetchAllEvaluations('tenant-1');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('WHERE tenantid = $1');
    });

    it('should propagate database errors', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('DB error'));

      await expect(fetchAllEvaluations('tenant-1')).rejects.toThrow('DB error');
    });
  });
});
