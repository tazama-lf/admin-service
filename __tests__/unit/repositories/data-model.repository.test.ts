// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

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

import { getDataModelJson, upsertDataModelJson } from '../../../src/repositories/configuration/data-model.repository';

describe('Data Model Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDataModelJson', () => {
    const mockDataModelJson = {
      version: '1.0',
      fields: { name: 'string', amount: 'number' },
    };

    it('should return data_model_json when record is found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ data_model_json: mockDataModelJson }],
        rowCount: 1,
      });

      const result = await getDataModelJson('tenant-123');

      expect(result).toEqual(mockDataModelJson);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('SELECT data_model_json'),
          values: ['tenant-123'],
        }),
        'configuration',
      );
    });

    it('should return null when no record is found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await getDataModelJson('unknown-tenant');

      expect(result).toBeNull();
    });

    it('should query tazama_data_model_json table with case-insensitive tenant_id match', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ data_model_json: mockDataModelJson }],
        rowCount: 1,
      });

      await getDataModelJson('TENANT-123');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('tazama_data_model_json');
      expect(callArg.text).toContain('LOWER(tenant_id) = LOWER($1)');
    });

    it('should use the configuration database', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ data_model_json: mockDataModelJson }],
        rowCount: 1,
      });

      await getDataModelJson('tenant-123');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.anything(), 'configuration');
    });

    it('should return null for empty tenant_id when no match', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await getDataModelJson('');

      expect(result).toBeNull();
    });
  });

  describe('upsertDataModelJson', () => {
    const mockDataModelJson = {
      version: '2.0',
      fields: { id: 'string', value: 'number' },
    };

    const mockReturnRow = {
      tenant_id: 'tenant-123',
      updated_at: '2026-05-07T12:00:00.000Z',
    };

    it('should upsert and return tenant_id and updated_at on success', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockReturnRow],
        rowCount: 1,
      });

      const result = await upsertDataModelJson('tenant-123', mockDataModelJson);

      expect(result).toEqual(mockReturnRow);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['tenant-123', JSON.stringify(mockDataModelJson)],
        }),
        'configuration',
      );
    });

    it('should use INSERT ... ON CONFLICT ... DO UPDATE SET pattern', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockReturnRow],
        rowCount: 1,
      });

      await upsertDataModelJson('tenant-123', mockDataModelJson);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('INSERT INTO tazama_data_model_json');
      expect(callArg.text).toContain('ON CONFLICT (tenant_id)');
      expect(callArg.text).toContain('DO UPDATE SET');
      expect(callArg.text).toContain('RETURNING tenant_id, updated_at');
    });

    it('should serialize dataModelJson as JSON string in the query values', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockReturnRow],
        rowCount: 1,
      });

      const data = { key: 'value', nested: { a: 1 } };
      await upsertDataModelJson('tenant-123', data);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['tenant-123', JSON.stringify(data)],
        }),
        'configuration',
      );
    });

    it('should cast dataModelJson to jsonb in the query', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockReturnRow],
        rowCount: 1,
      });

      await upsertDataModelJson('tenant-123', mockDataModelJson);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('$2::jsonb');
    });

    it('should throw an error when no rows are returned', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(upsertDataModelJson('tenant-123', mockDataModelJson)).rejects.toThrow('Failed to upsert data model JSON');
    });

    it('should use the configuration database', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockReturnRow],
        rowCount: 1,
      });

      await upsertDataModelJson('tenant-123', mockDataModelJson);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.anything(), 'configuration');
    });

    it('should set created_at and updated_at to NOW() on insert', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockReturnRow],
        rowCount: 1,
      });

      await upsertDataModelJson('tenant-123', mockDataModelJson);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('NOW()');
    });

    it('should update updated_at on conflict', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockReturnRow],
        rowCount: 1,
      });

      await upsertDataModelJson('existing-tenant', mockDataModelJson);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('updated_at = NOW()');
    });

    it('should handle empty data model JSON object', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ tenant_id: 'tenant-123', updated_at: '2026-05-07T12:00:00.000Z' }],
        rowCount: 1,
      });

      const result = await upsertDataModelJson('tenant-123', {});

      expect(result).toEqual({ tenant_id: 'tenant-123', updated_at: '2026-05-07T12:00:00.000Z' });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({ values: ['tenant-123', '{}'] }),
        'configuration',
      );
    });
  });
});
