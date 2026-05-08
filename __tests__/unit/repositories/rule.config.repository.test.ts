// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { RuleConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces';

// Mock the database service
const mockQuery = jest.fn();
const mockHandlePostExecuteSqlStatement = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: any[]) => mockHandlePostExecuteSqlStatement(...args),
}));

// Mock the databaseManager
jest.mock('../../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
  databaseManager: {
    _configuration: { query: mockQuery },
  },
}));

import { RuleConfigRepo } from '../../../src/repositories/configuration/rule.config.repository';

describe('RuleConfigRepository', () => {
  const mockTenantId = 'test-tenant-123';
  const mockClientTenantId = 'client-tenant-999'; // Different tenant to test server-side overwriting

  // Mock dates for predictable testing
  const mockCreateDate = '2024-01-01T10:00:00.000Z';
  const mockUpdateDate = '2024-01-01T11:00:00.000Z';

  // Mock RuleConfig for testing
  const createMockRuleConfig = (includeTimestamps = false): RuleConfig => ({
    id: 'rule-001',
    cfg: '1.0.0',
    tenantId: mockClientTenantId, // Start with client-provided tenant to test server overwriting
    desc: 'Test rule configuration',
    ...(includeTimestamps && {
      creDtTm: '2024-01-01T00:00:00.000Z', // Client provided timestamps should be overridden
      updDtTm: '2024-01-01T00:00:00.000Z',
    }),
    config: {
      parameters: {
        threshold: 100,
        timeWindow: '24h',
      },
      exitConditions: [
        {
          subRuleRef: 'exit-001',
          reason: 'threshold exceeded',
        },
      ],
      bands: [
        {
          subRuleRef: 'band-001',
          reason: 'low risk',
          lowerLimit: 0,
          upperLimit: 50,
        },
      ],
      timeframes: [{ threshold: 86400 }],
    },
  });

  const mockCreateResponse = {
    rows: [{ configuration: createMockRuleConfig() }],
    rowCount: 1,
  };

  const mockUpdateResponse = {
    rows: [{ configuration: createMockRuleConfig() }],
    rowCount: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('create', () => {
    it('should set both creDtTm and updDtTm to the same ISO 8601 timestamp', async () => {
      // Mock Date.prototype.toISOString to return predictable timestamp
      const mockToISOString = jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockCreateDate);

      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockCreateResponse);

      const inputPayload = createMockRuleConfig();
      const result = await RuleConfigRepo.create(inputPayload, mockTenantId);

      // Verify that the payload was modified with timestamp data
      expect(inputPayload.creDtTm).toBe(mockCreateDate);
      expect(inputPayload.updDtTm).toBe(mockCreateDate);
      expect(inputPayload.creDtTm).toBe(inputPayload.updDtTm); // Both should be the same on creation

      // Verify tenantId was set
      expect(inputPayload.tenantId).toBe(mockTenantId);

      // Verify database call was made with correct parameters
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'INSERT INTO rule (configuration) VALUES ($1) RETURNING configuration;',
          values: [inputPayload],
        },
        'configuration',
      );

      expect(result).toEqual(mockCreateResponse.rows[0].configuration);
      expect(mockToISOString).toHaveBeenCalled();
    });

    it('should override client-supplied timestamps with server-side generated timestamps', async () => {
      const mockToISOString = jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockCreateDate);

      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockCreateResponse);

      // Create payload with client-supplied timestamps
      const inputPayload = createMockRuleConfig(true);
      const originalCreDtTm = inputPayload.creDtTm;
      const originalUpdDtTm = inputPayload.updDtTm;

      await RuleConfigRepo.create(inputPayload, mockTenantId);

      // Verify that server-side timestamps override client values
      expect(inputPayload.creDtTm).toBe(mockCreateDate);
      expect(inputPayload.updDtTm).toBe(mockCreateDate);
      expect(inputPayload.creDtTm).not.toBe(originalCreDtTm);
      expect(inputPayload.updDtTm).not.toBe(originalUpdDtTm);

      expect(mockToISOString).toHaveBeenCalled();
    });

    it('should override client-supplied tenantId with server-side tenantId', async () => {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockCreateDate);
      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockCreateResponse);

      const inputPayload = createMockRuleConfig();
      const originalTenantId = inputPayload.tenantId; // Should be mockClientTenantId

      expect(originalTenantId).toBe(mockClientTenantId); // Verify starting state

      await RuleConfigRepo.create(inputPayload, mockTenantId);

      // Verify server-side tenantId overwrites client value
      expect(inputPayload.tenantId).toBe(mockTenantId);
      expect(inputPayload.tenantId).not.toBe(originalTenantId);
    });
  });

  describe('update', () => {
    const mockIdentifier = { cfg: '1.0.0', tenantId: mockTenantId };

    it('should set updDtTm to a new ISO 8601 timestamp and preserve creDtTm', async () => {
      const mockToISOString = jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockUpdateDate);

      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockUpdateResponse);

      const inputPayload = createMockRuleConfig();
      // Set an initial creDtTm to verify it's preserved
      const originalCreDtTm = '2024-01-01T09:00:00.000Z';
      inputPayload.creDtTm = originalCreDtTm;

      const result = await RuleConfigRepo.update(mockIdentifier, inputPayload);

      // Verify updDtTm was set to the new timestamp
      expect(inputPayload.updDtTm).toBe(mockUpdateDate);

      // Verify creDtTm was NOT modified (preserved)
      expect(inputPayload.creDtTm).toBe(originalCreDtTm);
      expect(inputPayload.creDtTm).not.toBe(mockUpdateDate);

      // Verify database call was made with correct parameters
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'UPDATE rule SET configuration = $1 WHERE rulecfg = $2 AND tenantid = $3 RETURNING configuration;',
          values: [inputPayload, mockIdentifier.cfg, mockIdentifier.tenantId],
        },
        'configuration',
      );

      expect(result).toEqual(mockUpdateResponse.rows[0].configuration);
      expect(mockToISOString).toHaveBeenCalled();
    });

    it('should override client-supplied updDtTm with server-side generated timestamp', async () => {
      const mockToISOString = jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockUpdateDate);

      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockUpdateResponse);

      // Create payload with client-supplied timestamp
      const inputPayload = createMockRuleConfig(true);
      const originalUpdDtTm = inputPayload.updDtTm;

      await RuleConfigRepo.update(mockIdentifier, inputPayload);

      // Verify that server-side timestamp overrides client value
      expect(inputPayload.updDtTm).toBe(mockUpdateDate);
      expect(inputPayload.updDtTm).not.toBe(originalUpdDtTm);

      expect(mockToISOString).toHaveBeenCalled();
    });

    it('should return null when no rows are affected', async () => {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockUpdateDate);

      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      const inputPayload = createMockRuleConfig();
      const result = await RuleConfigRepo.update(mockIdentifier, inputPayload);

      expect(result).toBeNull();
    });
  });

  describe('timestamp generation', () => {
    it('should generate valid ISO 8601 timestamps', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockCreateResponse);

      // Don't mock Date - let it generate real timestamps
      const inputPayload = createMockRuleConfig();

      await RuleConfigRepo.create(inputPayload, mockTenantId);

      // Verify timestamps are valid ISO 8601 format
      expect(inputPayload.creDtTm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(inputPayload.updDtTm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // Verify timestamps are valid dates
      expect(new Date(inputPayload.creDtTm!).getTime()).not.toBeNaN();
      expect(new Date(inputPayload.updDtTm!).getTime()).not.toBeNaN();
    });
  });

  describe('list', () => {
    const mockListParams = {
      filters: undefined,
      limit: 10,
      offset: 0,
      order: 'ASC' as const,
      sort: 'cfg',
      tenantId: mockTenantId,
    };

    it('should return empty array when no rows found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await RuleConfigRepo.list(mockListParams);

      expect(result).toEqual({ data: [], total: 0 });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: `SELECT configuration FROM rule WHERE ($2 = '' OR configuration->>$1 = $2) AND tenantId = $6 ORDER BY configuration->>$3 ASC OFFSET $4 LIMIT $5;`,
          values: ['ruleid', '', 'cfg', 0, 10, mockTenantId],
        },
        'configuration',
      );
    });

    it('should return rule configs when rows exist', async () => {
      const mockConfig1 = createMockRuleConfig();
      const mockConfig2 = { ...createMockRuleConfig(), id: 'rule-002' };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ configuration: mockConfig1 }, { configuration: mockConfig2 }],
        rowCount: 2,
      });

      const result = await RuleConfigRepo.list(mockListParams);

      expect(result).toEqual({
        data: [mockConfig1, mockConfig2],
        total: 2,
      });
    });

    it('should apply filters when provided', async () => {
      const mockConfig = createMockRuleConfig();
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ configuration: mockConfig }],
        rowCount: 1,
      });

      const paramsWithFilter = {
        ...mockListParams,
        filters: { id: 'rule-001' },
      };

      const result = await RuleConfigRepo.list(paramsWithFilter);

      expect(result).toEqual({
        data: [mockConfig],
        total: 1,
      });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['id', 'rule-001', 'cfg', 0, 10, mockTenantId],
        }),
        'configuration',
      );
    });

    it('should use default sort field when sort is undefined', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const paramsWithoutSort = {
        ...mockListParams,
        sort: undefined,
      };

      await RuleConfigRepo.list(paramsWithoutSort);

      // Default sort should be 'cfg'
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['ruleid', '', 'cfg', 0, 10, mockTenantId],
        }),
        'configuration',
      );
    });

    it('should handle DESC order', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const paramsWithDescOrder = {
        ...mockListParams,
        order: 'DESC' as const,
      };

      await RuleConfigRepo.list(paramsWithDescOrder);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('DESC'),
        }),
        'configuration',
      );
    });

    it('should handle pagination with offset and limit', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const paginatedParams = {
        ...mockListParams,
        offset: 20,
        limit: 5,
      };

      await RuleConfigRepo.list(paginatedParams);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['ruleid', '', 'cfg', 20, 5, mockTenantId],
        }),
        'configuration',
      );
    });
  });

  describe('get', () => {
    const mockIdentifier = { cfg: '1.0.0', tenantId: mockTenantId };

    it('should return rule config when found', async () => {
      const mockConfig = createMockRuleConfig();
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ configuration: mockConfig }],
        rowCount: 1,
      });

      const result = await RuleConfigRepo.get(mockIdentifier);

      expect(result).toEqual(mockConfig);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'SELECT configuration FROM rule WHERE rulecfg = $1 AND tenantid = $2;',
          values: ['1.0.0', mockTenantId],
        },
        'configuration',
      );
    });

    it('should return null when rule config is not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await RuleConfigRepo.get(mockIdentifier);

      expect(result).toBeNull();
    });

    it('should use correct tenantId in query', async () => {
      const differentTenantId = 'different-tenant-456';
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await RuleConfigRepo.get({ cfg: '2.0.0', tenantId: differentTenantId });

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['2.0.0', differentTenantId],
        }),
        'configuration',
      );
    });
  });

  describe('remove', () => {
    const mockIdentifier = { cfg: '1.0.0', tenantId: mockTenantId };

    it('should return true when rule config is deleted', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      const result = await RuleConfigRepo.remove(mockIdentifier);

      expect(result).toBe(true);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'DELETE FROM rule WHERE rulecfg = $1 AND tenantid = $2;',
          values: ['1.0.0', mockTenantId],
        },
        'configuration',
      );
    });

    it('should return false when no rule config is deleted', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await RuleConfigRepo.remove(mockIdentifier);

      expect(result).toBe(false);
    });

    it('should use correct tenantId in delete query', async () => {
      const differentTenantId = 'different-tenant-789';
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      await RuleConfigRepo.remove({ cfg: '3.0.0', tenantId: differentTenantId });

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['3.0.0', differentTenantId],
        }),
        'configuration',
      );
    });

    it('should handle rowCount being null or undefined', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: null,
      });

      const result = await RuleConfigRepo.remove(mockIdentifier);

      expect(result).toBe(false);
    });
  });
});
