import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockHandlePostExecuteSqlStatement = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandlePostExecuteSqlStatement(...args),
}));

jest.mock('../../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  getSimulationLogsFromDb,
  createSimulationLogsInDb,
  fetchSimulationItemsFromTable,
  getSimulationMessagesFromDb,
  fetchCountFromDlh,
  stageItemsInSimTable,
  truncateEvaluationResultsInDb,
  saveRecordInTrsSimulationInDb,
} from '../../../src/repositories/configuration/simulation-logs.repository';

describe('Simulation Logs Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSimulationLogsFromDb', () => {
    const mockRuleId = 'rule-123';
    const mockTenantId = 'tenant-456';

    it('should get simulation logs with default sorting', async () => {
      const mockRows = [
        {
          id: 1,
          created_by: 'user-123',
          tenant_id: 'tenant-456',
          rule_id: 'rule-123',
          old_data: '{"field":"old"}',
          new_data: '{"field":"new"}',
          description: 'Test log',
          category: 'test',
          created_by_email: 'user@test.com',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ];

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockRows,
        rowCount: 1,
      });

      const result = await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
      });

      expect(result).toHaveLength(1);
      expect(result[0].old_data).toEqual({ field: 'old' });
      expect(result[0].new_data).toEqual({ field: 'new' });
      expect(result[0].created_at).toBeInstanceOf(Date);
      expect(result[0].updated_at).toBeInstanceOf(Date);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('ORDER BY created_at DESC'),
          values: [mockRuleId, mockTenantId],
        }),
        'configuration',
      );
    });

    it('should get simulation logs with category filter', async () => {
      const mockRows = [
        {
          id: 1,
          created_by: 'user-123',
          tenant_id: 'tenant-456',
          rule_id: 'rule-123',
          old_data: { field: 'old' },
          new_data: { field: 'new' },
          description: 'Test log',
          category: 'test-category',
          created_by_email: 'user@test.com',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ];

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockRows,
        rowCount: 1,
      });

      const result = await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
        category: 'test-category',
      });

      expect(result).toHaveLength(1);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('AND category = $3'),
          values: [mockRuleId, mockTenantId, 'test-category'],
        }),
        'configuration',
      );
    });

    it('should get simulation logs with ASC sort order', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
        sortOrder: 'asc',
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('ORDER BY created_at ASC');
    });

    it('should get simulation logs with DESC sort order', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
        sortOrder: 'desc',
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('ORDER BY created_at DESC');
    });

    it('should get simulation logs sorted by updated_at', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
        sortBy: 'updated_at',
        sortOrder: 'asc',
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('ORDER BY updated_at ASC');
    });

    it('should get simulation logs sorted by created_at', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
        sortBy: 'created_at',
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('ORDER BY created_at');
    });

    it('should default to created_at for invalid sortBy field', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
        sortBy: 'invalid_field' as any,
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('ORDER BY created_at');
    });

    it('should get simulation logs with limit', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
        limit: 10,
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('LIMIT $3');
      expect(callArg.values).toContain(10);
    });

    it('should get simulation logs with offset', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
        offset: 20,
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('OFFSET $3');
      expect(callArg.values).toContain(20);
    });

    it('should get simulation logs with limit and offset', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
        limit: 10,
        offset: 20,
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('LIMIT $3');
      expect(callArg.text).toContain('OFFSET $4');
      expect(callArg.values).toContain(10);
      expect(callArg.values).toContain(20);
    });

    it('should get simulation logs with all options', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
        category: 'test-category',
        sortBy: 'updated_at',
        sortOrder: 'asc',
        limit: 5,
        offset: 10,
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('AND category = $3');
      expect(callArg.text).toContain('ORDER BY updated_at ASC');
      expect(callArg.text).toContain('LIMIT $4');
      expect(callArg.text).toContain('OFFSET $5');
      expect(callArg.values).toEqual([mockRuleId, mockTenantId, 'test-category', 5, 10]);
    });

    it('should parse string old_data and new_data', async () => {
      const mockRows = [
        {
          id: 1,
          created_by: 'user-123',
          tenant_id: 'tenant-456',
          rule_id: 'rule-123',
          old_data: '{"status":"old"}',
          new_data: '{"status":"new"}',
          description: 'Test log',
          category: 'test',
          created_by_email: 'user@test.com',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ];

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockRows,
        rowCount: 1,
      });

      const result = await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
      });

      expect(result[0].old_data).toEqual({ status: 'old' });
      expect(result[0].new_data).toEqual({ status: 'new' });
    });

    it('should handle object old_data and new_data', async () => {
      const mockRows = [
        {
          id: 1,
          created_by: 'user-123',
          tenant_id: 'tenant-456',
          rule_id: 'rule-123',
          old_data: { status: 'old' },
          new_data: { status: 'new' },
          description: 'Test log',
          category: 'test',
          created_by_email: 'user@test.com',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ];

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockRows,
        rowCount: 1,
      });

      const result = await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
      });

      expect(result[0].old_data).toEqual({ status: 'old' });
      expect(result[0].new_data).toEqual({ status: 'new' });
    });

    it('should convert created_at and updated_at to Date objects', async () => {
      const mockRows = [
        {
          id: 1,
          created_by: 'user-123',
          tenant_id: 'tenant-456',
          rule_id: 'rule-123',
          old_data: { field: 'old' },
          new_data: { field: 'new' },
          description: 'Test log',
          category: 'test',
          created_by_email: 'user@test.com',
          created_at: '2026-05-06T10:30:00.000Z',
          updated_at: '2026-05-06T11:30:00.000Z',
        },
      ];

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockRows,
        rowCount: 1,
      });

      const result = await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
      });

      expect(result[0].created_at).toBeInstanceOf(Date);
      expect(result[0].updated_at).toBeInstanceOf(Date);
      expect(result[0].created_at.toISOString()).toBe('2026-05-06T10:30:00.000Z');
      expect(result[0].updated_at.toISOString()).toBe('2026-05-06T11:30:00.000Z');
    });

    it('should return empty array when no logs found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
      });

      expect(result).toEqual([]);
    });

    it('should select all required columns', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await getSimulationLogsFromDb({
        ruleId: mockRuleId,
        tenantId: mockTenantId,
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('SELECT id');
      expect(callArg.text).toContain('created_by');
      expect(callArg.text).toContain('tenant_id');
      expect(callArg.text).toContain('rule_id');
      expect(callArg.text).toContain('old_data');
      expect(callArg.text).toContain('new_data');
      expect(callArg.text).toContain('description');
      expect(callArg.text).toContain('category');
      expect(callArg.text).toContain('created_by_email');
      expect(callArg.text).toContain('FROM simulation_logs');
    });
  });

  describe('createSimulationLogsInDb', () => {
    it('should create simulation log with all parameters', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      });

      await createSimulationLogsInDb(
        'user-123',
        'tenant-456',
        '789',
        { field: 'old' },
        { field: 'new' },
        'Test description',
        'test-category',
        'user@test.com',
      );

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('INSERT INTO simulation_logs'),
          values: [
            'user-123',
            'tenant-456',
            789,
            JSON.stringify({ field: 'old' }),
            JSON.stringify({ field: 'new' }),
            'test-category',
            'Test description',
            'user@test.com',
          ],
        }),
        'configuration',
      );
    });

    it('should create simulation log without createdByEmail', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      });

      await createSimulationLogsInDb(
        'user-123',
        'tenant-456',
        '789',
        { field: 'old' },
        { field: 'new' },
        'Test description',
        'test-category',
      );

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: [
            'user-123',
            'tenant-456',
            789,
            JSON.stringify({ field: 'old' }),
            JSON.stringify({ field: 'new' }),
            'test-category',
            'Test description',
            undefined,
          ],
        }),
        'configuration',
      );
    });

    it('should stringify old_data and new_data', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      });

      const oldData = { status: 'old', count: 1 };
      const newData = { status: 'new', count: 2 };

      await createSimulationLogsInDb(
        'user-123',
        'tenant-456',
        'rule-789',
        oldData,
        newData,
        'Test description',
        'test-category',
        'user@test.com',
      );

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values[3]).toBe(JSON.stringify(oldData));
      expect(callArg.values[4]).toBe(JSON.stringify(newData));
    });

    it('should parse ruleId to integer', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      });

      await createSimulationLogsInDb(
        'user-123',
        'tenant-456',
        '12345',
        { field: 'old' },
        { field: 'new' },
        'Test description',
        'test-category',
        'user@test.com',
      );

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values[2]).toBe(12345);
      expect(typeof callArg.values[2]).toBe('number');
    });

    it('should include NOW() for timestamps', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      });

      await createSimulationLogsInDb(
        'user-123',
        'tenant-456',
        '789',
        { field: 'old' },
        { field: 'new' },
        'Test description',
        'test-category',
        'user@test.com',
      );

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('NOW()');
    });

    it('should include all columns in INSERT', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      });

      await createSimulationLogsInDb(
        'user-123',
        'tenant-456',
        '789',
        { field: 'old' },
        { field: 'new' },
        'Test description',
        'test-category',
        'user@test.com',
      );

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('created_by');
      expect(callArg.text).toContain('tenant_id');
      expect(callArg.text).toContain('rule_id');
      expect(callArg.text).toContain('old_data');
      expect(callArg.text).toContain('new_data');
      expect(callArg.text).toContain('category');
      expect(callArg.text).toContain('description');
      expect(callArg.text).toContain('created_by_email');
      expect(callArg.text).toContain('created_at');
      expect(callArg.text).toContain('updated_at');
    });

    it('should include RETURNING clause', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      });

      await createSimulationLogsInDb(
        'user-123',
        'tenant-456',
        '789',
        { field: 'old' },
        { field: 'new' },
        'Test description',
        'test-category',
        'user@test.com',
      );

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('RETURNING');
      expect(callArg.text).toContain('id');
    });

    it('should use correct database schema', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      });

      await createSimulationLogsInDb(
        'user-123',
        'tenant-456',
        '789',
        { field: 'old' },
        { field: 'new' },
        'Test description',
        'test-category',
        'user@test.com',
      );

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.anything(), 'configuration');
    });

    it('should handle complex data objects', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      });

      const complexOldData = {
        nested: { data: { structure: 'value' } },
        array: [1, 2, 3],
        boolean: true,
      };
      const complexNewData = {
        nested: { data: { structure: 'updated' } },
        array: [4, 5, 6],
        boolean: false,
      };

      await createSimulationLogsInDb(
        'user-123',
        'tenant-456',
        '789',
        complexOldData,
        complexNewData,
        'Complex data update',
        'test-category',
        'user@test.com',
      );

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values[3]).toBe(JSON.stringify(complexOldData));
      expect(callArg.values[4]).toBe(JSON.stringify(complexNewData));
    });

    it('should use first 8 values only in query parameters', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      });

      await createSimulationLogsInDb(
        'user-123',
        'tenant-456',
        '789',
        { field: 'old' },
        { field: 'new' },
        'Test description',
        'test-category',
        'user@test.com',
      );

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values).toHaveLength(8);
    });
  });

  describe('fetchSimulationItemsFromTable', () => {
    it('should fetch rows and map all fields correctly', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ payload: { key: 'val' }, endpointPath: '/ep', credttm: '2026-01-01', tenantId: 'tenant-1', msgid: 'msg-1' }],
        rowCount: 1,
      });

      const result = await fetchSimulationItemsFromTable('sim001');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        payload: { key: 'val' },
        endpointPath: '/ep',
        credttm: '2026-01-01',
        tenantId: 'tenant-1',
        msgid: 'msg-1',
      });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.objectContaining({ values: [] }), 'simulation');
    });

    it('should return empty array when table has no rows', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await fetchSimulationItemsFromTable('sim002');
      expect(result).toEqual([]);
    });

    it('should handle null optional fields in rows', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ payload: {}, endpointPath: null, credttm: null, tenantId: null, msgid: null }],
        rowCount: 1,
      });
      const result = await fetchSimulationItemsFromTable('sim003');
      expect(result[0].endpointPath).toBeNull();
      expect(result[0].tenantId).toBeNull();
    });
  });

  describe('getSimulationMessagesFromDb', () => {
    it('should return mapped payload rows', async () => {
      const mockMessage = { id: 'msg-1', data: 'test' };
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ payload: mockMessage }], rowCount: 1 });

      const result = await getSimulationMessagesFromDb('tenant-1', 'sim001');

      expect(result).toEqual([mockMessage]);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.objectContaining({ values: ['tenant-1'] }), 'simulation');
    });

    it('should return empty array when no messages found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await getSimulationMessagesFromDb('tenant-1', 'sim002');
      expect(result).toEqual([]);
    });
  });

  describe('fetchCountFromDlh', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      global.fetch = jest.fn() as jest.Mock;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should throw when DLH_URL is not set', async () => {
      delete process.env.DLH_URL;
      await expect(fetchCountFromDlh([], 'token')).rejects.toThrow('DLH endpoint is not defined');
    });

    it('should throw when response is not ok', async () => {
      process.env.DLH_URL = 'http://dlh.test';
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, statusText: 'Bad Gateway' });
      await expect(fetchCountFromDlh([], 'token')).rejects.toThrow('Failed to fetch count from DLH: Bad Gateway');
    });

    it('should sum row_count values from results', async () => {
      process.env.DLH_URL = 'http://dlh.test';
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ row_count: 10 }, { row_count: 5 }] }),
      });
      const result = await fetchCountFromDlh([{ txtp: 'pacs.002' }], 'token-abc');
      expect(result).toEqual({ rowCount: 15 });
      expect(global.fetch).toHaveBeenCalledWith(
        'http://dlh.test/count',
        expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }) }),
      );
    });

    it('should return rowCount 0 when results array is missing', async () => {
      process.env.DLH_URL = 'http://dlh.test';
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
      const result = await fetchCountFromDlh([], 'token');
      expect(result).toEqual({ rowCount: 0 });
    });

    it('should treat missing row_count as 0', async () => {
      process.env.DLH_URL = 'http://dlh.test';
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ results: [{}] }) });
      const result = await fetchCountFromDlh([], 'token');
      expect(result).toEqual({ rowCount: 0 });
    });
  });

  describe('stageItemsInSimTable', () => {
    it('should return null tableName when items array is empty', async () => {
      const result = await stageItemsInSimTable([]);
      expect(result).toEqual({ tableName: null });
      expect(mockHandlePostExecuteSqlStatement).not.toHaveBeenCalled();
    });

    it('should create table and insert items returning next table name', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await stageItemsInSimTable([{ _credttm: '2026-01-01', _tenantId: 'tenant-1', _msgid: 'msg-1', endpointPath: '/ep' }]);

      expect(result).toEqual({ tableName: 'sim003' });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledTimes(3);
    });

    it('should use null for non-string optional fields', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await stageItemsInSimTable([{ data: 'only-payload' }]);

      const insertCall = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[2][0] as { values: unknown[] };
      expect(insertCall.values[1]).toBeNull();
      expect(insertCall.values[2]).toBeNull();
      expect(insertCall.values[3]).toBeNull();
      expect(insertCall.values[4]).toBeNull();
    });

    it('should insert multiple items in a single statement', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await stageItemsInSimTable([{ foo: 'a' }, { foo: 'b' }]);

      const insertCall = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[2][0] as { values: unknown[] };
      expect(insertCall.values).toHaveLength(10);
    });

    it('should default tableCount to 0 when COUNT returns no rows', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await stageItemsInSimTable([{ foo: 'x' }]);
      expect(result).toEqual({ tableName: 'sim001' });
    });
  });

  describe('truncateEvaluationResultsInDb', () => {
    it('should execute TRUNCATE TABLE evaluation', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      await truncateEvaluationResultsInDb();

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'TRUNCATE TABLE evaluation;', values: [] }),
        'evaluation',
      );
    });

    it('should propagate errors from the database', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('DB error'));
      await expect(truncateEvaluationResultsInDb()).rejects.toThrow('DB error');
    });
  });

  describe('saveRecordInTrsSimulationInDb', () => {
    it('should insert or update a simulation record', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 1 });

      await saveRecordInTrsSimulationInDb({
        simulationId: 'sim-123',
        totalRecord: 100,
        recordProcessed: 50,
        simStatus: 'running',
        tenantId: 'tenant-1',
      });

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('INSERT INTO trs_simulation'),
          values: ['sim-123', 100, 50, 'running', 'tenant-1'],
        }),
        'configuration',
      );
    });

    it('should handle undefined simulationId', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 1 });

      await saveRecordInTrsSimulationInDb({
        simulationId: undefined,
        totalRecord: 10,
        recordProcessed: 10,
        simStatus: 'completed',
        tenantId: 'tenant-2',
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values[0]).toBeUndefined();
    });

    it('should include ON CONFLICT clause', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 1 });

      await saveRecordInTrsSimulationInDb({
        simulationId: 'sim-xyz',
        totalRecord: 5,
        recordProcessed: 5,
        simStatus: 'completed',
        tenantId: 'tenant-3',
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('ON CONFLICT');
    });

    it('should propagate errors from the database', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Insert failed'));
      await expect(
        saveRecordInTrsSimulationInDb({
          simulationId: 'sim-err',
          totalRecord: 1,
          recordProcessed: 0,
          simStatus: 'failed',
          tenantId: 'tenant-4',
        }),
      ).rejects.toThrow('Insert failed');
    });
  });
});
