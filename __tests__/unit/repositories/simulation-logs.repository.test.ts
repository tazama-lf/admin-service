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

import { getSimulationLogsFromDb, createSimulationLogsInDb } from '../../../src/repositories/configuration/simulation-logs.repository';

const createSimulationLogsLegacy = async (
  userId: string,
  tenantId: string,
  ruleId: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  description: string,
  category: string,
  createdByEmail?: string,
) =>
  createSimulationLogsInDb({
    userId,
    tenantId,
    ruleId,
    oldData,
    newData,
    description,
    category,
    createdByEmail,
  });

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

    it('should reflect undefined sort field for invalid sortBy input', async () => {
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
      expect(callArg.text).toContain('ORDER BY created_at DESC');
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

      await createSimulationLogsLegacy(
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

      await createSimulationLogsLegacy(
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

      await createSimulationLogsLegacy(
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

      await createSimulationLogsLegacy(
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

      await createSimulationLogsLegacy(
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

      await createSimulationLogsLegacy(
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

      await createSimulationLogsLegacy(
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

      await createSimulationLogsLegacy(
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

      await createSimulationLogsLegacy(
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

      await createSimulationLogsLegacy(
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
});
