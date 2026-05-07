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

import {
  countMasksWithFiltersInDB,
  findMasksWithFiltersInDB,
  createMasking,
  findMaskByIdInDB,
  updateMaskingInDB,
} from '../../../src/repositories/configuration/masking.repository';

describe('Masking Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('countMasksWithFiltersInDB', () => {
    it('should return count with no where clause', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ count: '42' }],
        rowCount: 1,
      });

      const result = await countMasksWithFiltersInDB('', []);

      expect(result).toBe(42);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('SELECT COUNT(*)'),
          values: [],
        }),
        'configuration',
      );
    });

    it('should return count with status where clause', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ count: '5' }],
        rowCount: 1,
      });

      const result = await countMasksWithFiltersInDB('WHERE status = ANY($1)', [['STATUS_01_IN_PROGRESS']]);

      expect(result).toBe(5);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('WHERE status = ANY($1)'),
          values: [['STATUS_01_IN_PROGRESS']],
        }),
        'configuration',
      );
    });

    it('should return 0 when count is null or invalid', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ count: 'invalid' }],
        rowCount: 1,
      });

      const result = await countMasksWithFiltersInDB('', []);

      expect(result).toBe(0);
    });

    it('should return 0 when count is 0', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ count: '0' }],
        rowCount: 1,
      });

      const result = await countMasksWithFiltersInDB('WHERE txtp ILIKE $1', ['%pain%']);

      expect(result).toBe(0);
    });
  });

  describe('findMasksWithFiltersInDB', () => {
    const mockRows = [
      {
        id: 'uuid-1',
        tenant_id: 'DEFAULT',
        txtp: 'pain.001.001.11',
        txtp_version: '11',
        status: 'STATUS_01_IN_PROGRESS',
        fields_masked: 3,
        total_fields: 10,
        comments: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ];

    it('should return masks with no where clause, default DESC sort', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockRows,
        rowCount: 1,
      });

      const result = await findMasksWithFiltersInDB('', 1, [10, 0]);

      expect(result).toEqual({ result: mockRows });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('ORDER BY updated_at DESC'),
          values: [10, 0],
        }),
        'configuration',
      );
    });

    it('should apply ASC sort order', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockRows,
        rowCount: 1,
      });

      await findMasksWithFiltersInDB('', 1, [10, 0], 'ASC');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('ORDER BY updated_at ASC'),
        }),
        'configuration',
      );
    });

    it('should apply DESC sort order explicitly', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockRows,
        rowCount: 1,
      });

      await findMasksWithFiltersInDB('', 1, [10, 0], 'DESC');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('ORDER BY updated_at DESC'),
        }),
        'configuration',
      );
    });

    it('should include where clause in query', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await findMasksWithFiltersInDB('WHERE status = ANY($1) AND txtp ILIKE $2', 3, [
        ['STATUS_01_IN_PROGRESS'],
        '%pain%',
        10,
        0,
      ]);

      expect(result).toEqual({ result: [] });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('WHERE status = ANY($1) AND txtp ILIKE $2'),
          text: expect.stringContaining('LIMIT $3 OFFSET $4'),
          values: [['STATUS_01_IN_PROGRESS'], '%pain%', 10, 0],
        }),
        'configuration',
      );
    });

    it('should select all expected columns', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockRows,
        rowCount: 1,
      });

      await findMasksWithFiltersInDB('', 1, [10, 0]);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('id');
      expect(callArg.text).toContain('tenant_id');
      expect(callArg.text).toContain('txtp');
      expect(callArg.text).toContain('txtp_version');
      expect(callArg.text).toContain('status');
      expect(callArg.text).toContain('fields_masked');
      expect(callArg.text).toContain('total_fields');
      expect(callArg.text).toContain('comments');
      expect(callArg.text).toContain('created_at');
      expect(callArg.text).toContain('updated_at');
      expect(callArg.text).toContain('FROM trs_masking');
    });

    it('should use correct paramIndex for LIMIT and OFFSET', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await findMasksWithFiltersInDB('WHERE status = ANY($1)', 2, [['STATUS_01_IN_PROGRESS'], 5, 10]);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('LIMIT $2 OFFSET $3'),
        }),
        'configuration',
      );
    });
  });

  describe('createMasking', () => {
    it('should successfully create masking configuration with valid data', async () => {
      const mockMaskingData = {
        tenant_id: 'DEFAULT',
        txtp: 'pain.001.001.11',
        txtp_version: '11',
      };

      const mockInsertedId = 123;

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: mockInsertedId }],
        rowCount: 1,
      });

      const result = await createMasking(mockMaskingData);

      expect(result).toBe(mockInsertedId);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['DEFAULT', 'pain.001.001.11', '11'],
        }),
        'configuration',
      );
      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('INSERT INTO trs_masking');
      expect(callArg.text).toContain('RETURNING id');
    });

    it('should throw error when invalid columns are provided', async () => {
      const mockInvalidData = {
        tenant_id: 'DEFAULT',
        txtp: 'pain.001.001.11',
        invalid_column: 'some_value',
      };

      await expect(createMasking(mockInvalidData)).rejects.toThrow(/Invalid field\(s\) for trs_masking insert/);
    });

    it('should throw error when no ID is returned after insert', async () => {
      const mockMaskingData = {
        tenant_id: 'DEFAULT',
        txtp: 'pain.001.001.11',
        txtp_version: '11',
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(createMasking(mockMaskingData)).rejects.toThrow('Failed to insert masking configuration: No ID returned.');
    });

    it('should throw error when database operation fails', async () => {
      const mockMaskingData = {
        tenant_id: 'DEFAULT',
        txtp: 'pain.001.001.11',
      };

      const dbError = new Error('Database connection failed');
      mockHandlePostExecuteSqlStatement.mockRejectedValue(dbError);

      await expect(createMasking(mockMaskingData)).rejects.toThrow(/Failed to create masking configuration/);
    });

    it('should construct correct placeholders for multiple columns', async () => {
      const mockMaskingData = {
        tenant_id: 'DEFAULT',
        txtp: 'pain.001.001.11',
        txtp_version: '11',
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      });

      await createMasking(mockMaskingData);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('$1');
      expect(callArg.text).toContain('$2');
      expect(callArg.text).toContain('$3');
    });
  });

  describe('findMaskByIdInDB', () => {
    const mockMaskData = {
      id: 123,
      tenant_id: 'DEFAULT',
      txtp: 'pain.001.001.11',
      txtp_version: '11',
      tokenize: false,
      status: 'STATUS_01_IN_PROGRESS',
      fields_masked: 3,
      total_fields: 10,
      comments: 'Test comment',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };

    it('should return masking configuration when found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockMaskData],
        rowCount: 1,
      });

      const result = await findMaskByIdInDB(123, 'DEFAULT');

      expect(result).toEqual(mockMaskData);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('WHERE id = $1 AND tenant_id = $2'),
          values: [123, 'DEFAULT'],
        }),
        'configuration',
      );
    });

    it('should return null when masking configuration not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await findMaskByIdInDB(999, 'DEFAULT');

      expect(result).toBeNull();
    });

    it('should select all expected columns including tokenize', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockMaskData],
        rowCount: 1,
      });

      await findMaskByIdInDB(123, 'DEFAULT');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('tokenize');
      expect(callArg.text).toContain('id');
      expect(callArg.text).toContain('tenant_id');
      expect(callArg.text).toContain('txtp');
      expect(callArg.text).toContain('FROM trs_masking');
    });

    it('should handle different tenant_id correctly', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await findMaskByIdInDB(123, 'DIFFERENT_TENANT');

      expect(result).toBeNull();
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: [123, 'DIFFERENT_TENANT'],
        }),
        'configuration',
      );
    });
  });

  describe('updateMaskingInDB', () => {
    const mockUpdatedData = {
      id: 123,
      tenant_id: 'DEFAULT',
      txtp: 'pain.001.001.11',
      txtp_version: '11',
      tokenize: true,
      status: 'STATUS_02_COMPLETED',
      fields_masked: 5,
      total_fields: 10,
      comments: 'Updated comment',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    };

    it('should successfully update masking configuration with valid fields', async () => {
      const updateData = {
        status: 'STATUS_02_COMPLETED',
        fields_masked: 5,
        comments: 'Updated comment',
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedData],
        rowCount: 1,
      });

      const result = await updateMaskingInDB(123, 'DEFAULT', updateData);

      expect(result).toEqual(mockUpdatedData);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['STATUS_02_COMPLETED', 5, 'Updated comment', 123, 'DEFAULT'],
        }),
        'configuration',
      );
      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('UPDATE trs_masking');
      expect(callArg.text).toContain('SET');
      expect(callArg.text).toContain('WHERE id = $4 AND tenant_id = $5');
    });

    it('should include updated_at = NOW() in SET clause', async () => {
      const updateData = {
        status: 'STATUS_02_COMPLETED',
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedData],
        rowCount: 1,
      });

      await updateMaskingInDB(123, 'DEFAULT', updateData);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('updated_at = NOW()');
    });

    it('should throw error when no valid fields provided for update', async () => {
      const updateData = {
        invalid_field: 'some_value',
        another_invalid: 'another_value',
      };

      await expect(updateMaskingInDB(123, 'DEFAULT', updateData)).rejects.toThrow('No valid fields provided for update');
    });

    it('should throw error when masking configuration not found', async () => {
      const updateData = {
        status: 'STATUS_02_COMPLETED',
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await expect(updateMaskingInDB(999, 'DEFAULT', updateData)).rejects.toThrow('Masking configuration with id 999 not found');
    });

    it('should filter out invalid fields and update only valid ones', async () => {
      const updateData = {
        status: 'STATUS_02_COMPLETED',
        fields_masked: 8,
        invalid_field: 'some_value',
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedData],
        rowCount: 1,
      });

      await updateMaskingInDB(123, 'DEFAULT', updateData);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.values).toEqual(['STATUS_02_COMPLETED', 8, 123, 'DEFAULT']);
      expect(callArg.text).toContain('status = $1');
      expect(callArg.text).toContain('fields_masked = $2');
      expect(callArg.text).not.toContain('invalid_field');
    });

    it('should update all allowed fields when provided', async () => {
      const updateData = {
        txtp: 'pain.002.001.11',
        txtp_version: '12',
        tokenize: true,
        status: 'STATUS_02_COMPLETED',
        fields_masked: 10,
        total_fields: 10,
        comments: 'All fields updated',
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedData],
        rowCount: 1,
      });

      await updateMaskingInDB(123, 'DEFAULT', updateData);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values).toHaveLength(9);
      expect(callArg.values[7]).toBe(123);
      expect(callArg.values[8]).toBe('DEFAULT');
    });

    it('should return all columns in RETURNING clause', async () => {
      const updateData = {
        status: 'STATUS_02_COMPLETED',
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedData],
        rowCount: 1,
      });

      await updateMaskingInDB(123, 'DEFAULT', updateData);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('RETURNING');
      expect(callArg.text).toContain('id');
      expect(callArg.text).toContain('tenant_id');
      expect(callArg.text).toContain('txtp');
      expect(callArg.text).toContain('tokenize');
      expect(callArg.text).toContain('created_at');
      expect(callArg.text).toContain('updated_at');
    });
  });
});
