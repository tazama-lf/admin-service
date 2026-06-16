import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces';

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

import { NetworkMapRepo } from '../../../src/repositories/configuration/network.map.repository';

describe('NetworkMapRepository', () => {
  const mockTenantId = 'test-tenant-123';
  const mockClientTenantId = 'client-tenant-999'; // Different tenant to test server-side overwriting

  // Mock dates for predictable testing
  const mockCreateDate = '2024-01-01T10:00:00.000Z';
  const mockUpdateDate = '2024-01-01T11:00:00.000Z';

  // Mock NetworkMap for testing
  const createMockNetworkMap = (includeTimestamps = false): NetworkMap => ({
    active: true,
    cfg: '1.0.0',
    tenantId: mockClientTenantId, // Start with client-provided tenant to test server overwriting
    ...(includeTimestamps && {
      creDtTm: '2024-01-01T00:00:00.000Z', // Client provided timestamps should be overridden
      updDtTm: '2024-01-01T00:00:00.000Z',
    }),
    messages: [
      {
        id: 'msg-001',
        cfg: '1.0.0',
        txTp: 'pain.001.001.11',
        typologies: [
          {
            id: 'typology-001',
            cfg: '1.0.0',
            rules: [
              {
                id: 'rule-001',
                cfg: '1.0.0',
              },
            ],
          },
        ],
      },
    ],
  });

  const mockCreateResponse = {
    rows: [{ configuration: createMockNetworkMap() }],
    rowCount: 1,
  };

  const mockUpdateResponse = {
    rows: [{ configuration: createMockNetworkMap() }],
    rowCount: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('list', () => {
    it('counts all matching rows and pages deterministically on the generated key (no filters)', async () => {
      const firstMap = createMockNetworkMap();
      const secondMap = { ...createMockNetworkMap(), cfg: '2.0.0', active: false };

      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ configuration: firstMap }, { configuration: secondMap }], rowCount: 2 });

      const result = await NetworkMapRepo.list({
        offset: 5,
        limit: 10,
        order: 'DESC',
        tenantId: mockTenantId,
      });

      expect(result).toEqual({ data: [firstMap, secondMap], total: 2 });

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        1,
        {
          text: 'SELECT COUNT(*) AS total FROM network_map WHERE tenantid = $1;',
          values: [mockTenantId],
        },
        'configuration',
      );
      // network_map's unique key is the single generated `cfg` column
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        2,
        {
          text: 'SELECT configuration FROM network_map WHERE tenantid = $1 ORDER BY cfg DESC OFFSET $2 LIMIT $3;',
          values: [mockTenantId, 5, 10],
        },
        'configuration',
      );
    });

    it('applies every supplied filter (ANDed), casting the generated boolean `active` column', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await NetworkMapRepo.list({
        filters: { active: 'true', cfg: '1.0.0' },
        offset: 0,
        limit: 25,
        order: 'ASC',
        tenantId: mockTenantId,
      });

      expect(result).toEqual({ data: [], total: 0 });

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        1,
        {
          text: 'SELECT COUNT(*) AS total FROM network_map WHERE tenantid = $1 AND active = $2::boolean AND cfg = $3;',
          values: [mockTenantId, 'true', '1.0.0'],
        },
        'configuration',
      );
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        2,
        {
          text: 'SELECT configuration FROM network_map WHERE tenantid = $1 AND active = $2::boolean AND cfg = $3 ORDER BY cfg ASC OFFSET $4 LIMIT $5;',
          values: [mockTenantId, 'true', '1.0.0', 0, 25],
        },
        'configuration',
      );
    });

    it('takes total from COUNT (not the page length) and never returns null', async () => {
      const map = createMockNetworkMap();
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '42' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ configuration: map }], rowCount: null });

      const result = await NetworkMapRepo.list({ offset: 0, limit: 20, order: 'ASC', tenantId: mockTenantId });

      expect(result.total).toBe(42);
      expect(result.data).toEqual([map]);
    });

    it('ignores filter fields that are not in the allowlist', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await NetworkMapRepo.list({
        filters: { nope: 'x', active: 'true' },
        offset: 0,
        limit: 20,
        order: 'ASC',
        tenantId: mockTenantId,
      });

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        1,
        {
          text: 'SELECT COUNT(*) AS total FROM network_map WHERE tenantid = $1 AND active = $2::boolean;',
          values: [mockTenantId, 'true'],
        },
        'configuration',
      );
    });

    it('keeps the ::boolean filter but omits OFFSET and LIMIT when limit is "all" (#422)', async () => {
      const map = createMockNetworkMap();
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ configuration: map }], rowCount: 1 });

      await NetworkMapRepo.list({ filters: { active: 'true' }, limit: 'all', order: 'ASC', tenantId: mockTenantId });

      // The active predicate (cast ::boolean) is preserved; no OFFSET/LIMIT is appended.
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        2,
        {
          text: 'SELECT configuration FROM network_map WHERE tenantid = $1 AND active = $2::boolean ORDER BY cfg ASC;',
          values: [mockTenantId, 'true'],
        },
        'configuration',
      );
    });
  });

  describe('get', () => {
    const mockIdentifier = { cfg: '1.0.0', tenantId: mockTenantId };

    it('should return a network map when found', async () => {
      const configuration = createMockNetworkMap();
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ configuration }],
        rowCount: 1,
      });

      const result = await NetworkMapRepo.get(mockIdentifier);

      expect(result).toEqual(configuration);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'SELECT configuration FROM network_map WHERE cfg = $1 AND tenantId = $2;',
          values: [mockIdentifier.cfg, mockIdentifier.tenantId],
        },
        'configuration',
      );
    });

    it('should return null when the network map is not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await NetworkMapRepo.get(mockIdentifier);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should set both creDtTm and updDtTm to the same ISO 8601 timestamp', async () => {
      // Mock Date.prototype.toISOString to return predictable timestamp
      const mockToISOString = jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockCreateDate);

      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockCreateResponse);

      const inputPayload = createMockNetworkMap();
      const result = await NetworkMapRepo.create(inputPayload, mockTenantId);

      // Verify that the payload was modified with timestamp data
      expect(inputPayload.creDtTm).toBe(mockCreateDate);
      expect(inputPayload.updDtTm).toBe(mockCreateDate);
      expect(inputPayload.creDtTm).toBe(inputPayload.updDtTm); // Both should be the same on creation

      // Verify tenantId was set
      expect(inputPayload.tenantId).toBe(mockTenantId);

      // Verify database call was made with correct parameters
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'INSERT INTO network_map (configuration) VALUES ($1) RETURNING configuration',
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
      const inputPayload = createMockNetworkMap(true);
      const originalCreDtTm = inputPayload.creDtTm;
      const originalUpdDtTm = inputPayload.updDtTm;

      await NetworkMapRepo.create(inputPayload, mockTenantId);

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

      const inputPayload = createMockNetworkMap();
      const originalTenantId = inputPayload.tenantId; // Should be mockClientTenantId

      expect(originalTenantId).toBe(mockClientTenantId); // Verify starting state

      await NetworkMapRepo.create(inputPayload, mockTenantId);

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

      const inputPayload = createMockNetworkMap();
      // Set an initial creDtTm to verify it's preserved
      const originalCreDtTm = '2024-01-01T09:00:00.000Z';
      inputPayload.creDtTm = originalCreDtTm;

      const result = await NetworkMapRepo.update(mockIdentifier, inputPayload);

      // Verify updDtTm was set to the new timestamp
      expect(inputPayload.updDtTm).toBe(mockUpdateDate);

      // Verify creDtTm was NOT modified (preserved)
      expect(inputPayload.creDtTm).toBe(originalCreDtTm);
      expect(inputPayload.creDtTm).not.toBe(mockUpdateDate);

      // Verify database call was made with correct parameters
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'UPDATE network_map SET configuration = $1 WHERE cfg = $2 AND tenantId = $3 RETURNING configuration;',
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
      const inputPayload = createMockNetworkMap(true);
      const originalUpdDtTm = inputPayload.updDtTm;

      await NetworkMapRepo.update(mockIdentifier, inputPayload);

      // Verify that server-side timestamp overrides client value
      expect(inputPayload.updDtTm).toBe(mockUpdateDate);
      expect(inputPayload.updDtTm).not.toBe(originalUpdDtTm);

      expect(mockToISOString).toHaveBeenCalled();
    });

    it('should override payload tenantId with the identifier tenantId', async () => {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockUpdateDate);
      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockUpdateResponse);

      const inputPayload = createMockNetworkMap();
      const originalTenantId = inputPayload.tenantId;

      await NetworkMapRepo.update(mockIdentifier, inputPayload);

      expect(inputPayload.tenantId).toBe(mockIdentifier.tenantId);
    });

    it('should return null when no rows are affected', async () => {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockUpdateDate);

      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      const inputPayload = createMockNetworkMap();
      const result = await NetworkMapRepo.update(mockIdentifier, inputPayload);

      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    const mockIdentifier = { cfg: '1.0.0', tenantId: mockTenantId };

    it('should return true when a network map is deleted', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      const result = await NetworkMapRepo.remove(mockIdentifier);

      expect(result).toBe(true);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'DELETE FROM network_map WHERE cfg = $1 AND tenantId = $2;',
          values: [mockIdentifier.cfg, mockIdentifier.tenantId],
        },
        'configuration',
      );
    });

    it('should return false when no network map is deleted', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await NetworkMapRepo.remove(mockIdentifier);

      expect(result).toBe(false);
    });
  });

  describe('timestamp generation', () => {
    it('should generate valid ISO 8601 timestamps', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockCreateResponse);

      // Don't mock Date - let it generate real timestamps
      const inputPayload = createMockNetworkMap();

      await NetworkMapRepo.create(inputPayload, mockTenantId);

      // Verify timestamps are valid ISO 8601 format
      expect(inputPayload.creDtTm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(inputPayload.updDtTm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // Verify timestamps are valid dates
      expect(new Date(inputPayload.creDtTm!).getTime()).not.toBeNaN();
      expect(new Date(inputPayload.updDtTm!).getTime()).not.toBeNaN();
    });
  });
});
