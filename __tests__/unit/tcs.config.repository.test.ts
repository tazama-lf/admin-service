// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: jest.fn(),
}));

import {
  getRelatedTransactions,
  createConfig,
  findConfigById,
  findConfigsByStatus,
  updateConfig,
  findAllTransactionTypes,
  getPayloadByTransactionType,
  getSchemaByTransactionType,
  createTransactionTypeTable,
  createTazamaDataModelTable,
  updateConfigByStatus,
  findActiveConfigsByTuples,
} from '../../src/repositories/configuration/tcs.config.repository';
import { handlePostExecuteSqlStatement } from '../../src/services/database.logic.service';
import { ConfigStatus, ContentType } from '@tazama-lf/tcs-lib';

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

  describe('createConfig', () => {
    const mockConfigData = {
      msgFam: 'pain',
      transactionType: 'pain.001.001.11',
      endpointPath: '/api/pain001',
      version: '1.0',
      contentType: ContentType.JSON,
      schema: { type: 'object' },
      mapping: [{ field: 'value' }],
      functions: [{ name: 'func1' }],
      status: ConfigStatus.IN_PROGRESS,
      tenantId: 'tenant-123',
      createdBy: 'user-123',
      publishing_status: 'inactive',
      relatedTransaction: null,
      payload: { data: 'test' },
    };

    it('should create config without id', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      } as never);

      const result = await createConfig(mockConfigData);

      expect(result).toBe(1);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('INSERT INTO tcs_config'),
          values: expect.arrayContaining([mockConfigData.msgFam, mockConfigData.transactionType]),
        }),
        'configuration',
      );
      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).not.toContain('id, msg_fam');
    });

    it('should create config with specific id', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 99 }],
        rowCount: 1,
      } as never);

      const result = await createConfig(mockConfigData, 99);

      expect(result).toBe(99);
      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.values[0]).toBe(99);
    });

    it('should handle XML content type', async () => {
      const xmlConfig = {
        ...mockConfigData,
        contentType: ContentType.XML,
        payload: '<xml>test</xml>',
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 2 }],
        rowCount: 1,
      } as never);

      await createConfig(xmlConfig);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('payload_xml');
      expect(callArg.text).toContain('::xml');
    });

    it('should handle null mapping and functions', async () => {
      const configWithoutOptional = {
        ...mockConfigData,
        mapping: undefined,
        functions: undefined,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 3 }],
        rowCount: 1,
      } as never);

      await createConfig(configWithoutOptional);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values).toContain(null);
    });

    it('should stringify JSON fields', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 4 }],
        rowCount: 1,
      } as never);

      await createConfig(mockConfigData);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values).toContain(JSON.stringify(mockConfigData.schema));
    });

    it('should use default status, publishing_status and relatedTransaction when not provided (without id)', async () => {
      const configWithDefaults = {
        ...mockConfigData,
        status: undefined,
        publishing_status: undefined,
        relatedTransaction: undefined,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 10 }],
        rowCount: 1,
      } as never);

      await createConfig(configWithDefaults);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values).toContain(ConfigStatus.IN_PROGRESS);
      expect(callArg.values).toContain('inactive');
      expect(callArg.values).toContain(null);
    });

    it('should use default status, publishing_status and relatedTransaction when not provided (with id)', async () => {
      const configWithDefaults = {
        ...mockConfigData,
        status: undefined,
        publishing_status: undefined,
        relatedTransaction: undefined,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 50 }],
        rowCount: 1,
      } as never);

      await createConfig(configWithDefaults, 50);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values[0]).toBe(50);
      expect(callArg.values).toContain(ConfigStatus.IN_PROGRESS);
      expect(callArg.values).toContain('inactive');
      expect(callArg.values).toContain(null);
    });

    it('should handle XML content type with non-string payload', async () => {
      const xmlConfig = {
        ...mockConfigData,
        contentType: ContentType.XML,
        payload: { not: 'a string' },
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 11 }],
        rowCount: 1,
      } as never);

      await createConfig(xmlConfig);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values[callArg.values.length - 1]).toBeNull();
    });

    it('should handle non-XML content type with null payload', async () => {
      const jsonConfig = {
        ...mockConfigData,
        contentType: ContentType.JSON,
        payload: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 12 }],
        rowCount: 1,
      } as never);

      await createConfig(jsonConfig);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values[callArg.values.length - 1]).toBeNull();
    });
  });

  describe('findConfigById', () => {
    it('should find config by id and tenant', async () => {
      const mockRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.001.001.11',
        endpoint_path: '/api/pain001',
        version: '1.0',
        content_type: ContentType.JSON,
        schema: { type: 'object' },
        mapping: null,
        functions: null,
        status: ConfigStatus.IN_PROGRESS,
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        publishing_status: 'inactive',
        payload_xml: null,
        payload_json: { data: 'test' },
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        comments: null,
        related_transaction: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockRow],
        rowCount: 1,
      } as never);

      const result = await findConfigById(1, 'tenant-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe(1);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: [1, 'tenant-123'],
        }),
        'configuration',
      );
    });

    it('should return null when config not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as never);

      const result = await findConfigById(999, 'tenant-123');

      expect(result).toBeNull();
    });

    it('should parse JSON string schema', async () => {
      const mockRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.001.001.11',
        endpoint_path: '/api/pain001',
        version: '1.0',
        content_type: ContentType.JSON,
        schema: JSON.stringify({ type: 'object' }),
        mapping: null,
        functions: null,
        status: ConfigStatus.IN_PROGRESS,
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        publishing_status: 'inactive',
        payload_xml: null,
        payload_json: { data: 'test' },
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        comments: null,
        related_transaction: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockRow],
        rowCount: 1,
      } as never);

      const result = await findConfigById(1, 'tenant-123');

      expect(result?.schema).toEqual({ type: 'object' });
    });

    it('should parse JSON string mapping and functions', async () => {
      const mockRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.001.001.11',
        endpoint_path: '/api/pain001',
        version: '1.0',
        content_type: ContentType.JSON,
        schema: { type: 'object' },
        mapping: JSON.stringify([{ field: 'test' }]),
        functions: JSON.stringify([{ name: 'func1' }]),
        status: ConfigStatus.IN_PROGRESS,
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        publishing_status: 'inactive',
        payload_xml: null,
        payload_json: { data: 'test' },
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        comments: null,
        related_transaction: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockRow],
        rowCount: 1,
      } as never);

      const result = await findConfigById(1, 'tenant-123');

      expect(result?.mapping).toEqual([{ field: 'test' }]);
      expect(result?.functions).toEqual([{ name: 'func1' }]);
    });

    it('should handle XML content type and return payload_xml', async () => {
      const mockRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.001.001.11',
        endpoint_path: '/api/pain001',
        version: '1.0',
        content_type: ContentType.XML,
        schema: { type: 'object' },
        mapping: [{ field: 'test' }],
        functions: [{ name: 'func1' }],
        status: ConfigStatus.IN_PROGRESS,
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        publishing_status: 'inactive',
        payload_xml: '<xml>test</xml>',
        payload_json: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        comments: null,
        related_transaction: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockRow],
        rowCount: 1,
      } as never);

      const result = await findConfigById(1, 'tenant-123');

      expect(result?.payload).toBe('<xml>test</xml>');
      expect(result?.mapping).toEqual([{ field: 'test' }]);
      expect(result?.functions).toEqual([{ name: 'func1' }]);
    });
  });

  describe('findConfigsByStatus', () => {
    it('should find configs with status filter', async () => {
      const mockRows = [
        {
          id: 1,
          msg_fam: 'pain',
          transaction_type: 'pain.001.001.11',
          endpoint_path: '/api/pain001',
          version: '1.0',
          content_type: ContentType.JSON,
          schema: { type: 'object' },
          mapping: null,
          functions: null,
          status: ConfigStatus.IN_PROGRESS,
          tenant_id: 'tenant-123',
          created_by: 'user-123',
          publishing_status: 'inactive',
          payload_xml: null,
          payload_json: { data: 'test' },
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          comments: null,
          related_transaction: null,
        },
      ];

      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({
          rows: [{ total: '1' }],
          rowCount: 1,
        } as never)
        .mockResolvedValueOnce({
          rows: mockRows,
          rowCount: 1,
        } as never);

      const result = await findConfigsByStatus(10, 0, { status: ConfigStatus.IN_PROGRESS }, 'tenant-123');

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it('should find configs with multiple filters', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({
          rows: [{ total: '5' }],
          rowCount: 1,
        } as never)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        } as never);

      const result = await findConfigsByStatus(
        10,
        0,
        { status: ConfigStatus.IN_PROGRESS, endpointPath: 'pain', createdAt: '2026-01-01' },
        'tenant-123',
      );

      expect(result.total).toBe(5);
      const countCallArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(countCallArg.values).toContain('tenant-123');
    });

    it('should handle pagination', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({
          rows: [{ total: '50' }],
          rowCount: 1,
        } as never)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        } as never);

      await findConfigsByStatus(20, 40, {}, 'tenant-123');

      const dataCallArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[1][0] as { text: string; values: unknown[] };
      expect(dataCallArg.text).toContain('LIMIT');
      expect(dataCallArg.text).toContain('OFFSET');
      expect(dataCallArg.values).toContain(20);
      expect(dataCallArg.values).toContain(40);
    });

    it('should handle comma-separated status values', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({
          rows: [{ total: '3' }],
          rowCount: 1,
        } as never)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
        } as never);

      await findConfigsByStatus(10, 0, { status: 'STATUS_01_IN_PROGRESS,STATUS_02_COMPLETED' }, 'tenant-123');

      const countCallArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(countCallArg.values[1]).toEqual(['STATUS_01_IN_PROGRESS', 'STATUS_02_COMPLETED']);
    });
  });

  describe('updateConfig', () => {
    it('should update config fields', async () => {
      const mockUpdatedRow = {
        id: 1,
        msg_fam: 'pacs',
        transaction_type: 'pacs.008.001.08',
        endpoint_path: '/api/pacs008',
        version: '1.0',
        content_type: ContentType.JSON,
        schema: { type: 'object' },
        payload_xml: null,
        payload_json: { updated: true },
        comments: 'Updated',
        mapping: null,
        functions: null,
        status: ConfigStatus.APPROVED,
        publishing_status: 'active',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        related_transaction: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedRow],
        rowCount: 1,
      } as never);

      const result = await updateConfig(1, 'tenant-123', {
        msgFam: 'pacs',
        status: ConfigStatus.APPROVED,
      });

      expect(result.msgFam).toBe('pacs');
      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('UPDATE tcs_config');
      expect(callArg.text).toContain('updated_at = NOW()');
    });

    it('should throw error when no fields to update', async () => {
      await expect(updateConfig(1, 'tenant-123', {})).rejects.toThrow('No fields to update');
    });

    it('should throw error when config not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as never);

      await expect(updateConfig(999, 'tenant-123', { status: ConfigStatus.APPROVED })).rejects.toThrow('Configuration not found');
    });

    it('should handle XML payload update', async () => {
      const mockUpdatedRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.001.001.11',
        endpoint_path: '/api/pain001',
        version: '1.0',
        content_type: ContentType.XML,
        schema: { type: 'object' },
        payload_xml: '<xml>updated</xml>',
        payload_json: null,
        comments: null,
        mapping: null,
        functions: null,
        status: ConfigStatus.IN_PROGRESS,
        publishing_status: 'inactive',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        related_transaction: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedRow],
        rowCount: 1,
      } as never);

      await updateConfig(1, 'tenant-123', {
        contentType: ContentType.XML,
        payload: '<xml>updated</xml>',
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('payload_xml');
      expect(callArg.text).toContain('::xml');
    });

    it('should handle relatedTransaction update', async () => {
      const mockUpdatedRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.001.001.11',
        endpoint_path: '/api/pain001',
        version: '1.0',
        content_type: ContentType.JSON,
        schema: { type: 'object' },
        payload_xml: null,
        payload_json: { data: 'test' },
        comments: null,
        mapping: null,
        functions: null,
        status: ConfigStatus.IN_PROGRESS,
        publishing_status: 'inactive',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        related_transaction: 'rel-trans-123',
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedRow],
        rowCount: 1,
      } as never);

      await updateConfig(1, 'tenant-123', {
        relatedTransaction: 'rel-trans-123',
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('related_transaction');
      expect(callArg.values).toContain('rel-trans-123');
    });

    it('should handle mapping update', async () => {
      const mockUpdatedRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.001.001.11',
        endpoint_path: '/api/pain001',
        version: '1.0',
        content_type: ContentType.JSON,
        schema: { type: 'object' },
        payload_xml: null,
        payload_json: { data: 'test' },
        comments: null,
        mapping: [{ field: 'test' }],
        functions: null,
        status: ConfigStatus.IN_PROGRESS,
        publishing_status: 'inactive',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        related_transaction: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedRow],
        rowCount: 1,
      } as never);

      await updateConfig(1, 'tenant-123', {
        mapping: [{ field: 'test' }],
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('mapping = $1');
      expect(callArg.values[0]).toBe(JSON.stringify([{ field: 'test' }]));
    });

    it('should handle functions update', async () => {
      const mockUpdatedRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.001.001.11',
        endpoint_path: '/api/pain001',
        version: '1.0',
        content_type: ContentType.JSON,
        schema: { type: 'object' },
        payload_xml: null,
        payload_json: { data: 'test' },
        comments: null,
        mapping: null,
        functions: [{ name: 'func1' }],
        status: ConfigStatus.IN_PROGRESS,
        publishing_status: 'inactive',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        related_transaction: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedRow],
        rowCount: 1,
      } as never);

      await updateConfig(1, 'tenant-123', {
        functions: [{ name: 'func1' }],
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('functions = $1');
      expect(callArg.values[0]).toBe(JSON.stringify([{ name: 'func1' }]));
    });

    it('should handle publishing_status update', async () => {
      const mockUpdatedRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.001.001.11',
        endpoint_path: '/api/pain001',
        version: '1.0',
        content_type: ContentType.JSON,
        schema: { type: 'object' },
        payload_xml: null,
        payload_json: { data: 'test' },
        comments: null,
        mapping: null,
        functions: null,
        status: ConfigStatus.IN_PROGRESS,
        publishing_status: 'active',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        related_transaction: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedRow],
        rowCount: 1,
      } as never);

      await updateConfig(1, 'tenant-123', {
        publishing_status: 'active',
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('publishing_status = $1');
      expect(callArg.values[0]).toBe('active');
    });

    it('should handle related_transaction alias', async () => {
      const mockUpdatedRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.001.001.11',
        endpoint_path: '/api/pain001',
        version: '1.0',
        content_type: ContentType.JSON,
        schema: { type: 'object' },
        payload_xml: null,
        payload_json: { data: 'test' },
        comments: null,
        mapping: null,
        functions: null,
        status: ConfigStatus.IN_PROGRESS,
        publishing_status: 'inactive',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        related_transaction: 'alias-trans',
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedRow],
        rowCount: 1,
      } as never);

      await updateConfig(1, 'tenant-123', {
        related_transaction: 'alias-trans',
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('related_transaction');
      expect(callArg.values).toContain('alias-trans');
    });

    it('should handle JSON payload update with contentType change', async () => {
      const mockUpdatedRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.001.001.11',
        endpoint_path: '/api/pain001',
        version: '1.0',
        content_type: ContentType.JSON,
        schema: { type: 'object' },
        payload_xml: null,
        payload_json: { updated: true },
        comments: null,
        mapping: null,
        functions: null,
        status: ConfigStatus.IN_PROGRESS,
        publishing_status: 'inactive',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        related_transaction: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedRow],
        rowCount: 1,
      } as never);

      await updateConfig(1, 'tenant-123', {
        contentType: ContentType.JSON,
        payload: { updated: true },
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('payload_json');
      expect(callArg.text).toContain('payload_xml = NULL');
    });

    it('should handle payload update without contentType change', async () => {
      const mockUpdatedRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.001.001.11',
        endpoint_path: '/api/pain001',
        version: '1.0',
        content_type: ContentType.JSON,
        schema: { type: 'object' },
        payload_xml: null,
        payload_json: { standalone: true },
        comments: null,
        mapping: null,
        functions: null,
        status: ConfigStatus.IN_PROGRESS,
        publishing_status: 'inactive',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        related_transaction: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedRow],
        rowCount: 1,
      } as never);

      await updateConfig(1, 'tenant-123', {
        payload: { standalone: true },
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('payload_json');
      expect(callArg.text).toContain('SET payload_json = $1');
    });

    it('should handle schema update', async () => {
      const mockUpdatedRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.001.001.11',
        endpoint_path: '/api/pain001',
        version: '1.0',
        content_type: ContentType.JSON,
        schema: { type: 'string' },
        payload_xml: null,
        payload_json: { data: 'test' },
        comments: null,
        mapping: null,
        functions: null,
        status: ConfigStatus.IN_PROGRESS,
        publishing_status: 'inactive',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        related_transaction: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedRow],
        rowCount: 1,
      } as never);

      await updateConfig(1, 'tenant-123', {
        schema: { type: 'string' },
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('schema = $1');
      expect(callArg.values[0]).toBe(JSON.stringify({ type: 'string' }));
    });

    it('should handle comments update', async () => {
      const mockUpdatedRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.001.001.11',
        endpoint_path: '/api/pain001',
        version: '1.0',
        content_type: ContentType.JSON,
        schema: { type: 'object' },
        payload_xml: null,
        payload_json: { data: 'test' },
        comments: 'New comment',
        mapping: null,
        functions: null,
        status: ConfigStatus.IN_PROGRESS,
        publishing_status: 'inactive',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        related_transaction: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedRow],
        rowCount: 1,
      } as never);

      await updateConfig(1, 'tenant-123', {
        comments: 'New comment',
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('comments = $1');
      expect(callArg.values[0]).toBe('New comment');
    });

    it('should handle transactionType update', async () => {
      const mockUpdatedRow = {
        id: 1,
        msg_fam: 'pain',
        transaction_type: 'pain.002.001.11',
        endpoint_path: '/api/pain002',
        version: '1.0',
        content_type: ContentType.JSON,
        schema: { type: 'object' },
        payload_xml: null,
        payload_json: { data: 'test' },
        comments: null,
        mapping: null,
        functions: null,
        status: ConfigStatus.IN_PROGRESS,
        publishing_status: 'inactive',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
        tenant_id: 'tenant-123',
        created_by: 'user-123',
        related_transaction: null,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedRow],
        rowCount: 1,
      } as never);

      await updateConfig(1, 'tenant-123', {
        transactionType: 'pain.002.001.11',
      });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('transaction_type = $1');
      expect(callArg.values[0]).toBe('pain.002.001.11');
    });
  });

  describe('findAllTransactionTypes', () => {
    it('should return distinct transaction types', async () => {
      const mockRows = [
        { transaction_type: 'pain.001.001.11', endpoint_path: '/api/pain001' },
        { transaction_type: 'pacs.008.001.08', endpoint_path: '/api/pacs008' },
      ];

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: mockRows,
        rowCount: 2,
      } as never);

      const result = await findAllTransactionTypes('tenant-123');

      expect(result).toHaveLength(2);
      expect(result[0].transaction_type).toBe('pain.001.001.11');
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('SELECT DISTINCT transaction_type'),
          values: ['tenant-123'],
        }),
        'configuration',
      );
    });

    it('should filter by approved or exported status', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as never);

      await findAllTransactionTypes('tenant-123');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('STATUS_04_APPROVED');
      expect(callArg.text).toContain('STATUS_06_EXPORTED');
    });

    it('should return empty array when no transaction types found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as never);

      const result = await findAllTransactionTypes('tenant-123');

      expect(result).toEqual([]);
    });
  });

  describe('getPayloadByTransactionType', () => {
    it('should get JSON payload', async () => {
      const mockPayload = { data: 'test' };
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [
          {
            content_type: ContentType.JSON,
            payload_xml: null,
            payload_json: mockPayload,
          },
        ],
        rowCount: 1,
      } as never);

      const result = await getPayloadByTransactionType('pain.001.001.11', 'tenant-123', '1.0');

      expect(result).toEqual(mockPayload);
    });

    it('should get XML payload', async () => {
      const mockPayload = '<xml>test</xml>';
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [
          {
            content_type: ContentType.XML,
            payload_xml: mockPayload,
            payload_json: null,
          },
        ],
        rowCount: 1,
      } as never);

      const result = await getPayloadByTransactionType('pain.001.001.11', 'tenant-123', '1.0');

      expect(result).toBe(mockPayload);
    });

    it('should throw error when required parameters missing', async () => {
      await expect(getPayloadByTransactionType('', 'tenant-123', '1.0')).rejects.toThrow(
        'Transaction type, tenant ID, and version are required',
      );
    });

    it('should throw error when configuration not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as never);

      await expect(getPayloadByTransactionType('pain.001.001.11', 'tenant-123', '1.0')).rejects.toThrow('Configuration not found');
    });
  });

  describe('getSchemaByTransactionType', () => {
    it('should get schema with all fields', async () => {
      const mockResult = {
        schema: { type: 'object' },
        mapping: [{ field: 'value' }],
        content_type: ContentType.JSON,
        payload_xml: null,
        payload_json: { data: 'test' },
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockResult],
        rowCount: 1,
      } as never);

      const result = await getSchemaByTransactionType('pain.001.001.11', '1.0', 'tenant-123');

      expect(result.schema).toEqual({ type: 'object' });
      expect(result.content_type).toBe(ContentType.JSON);
    });

    it('should throw error when parameters missing', async () => {
      await expect(getSchemaByTransactionType('', '1.0', 'tenant-123')).rejects.toThrow(
        'Transaction type, version, and tenant ID are required',
      );
    });

    it('should throw error when configuration not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as never);

      await expect(getSchemaByTransactionType('pain.001.001.11', '1.0', 'tenant-123')).rejects.toThrow('Configuration not found');
    });
  });

  describe('createTransactionTypeTable', () => {
    it('should create table with safe name', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as never);

      await createTransactionTypeTable('pain.001.001.11');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('CREATE TABLE IF NOT EXISTS');
      expect(callArg.text).toContain('pain_001_001_11');
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.anything(), 'raw_history');
    });

    it('should replace special characters with underscores', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as never);

      await createTransactionTypeTable('test-table.name');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('test_table_name');
    });

    it('should include required columns', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as never);

      await createTransactionTypeTable('test_table');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('document JSONB');
      expect(callArg.text).toContain('creDtTm TEXT');
      expect(callArg.text).toContain('messageId TEXT');
      expect(callArg.text).toContain('tenantId TEXT');
    });
  });

  describe('createTazamaDataModelTable', () => {
    it('should create table with safe name', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as never);

      await createTazamaDataModelTable('tazama_model');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('CREATE TABLE IF NOT EXISTS');
      expect(callArg.text).toContain('tazama_model');
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.anything(), 'event_history');
    });

    it('should include required columns with primary key', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as never);

      await createTazamaDataModelTable('test_model');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('_key text PRIMARY KEY');
      expect(callArg.text).toContain('data jsonb NOT NULL');
      expect(callArg.text).toContain('tenantId text');
      expect(callArg.text).toContain('creDtTm text');
    });
  });

  describe('updateConfigByStatus', () => {
    it('should update config status', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      } as never);

      const result = await updateConfigByStatus('1', ConfigStatus.APPROVED, 'tenant-123');

      expect(result).toBe(1);
      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('UPDATE tcs_config');
      expect(callArg.text).toContain('SET status = $1, updated_at = NOW()');
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: [ConfigStatus.APPROVED, '1', 'tenant-123'],
        }),
        'configuration',
      );
    });

    it('should throw error when status is missing', async () => {
      await expect(updateConfigByStatus('1', '', 'tenant-123')).rejects.toThrow('Status is required and cannot be null or undefined');
    });

    it('should throw error when config not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as never);

      await expect(updateConfigByStatus('999', ConfigStatus.APPROVED, 'tenant-123')).rejects.toThrow('Configuration not found');
    });
  });

  describe('findActiveConfigsByTuples', () => {
    it('returns empty array when tuples is empty', async () => {
      const result = await findActiveConfigsByTuples([]);
      expect(result).toEqual([]);
      expect(handlePostExecuteSqlStatement).not.toHaveBeenCalled();
    });

    it('queries active configs matching provided tuples', async () => {
      const mockRows = [{ tenant_id: 'tenant-1', txtp: 'pacs.008', txtp_version: '001.08', endpoint_path: '/api' }];
      (handlePostExecuteSqlStatement as jest.Mock).mockResolvedValue({ rows: mockRows } as never);

      const result = await findActiveConfigsByTuples([
        { tenant_id: 'tenant-1', txtp: 'pacs.008', txtp_version: '001.08', endpoint_path: '/api' },
      ]);

      expect(result).toEqual(mockRows);
      expect(handlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("publishing_status = 'active'"),
          values: ['tenant-1', 'pacs.008', '001.08'],
        }),
        'configuration',
      );
    });

    it('builds correct placeholders for multiple tuples', async () => {
      (handlePostExecuteSqlStatement as jest.Mock).mockResolvedValue({ rows: [] } as never);

      await findActiveConfigsByTuples([
        { tenant_id: 'tenant-1', txtp: 'pacs.008', txtp_version: '001.08', endpoint_path: '/a' },
        { tenant_id: 'tenant-2', txtp: 'pacs.002', txtp_version: '001.03', endpoint_path: '/b' },
      ]);

      const callArg = (handlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: string[] };
      expect(callArg.values).toEqual(['tenant-1', 'pacs.008', '001.08', 'tenant-2', 'pacs.002', '001.03']);
    });
  });
});
