// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { TypologyConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces/processor-files/TypologyConfig';

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

import { TypologyConfigRepo } from '../../../src/repositories/configuration/typology.config.repository';

describe('TypologyConfigRepository', () => {
  const mockTenantId = 'test-tenant-123';
  const mockClientTenantId = 'client-tenant-999'; // Different tenant to test server-side overwriting

  // Mock dates for predictable testing
  const mockCreateDate = '2024-01-01T10:00:00.000Z';
  const mockUpdateDate = '2024-01-01T11:00:00.000Z';

  // Mock TypologyConfig for testing
  const createMockTypologyConfig = (includeTimestamps = false): TypologyConfig => ({
    id: 'typology-001',
    cfg: '1.0.0',
    tenantId: mockClientTenantId, // Start with client-provided tenant to test server overwriting
    desc: 'Test typology configuration',
    ...(includeTimestamps && {
      creDtTm: '2024-01-01T00:00:00.000Z', // Client provided timestamps should be overridden
      updDtTm: '2024-01-01T00:00:00.000Z',
    }),
    rules: [
      {
        id: 'rule-001',
        cfg: '1.0.0',
        wghts: [
          {
            ref: 'weight-ref-001',
            wght: 0.8,
          },
        ],
        termId: 'term-001',
      },
      {
        id: 'rule-002',
        cfg: '1.0.0',
        wghts: [
          {
            ref: 'weight-ref-002',
            wght: 0.2,
          },
        ],
        termId: 'term-002',
      },
    ],
    expression: ['and', ['>', 'rule-001', 0.5], ['>', 'rule-002', 0.3]],
    workflow: {
      alertThreshold: 0.75,
      interdictionThreshold: 0.95,
    },
  });

  const mockCreateResponse = {
    rows: [{ configuration: createMockTypologyConfig() }],
    rowCount: 1,
  };

  const mockUpdateResponse = {
    rows: [{ configuration: createMockTypologyConfig() }],
    rowCount: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('list', () => {
    it('should list typology configurations with default sort and no filters', async () => {
      const firstConfig = createMockTypologyConfig();
      const secondConfig = { ...createMockTypologyConfig(), id: 'typology-002', cfg: '2.0.0' };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ configuration: firstConfig }, { configuration: secondConfig }],
        rowCount: 2,
      });

      const result = await TypologyConfigRepo.list({
        offset: 5,
        limit: 10,
        order: 'DESC',
        tenantId: mockTenantId,
      });

      expect(result).toEqual({ data: [firstConfig, secondConfig], total: 2 });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: "SELECT configuration FROM typology WHERE ($2 = '' OR configuration->>$1 = $2) AND tenantId = $6 ORDER BY configuration->>$5 DESC OFFSET $3 LIMIT $4;",
          values: ['typologyid', '', 5, 10, 'cfg', mockTenantId],
        },
        'configuration',
      );
    });

    it('should list with the first provided filter and custom sort', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await TypologyConfigRepo.list({
        filters: { id: 'typology-002', cfg: '2.0.0' },
        offset: 0,
        limit: 25,
        order: 'ASC',
        sort: 'id',
        tenantId: mockTenantId,
      });

      expect(result).toEqual({ data: [], total: 0 });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: "SELECT configuration FROM typology WHERE ($2 = '' OR configuration->>$1 = $2) AND tenantId = $6 ORDER BY configuration->>$5 ASC OFFSET $3 LIMIT $4;",
          values: ['id', 'typology-002', 0, 25, 'id', mockTenantId],
        },
        'configuration',
      );
    });
  });

  describe('get', () => {
    const mockIdentifier = { id: 'typology-001', cfg: '1.0.0', tenantId: mockTenantId };

    it('should return a typology configuration when found', async () => {
      const configuration = createMockTypologyConfig();
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ configuration }],
        rowCount: 1,
      });

      const result = await TypologyConfigRepo.get(mockIdentifier);

      expect(result).toEqual(configuration);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'SELECT configuration FROM typology WHERE typologyid = $1 AND typologycfg = $2 AND tenantid = $3;',
          values: [mockIdentifier.id, mockIdentifier.cfg, mockIdentifier.tenantId],
        },
        'configuration',
      );
    });

    it('should return null when the typology configuration is not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await TypologyConfigRepo.get(mockIdentifier);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should set both creDtTm and updDtTm to the same ISO 8601 timestamp', async () => {
      // Mock Date.prototype.toISOString to return predictable timestamp
      const mockToISOString = jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockCreateDate);

      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockCreateResponse);

      const inputPayload = createMockTypologyConfig();
      const originalTenantId = inputPayload.tenantId;
      const result = await TypologyConfigRepo.create(inputPayload, mockTenantId);

      // Verify that the payload was modified with timestamp data
      expect(inputPayload.creDtTm).toBe(mockCreateDate);
      expect(inputPayload.updDtTm).toBe(mockCreateDate);
      expect(inputPayload.creDtTm).toBe(inputPayload.updDtTm); // Both should be the same on creation

      // Verify server-side tenantId overwrites client-provided value
      expect(inputPayload.tenantId).toBe(mockTenantId);
      expect(inputPayload.tenantId).not.toBe(originalTenantId);

      // Verify database call was made with correct parameters
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'INSERT INTO typology (configuration) VALUES ($1) RETURNING configuration',
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
      const inputPayload = createMockTypologyConfig(true);
      const originalCreDtTm = inputPayload.creDtTm;
      const originalUpdDtTm = inputPayload.updDtTm;
      const originalTenantId = inputPayload.tenantId;

      await TypologyConfigRepo.create(inputPayload, mockTenantId);

      // Verify that server-side timestamps override client values
      expect(inputPayload.creDtTm).toBe(mockCreateDate);
      expect(inputPayload.updDtTm).toBe(mockCreateDate);
      expect(inputPayload.creDtTm).not.toBe(originalCreDtTm);
      expect(inputPayload.updDtTm).not.toBe(originalUpdDtTm);

      // Verify that server-side tenantId overrides client value
      expect(inputPayload.tenantId).toBe(mockTenantId);
      expect(inputPayload.tenantId).not.toBe(originalTenantId);

      expect(mockToISOString).toHaveBeenCalled();
    });

    it('should override client-supplied tenantId with server-side tenantId', async () => {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockCreateDate);
      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockCreateResponse);

      const inputPayload = createMockTypologyConfig();
      const originalTenantId = inputPayload.tenantId; // Should be mockClientTenantId

      expect(originalTenantId).toBe(mockClientTenantId); // Verify starting state

      await TypologyConfigRepo.create(inputPayload, mockTenantId);

      // Verify server-side tenantId overwrites client value
      expect(inputPayload.tenantId).toBe(mockTenantId);
      expect(inputPayload.tenantId).not.toBe(originalTenantId);
    });
  });

  describe('update', () => {
    const mockIdentifier = { id: '001@1.0.0', cfg: '1.0.0', tenantId: mockTenantId };

    it('should set updDtTm to a new ISO 8601 timestamp and preserve creDtTm', async () => {
      const mockToISOString = jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockUpdateDate);

      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockUpdateResponse);

      const inputPayload = createMockTypologyConfig();
      // Set an initial creDtTm to verify it's preserved
      const originalCreDtTm = '2024-01-01T09:00:00.000Z';
      inputPayload.creDtTm = originalCreDtTm;

      const result = await TypologyConfigRepo.update(mockIdentifier, inputPayload);

      // Verify updDtTm was set to the new timestamp
      expect(inputPayload.updDtTm).toBe(mockUpdateDate);

      // Verify creDtTm was NOT modified (preserved)
      expect(inputPayload.creDtTm).toBe(originalCreDtTm);
      expect(inputPayload.creDtTm).not.toBe(mockUpdateDate);

      // Verify database call was made with correct parameters
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'UPDATE typology SET configuration = $1 WHERE typologyid = $2 AND typologycfg = $3 AND tenantid = $4 RETURNING configuration',
          values: [inputPayload, mockIdentifier.id, mockIdentifier.cfg, mockIdentifier.tenantId],
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
      const inputPayload = createMockTypologyConfig(true);
      const originalUpdDtTm = inputPayload.updDtTm;

      await TypologyConfigRepo.update(mockIdentifier, inputPayload);

      // Verify that server-side timestamp overrides client value
      expect(inputPayload.updDtTm).toBe(mockUpdateDate);
      expect(inputPayload.updDtTm).not.toBe(originalUpdDtTm);

      expect(mockToISOString).toHaveBeenCalled();
    });

    it('should override payload tenantId with the identifier tenantId', async () => {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockUpdateDate);
      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockUpdateResponse);

      const inputPayload = createMockTypologyConfig();
      const originalTenantId = inputPayload.tenantId;

      await TypologyConfigRepo.update(mockIdentifier, inputPayload);

      expect(inputPayload.tenantId).toBe(mockIdentifier.tenantId);
    });

    it('should return null when no rows are affected', async () => {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockUpdateDate);

      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      const inputPayload = createMockTypologyConfig();
      const result = await TypologyConfigRepo.update(mockIdentifier, inputPayload);

      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    const mockIdentifier = { id: 'typology-001', cfg: '1.0.0', tenantId: mockTenantId };

    it('should return true when a typology configuration is deleted', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      const result = await TypologyConfigRepo.remove(mockIdentifier);

      expect(result).toBe(true);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'DELETE FROM typology WHERE typologyid = $1 AND typologycfg = $2 AND tenantid = $3;',
          values: [mockIdentifier.id, mockIdentifier.cfg, mockIdentifier.tenantId],
        },
        'configuration',
      );
    });

    it('should return false when no typology configuration is deleted', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await TypologyConfigRepo.remove(mockIdentifier);

      expect(result).toBe(false);
    });
  });

  describe('timestamp generation', () => {
    it('should generate valid ISO 8601 timestamps', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockCreateResponse);

      // Don't mock Date - let it generate real timestamps
      const inputPayload = createMockTypologyConfig();

      await TypologyConfigRepo.create(inputPayload, mockTenantId);

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

      const result = await TypologyConfigRepo.list(mockListParams);

      expect(result).toEqual({ data: [], total: 0 });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: `SELECT configuration FROM typology WHERE ($2 = '' OR configuration->>$1 = $2) AND tenantId = $6 ORDER BY configuration->>$5 ASC OFFSET $3 LIMIT $4;`,
          values: ['typologyid', '', 0, 10, 'cfg', mockTenantId],
        },
        'configuration',
      );
    });

    it('should return typology configurations when rows exist', async () => {
      const mockConfig1 = createMockTypologyConfig();
      const mockConfig2 = { ...createMockTypologyConfig(), id: 'typology-002' };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ configuration: mockConfig1 }, { configuration: mockConfig2 }],
        rowCount: 2,
      });

      const result = await TypologyConfigRepo.list(mockListParams);

      expect(result).toEqual({
        data: [mockConfig1, mockConfig2],
        total: 2,
      });
    });

    it('should apply filters when provided', async () => {
      const mockConfig = createMockTypologyConfig();
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ configuration: mockConfig }],
        rowCount: 1,
      });

      const paramsWithFilter = {
        ...mockListParams,
        filters: { id: 'typology-001' },
      };

      const result = await TypologyConfigRepo.list(paramsWithFilter);

      expect(result).toEqual({
        data: [mockConfig],
        total: 1,
      });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['id', 'typology-001', 0, 10, 'cfg', mockTenantId],
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

      await TypologyConfigRepo.list(paramsWithoutSort);

      // Default sort should be 'cfg'
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['typologyid', '', 0, 10, 'cfg', mockTenantId],
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

      await TypologyConfigRepo.list(paramsWithDescOrder);

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

      await TypologyConfigRepo.list(paginatedParams);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['typologyid', '', 20, 5, 'cfg', mockTenantId],
        }),
        'configuration',
      );
    });
  });

  describe('get', () => {
    const mockIdentifier = { id: 'typology-001', cfg: '1.0.0', tenantId: mockTenantId };

    it('should return typology configuration when found', async () => {
      const mockConfig = createMockTypologyConfig();
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ configuration: mockConfig }],
        rowCount: 1,
      });

      const result = await TypologyConfigRepo.get(mockIdentifier);

      expect(result).toEqual(mockConfig);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'SELECT configuration FROM typology WHERE typologyid = $1 AND typologycfg = $2 AND tenantid = $3;',
          values: ['typology-001', '1.0.0', mockTenantId],
        },
        'configuration',
      );
    });

    it('should return null when typology configuration is not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await TypologyConfigRepo.get(mockIdentifier);

      expect(result).toBeNull();
    });

    it('should use correct tenantId in query', async () => {
      const differentTenantId = 'different-tenant-456';
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await TypologyConfigRepo.get({ id: 'typology-001', cfg: '2.0.0', tenantId: differentTenantId });

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['typology-001', '2.0.0', differentTenantId],
        }),
        'configuration',
      );
    });
  });

  describe('remove', () => {
    const mockIdentifier = { id: 'typology-001', cfg: '1.0.0', tenantId: mockTenantId };

    it('should return true when typology configuration is deleted', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      const result = await TypologyConfigRepo.remove(mockIdentifier);

      expect(result).toBe(true);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'DELETE FROM typology WHERE typologyid = $1 AND typologycfg = $2 AND tenantid = $3;',
          values: ['typology-001', '1.0.0', mockTenantId],
        },
        'configuration',
      );
    });

    it('should return false when no typology configuration is deleted', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await TypologyConfigRepo.remove(mockIdentifier);

      expect(result).toBe(false);
    });

    it('should use correct tenantId in delete query', async () => {
      const differentTenantId = 'different-tenant-789';
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      await TypologyConfigRepo.remove({ id: 'typology-001', cfg: '3.0.0', tenantId: differentTenantId });

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ['typology-001', '3.0.0', differentTenantId],
        }),
        'configuration',
      );
    });

    it('should handle rowCount being null or undefined', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: null,
      });

      const result = await TypologyConfigRepo.remove(mockIdentifier);

      expect(result).toBe(false);
    });
  });
});
