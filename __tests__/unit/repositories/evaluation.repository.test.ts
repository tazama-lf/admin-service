import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHandlePostExecuteSqlStatement = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandlePostExecuteSqlStatement(...args),
}));

jest.mock('../../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
}));

import { saveEvaluationsInDb, fetchAllEvaluations } from '../../../src/repositories/configuration/evaluation.repository';
import type { EvaluationRow } from '../../../src/repositories/configuration/evaluation.repository';

describe('Evaluation Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      expect(mockHandlePostExecuteSqlStatement).not.toHaveBeenCalled();
    });

    it('should throw when tableName is not provided', async () => {
      await expect(saveEvaluationsInDb([makeRow('1')])).rejects.toThrow('tableName is required');
      expect(mockHandlePostExecuteSqlStatement).not.toHaveBeenCalled();
    });

    it('should create table and insert when results table does not exist', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await saveEvaluationsInDb([makeRow('1')], 'sim001');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledTimes(3);

      const checkCall = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: string[] };
      expect(checkCall.values).toContain('sim001_results');

      const createCall = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[1][1];
      expect(createCall).toBe('simulation');
    });

    it('should query max iteration when results table already exists', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ max_iteration: 2 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await saveEvaluationsInDb([makeRow('1')], 'sim001');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledTimes(4);
      const insertCall = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[3][0] as { values: unknown[] };
      expect(insertCall.values[1]).toBe(3);
    });

    it('should use iteration 1 when max_iteration returns 0', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ max_iteration: 0 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await saveEvaluationsInDb([makeRow('1')], 'sim001');

      const insertCall = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[3][0] as { values: unknown[] };
      expect(insertCall.values[1]).toBe(1);
    });

    it('should use exists=false fallback when row has no exists field', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{}], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await saveEvaluationsInDb([makeRow('1')], 'sim001');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledTimes(3);
    });

    it('should insert multiple evaluations with correct placeholder count', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await saveEvaluationsInDb([makeRow('a'), makeRow('b')], 'sim002');

      const insertCall = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[2][0] as { values: unknown[] };
      expect(insertCall.values).toHaveLength(10);
    });

    it('should include ON CONFLICT DO NOTHING in insert query', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await saveEvaluationsInDb([makeRow('1')], 'sim001');

      const insertCall = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[2][0] as { text: string };
      expect(insertCall.text).toContain('ON CONFLICT');
      expect(insertCall.text).toContain('DO NOTHING');
    });

    it('should stringify evaluation JSON before inserting', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const evalData = { score: 99, rule: 'test' };
      await saveEvaluationsInDb(
        [{ iteration: 1, evaluation: evalData, messageid: 'msg-1', tenantid: 'tenant-1', credttm: new Date() }],
        'sim001',
      );

      const insertCall = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[2][0] as { values: unknown[] };
      expect(insertCall.values[0]).toBe(JSON.stringify(evalData));
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
