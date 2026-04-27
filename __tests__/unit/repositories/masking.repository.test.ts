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

import { countMasksWithFiltersInDB, findMasksWithFiltersInDB } from '../../../src/repositories/configuration/masking.repository';

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
});
