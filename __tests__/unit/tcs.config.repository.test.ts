// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: jest.fn(),
}));

import { getRelatedTransactions } from '../../src/repositories/configuration/tcs.config.repository';
import { handlePostExecuteSqlStatement } from '../../src/services/database.logic.service';

const mockHandlePostExecuteSqlStatement = handlePostExecuteSqlStatement as jest.MockedFunction<typeof handlePostExecuteSqlStatement>;

describe('TCS Config Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRelatedTransactions', () => {
    const mockTenantId = 'tenant-123';

    it('should return all rows as-is since deduplication is handled by database DISTINCT clause', async () => {
      // Since the query uses DISTINCT, the database should not return duplicates
      // This test verifies that the function correctly maps whatever the database returns
      const mockRows = [
        { related_transaction: 'transaction-001' },
        { related_transaction: 'transaction-002' },
        { related_transaction: 'transaction-003' },
        { related_transaction: 'transaction-004' },
      ];

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockRows,
        rowCount: mockRows.length,
      } as never);

      const result = await getRelatedTransactions(mockTenantId);

      // Verify the query was called correctly with DISTINCT clause
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: expect.stringContaining('SELECT DISTINCT related_transaction'),
          values: [mockTenantId],
        },
        'configuration',
      );

      // Verify the function correctly maps the database results
      expect(result).toEqual(['transaction-001', 'transaction-002', 'transaction-003', 'transaction-004']);

      expect(result).toHaveLength(4);
    });

    it('should return empty array when no related transactions exist', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as never);

      const result = await getRelatedTransactions(mockTenantId);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: expect.stringContaining('SELECT DISTINCT related_transaction'),
          values: [mockTenantId],
        },
        'configuration',
      );

      expect(result).toEqual([]);
    });

    it('should handle single transaction without duplicates', async () => {
      const mockSingleRow = [{ related_transaction: 'transaction-001' }];

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockSingleRow,
        rowCount: 1,
      } as never);

      const result = await getRelatedTransactions(mockTenantId);

      expect(result).toEqual(['transaction-001']);
    });

    it('should use correct SQL query with proper parameters', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as never);

      await getRelatedTransactions(mockTenantId);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: expect.stringMatching(
            /SELECT DISTINCT related_transaction\s+FROM tcs_config\s+WHERE tenant_id = \$1\s+AND related_transaction IS NOT NULL/,
          ),
          values: [mockTenantId],
        },
        'configuration',
      );
    });

    it('should verify DISTINCT clause prevents duplicates at database level', async () => {
      // This test confirms that the function relies on database DISTINCT
      // In practice, the database should not return duplicates due to DISTINCT clause
      const mockUniqueRows = [
        { related_transaction: 'alpha-transaction' },
        { related_transaction: 'beta-transaction' },
        { related_transaction: 'zebra-transaction' },
      ];

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockUniqueRows,
        rowCount: mockUniqueRows.length,
      } as never);

      const result = await getRelatedTransactions(mockTenantId);

      // The function should return results in the order the database provides them
      expect(result).toEqual(['alpha-transaction', 'beta-transaction', 'zebra-transaction']);

      // Verify the query includes DISTINCT clause for deduplication
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringMatching(/SELECT DISTINCT related_transaction/),
        }),
        'configuration',
      );
    });

    it('should pass through duplicates if database returns them despite DISTINCT clause', async () => {
      // Edge case: if database somehow returns duplicates (bug, corrupted data, etc.)
      // This test documents the current behavior - the function does not deduplicate in JavaScript
      const mockDuplicateRows = [
        { related_transaction: 'transaction-001' },
        { related_transaction: 'transaction-002' },
        { related_transaction: 'transaction-001' }, // Duplicate
        { related_transaction: 'transaction-003' },
      ];

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockDuplicateRows,
        rowCount: mockDuplicateRows.length,
      } as never);

      const result = await getRelatedTransactions(mockTenantId);

      // Current implementation passes through whatever the database returns
      expect(result).toEqual([
        'transaction-001',
        'transaction-002',
        'transaction-001', // Duplicate preserved
        'transaction-003',
      ]);

      // This documents that JavaScript-level deduplication is NOT implemented
      // Relies entirely on database DISTINCT clause
      expect(result).toHaveLength(4); // Not deduplicated
    });
  });
});
