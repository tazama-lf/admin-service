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

  describe('list', () => {
    it('counts all matching rows and pages deterministically on the generated key (no filters)', async () => {
      const firstConfig = createMockRuleConfig();
      const secondConfig = { ...createMockRuleConfig(), id: 'rule-002', cfg: '2.0.0' };

      // The shared list issues COUNT(*) first, then the page query.
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ configuration: firstConfig }, { configuration: secondConfig }], rowCount: 2 });

      const result = await RuleConfigRepo.list({
        offset: 5,
        limit: 10,
        order: 'DESC',
        tenantId: mockTenantId,
      });

      expect(result).toEqual({ data: [firstConfig, secondConfig], total: 2 });

      // total comes from a real COUNT(*) over the same predicates
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        1,
        {
          text: 'SELECT COUNT(*) AS total FROM rule WHERE tenantid = $1;',
          values: [mockTenantId],
        },
        'configuration',
      );
      // ordering is on the generated unique-key columns (rulecfg, ruleid), not configuration->>...
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        2,
        {
          text: 'SELECT configuration FROM rule WHERE tenantid = $1 ORDER BY rulecfg DESC, ruleid DESC OFFSET $2 LIMIT $3;',
          values: [mockTenantId, 5, 10],
        },
        'configuration',
      );
    });

    it('applies every supplied filter (ANDed) on the generated columns and sorts by the chosen key', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await RuleConfigRepo.list({
        filters: { id: 'rule-002', cfg: '2.0.0' },
        offset: 0,
        limit: 25,
        order: 'ASC',
        sort: 'id',
        tenantId: mockTenantId,
      });

      expect(result).toEqual({ data: [], total: 0 });

      // BOTH filters become separate ANDed, parameterised predicates (single-filter bug fixed)
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        1,
        {
          text: 'SELECT COUNT(*) AS total FROM rule WHERE tenantid = $1 AND ruleid = $2 AND rulecfg = $3;',
          values: [mockTenantId, 'rule-002', '2.0.0'],
        },
        'configuration',
      );
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        2,
        {
          text: 'SELECT configuration FROM rule WHERE tenantid = $1 AND ruleid = $2 AND rulecfg = $3 ORDER BY ruleid ASC, rulecfg ASC OFFSET $4 LIMIT $5;',
          values: [mockTenantId, 'rule-002', '2.0.0', 0, 25],
        },
        'configuration',
      );
    });

    it('takes total from COUNT (not the page length) and never returns null', async () => {
      const cfg = createMockRuleConfig();
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '42' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ configuration: cfg }], rowCount: null });

      const result = await RuleConfigRepo.list({ offset: 0, limit: 20, order: 'ASC', tenantId: mockTenantId });

      expect(result.total).toBe(42);
      expect(result.data).toEqual([cfg]);
    });

    it('ignores filter fields that are not in the allowlist', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await RuleConfigRepo.list({
        filters: { nope: 'x', id: 'rule-1' },
        offset: 0,
        limit: 20,
        order: 'ASC',
        tenantId: mockTenantId,
      });

      // only the recognised `id` filter becomes a predicate; `nope` is dropped
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        1,
        {
          text: 'SELECT COUNT(*) AS total FROM rule WHERE tenantid = $1 AND ruleid = $2;',
          values: [mockTenantId, 'rule-1'],
        },
        'configuration',
      );
    });

    it('reports the real total on an over-paged (empty) page (separate COUNT, not COUNT(*) OVER())', async () => {
      // offset past the end => the page query returns zero rows, but COUNT still answers 42.
      // A COUNT(*) OVER() implementation would read no window row here and wrongly report 0.
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '42' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await RuleConfigRepo.list({ offset: 1000, limit: 20, order: 'ASC', tenantId: mockTenantId });

      expect(result).toEqual({ data: [], total: 42 });
    });

    it('coerces a missing/null COUNT result to total 0 (never null/NaN)', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: null }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await RuleConfigRepo.list({ offset: 0, limit: 20, order: 'ASC', tenantId: mockTenantId });

      expect(result).toEqual({ data: [], total: 0 });
    });

    it('omits OFFSET and LIMIT when limit is "all" (unbounded full-set retrieval, #422)', async () => {
      const firstConfig = createMockRuleConfig();
      const secondConfig = { ...createMockRuleConfig(), id: 'rule-002', cfg: '2.0.0' };

      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ configuration: firstConfig }, { configuration: secondConfig }], rowCount: 2 });

      const result = await RuleConfigRepo.list({ limit: 'all', order: 'ASC', tenantId: mockTenantId });

      expect(result).toEqual({ data: [firstConfig, secondConfig], total: 2 });

      // COUNT(*) is unchanged - the real total is still reported.
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        1,
        {
          text: 'SELECT COUNT(*) AS total FROM rule WHERE tenantid = $1;',
          values: [mockTenantId],
        },
        'configuration',
      );
      // The page query carries NEITHER OFFSET NOR LIMIT and binds only the tenant (+ any filters).
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        2,
        {
          text: 'SELECT configuration FROM rule WHERE tenantid = $1 ORDER BY rulecfg ASC, ruleid ASC;',
          values: [mockTenantId],
        },
        'configuration',
      );
    });

    it('applies filters but still omits OFFSET and LIMIT when limit is "all" (#422)', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await RuleConfigRepo.list({ filters: { id: 'rule-002' }, limit: 'all', order: 'ASC', tenantId: mockTenantId });

      // The recognised filter is still ANDed and parameterised; no OFFSET/LIMIT is appended.
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        2,
        {
          text: 'SELECT configuration FROM rule WHERE tenantid = $1 AND ruleid = $2 ORDER BY rulecfg ASC, ruleid ASC;',
          values: [mockTenantId, 'rule-002'],
        },
        'configuration',
      );
    });
  });

  describe('list - targeted batch fetch by (id, cfg) set (#423)', () => {
    it('matches a set of (id, cfg) pairs with a parameterised row-value IN, with limit=all (the canonical client call)', async () => {
      const firstConfig = createMockRuleConfig();
      const secondConfig = { ...createMockRuleConfig(), id: 'rule-002', cfg: '2.0.0' };

      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ configuration: firstConfig }, { configuration: secondConfig }], rowCount: 2 });

      const result = await RuleConfigRepo.list({
        keys: [
          { id: 'rule-001', cfg: '1.0.0' },
          { id: 'rule-002', cfg: '2.0.0' },
        ],
        limit: 'all',
        order: 'ASC',
        tenantId: mockTenantId,
      });

      expect(result).toEqual({ data: [firstConfig, secondConfig], total: 2 });

      // COUNT(*) carries the same row-value IN predicate over the generated key columns.
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        1,
        {
          text: 'SELECT COUNT(*) AS total FROM rule WHERE tenantid = $1 AND (ruleid, rulecfg) IN (($2, $3), ($4, $5));',
          values: [mockTenantId, 'rule-001', '1.0.0', 'rule-002', '2.0.0'],
        },
        'configuration',
      );
      // The page query: same IN predicate, deterministic ORDER BY, and (limit=all) no OFFSET/LIMIT.
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        2,
        {
          text: 'SELECT configuration FROM rule WHERE tenantid = $1 AND (ruleid, rulecfg) IN (($2, $3), ($4, $5)) ORDER BY rulecfg ASC, ruleid ASC;',
          values: [mockTenantId, 'rule-001', '1.0.0', 'rule-002', '2.0.0'],
        },
        'configuration',
      );
    });

    it('appends OFFSET/LIMIT after the IN-set parameters on the bounded path', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await RuleConfigRepo.list({
        keys: [{ id: 'rule-001', cfg: '1.0.0' }],
        offset: 0,
        limit: 20,
        order: 'ASC',
        tenantId: mockTenantId,
      });

      // The set values come first; OFFSET/LIMIT placeholders follow them.
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        2,
        {
          text: 'SELECT configuration FROM rule WHERE tenantid = $1 AND (ruleid, rulecfg) IN (($2, $3)) ORDER BY rulecfg ASC, ruleid ASC OFFSET $4 LIMIT $5;',
          values: [mockTenantId, 'rule-001', '1.0.0', 0, 20],
        },
        'configuration',
      );
    });

    it('returns the found subset silently when some requested pairs do not exist (no error, total = matched count)', async () => {
      const onlyMatch = createMockRuleConfig();

      // Three pairs requested; COUNT and the page both report only the one that exists.
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ configuration: onlyMatch }], rowCount: 1 });

      const result = await RuleConfigRepo.list({
        keys: [
          { id: 'rule-001', cfg: '1.0.0' },
          { id: 'missing-a', cfg: '9.9.9' },
          { id: 'missing-b', cfg: '9.9.9' },
        ],
        limit: 'all',
        order: 'ASC',
        tenantId: mockTenantId,
      });

      // All three pairs are bound into the IN predicate; the DB silently returns only the matches.
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        2,
        {
          text: 'SELECT configuration FROM rule WHERE tenantid = $1 AND (ruleid, rulecfg) IN (($2, $3), ($4, $5), ($6, $7)) ORDER BY rulecfg ASC, ruleid ASC;',
          values: [mockTenantId, 'rule-001', '1.0.0', 'missing-a', '9.9.9', 'missing-b', '9.9.9'],
        },
        'configuration',
      );
      // No error is raised for the unmatched pairs; the found subset and matched total are returned.
      expect(result).toEqual({ data: [onlyMatch], total: 1 });
    });

    it('treats an empty (id, cfg) set as no set filter (guards against an invalid empty IN ())', async () => {
      const cfg = createMockRuleConfig();
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ configuration: cfg }], rowCount: 1 });

      await RuleConfigRepo.list({ keys: [], limit: 'all', order: 'ASC', tenantId: mockTenantId });

      // An empty set must not emit `IN ()`; the query degrades to the tenant-only predicate.
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        1,
        {
          text: 'SELECT COUNT(*) AS total FROM rule WHERE tenantid = $1;',
          values: [mockTenantId],
        },
        'configuration',
      );
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        2,
        {
          text: 'SELECT configuration FROM rule WHERE tenantid = $1 ORDER BY rulecfg ASC, ruleid ASC;',
          values: [mockTenantId],
        },
        'configuration',
      );
    });

    it('ANDs a scalar filter and the (id, cfg) set, numbering the set params after the filter params', async () => {
      mockHandlePostExecuteSqlStatement
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await RuleConfigRepo.list({
        filters: { cfg: '1.0.0' },
        keys: [{ id: 'rule-001', cfg: '1.0.0' }],
        limit: 'all',
        order: 'ASC',
        tenantId: mockTenantId,
      });

      // tenant ($1), then the scalar filter ($2), then the set tuple ($3, $4): set params follow the filter.
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
        1,
        {
          text: 'SELECT COUNT(*) AS total FROM rule WHERE tenantid = $1 AND rulecfg = $2 AND (ruleid, rulecfg) IN (($3, $4));',
          values: [mockTenantId, '1.0.0', 'rule-001', '1.0.0'],
        },
        'configuration',
      );
    });
  });

  describe('get', () => {
    const mockIdentifier = { id: 'rule-001', cfg: '1.0.0', tenantId: mockTenantId };

    it('should return a rule configuration when found', async () => {
      const configuration = createMockRuleConfig();
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ configuration }],
        rowCount: 1,
      });

      const result = await RuleConfigRepo.get(mockIdentifier);

      expect(result).toEqual(configuration);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'SELECT configuration FROM rule WHERE ruleid = $1 AND rulecfg = $2 AND tenantid = $3;',
          values: [mockIdentifier.id, mockIdentifier.cfg, mockIdentifier.tenantId],
        },
        'configuration',
      );
    });

    it('should return null when the rule configuration is not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await RuleConfigRepo.get(mockIdentifier);

      expect(result).toBeNull();
    });
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
        undefined,
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
    const mockIdentifier = { id: '001@1.0.0', cfg: '1.0.0', tenantId: mockTenantId };

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
          text: 'UPDATE rule SET configuration = $1 WHERE ruleid = $2 AND rulecfg = $3 AND tenantid = $4 RETURNING configuration;',
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
      const inputPayload = createMockRuleConfig(true);
      const originalUpdDtTm = inputPayload.updDtTm;

      await RuleConfigRepo.update(mockIdentifier, inputPayload);

      // Verify that server-side timestamp overrides client value
      expect(inputPayload.updDtTm).toBe(mockUpdateDate);
      expect(inputPayload.updDtTm).not.toBe(originalUpdDtTm);

      expect(mockToISOString).toHaveBeenCalled();
    });

    it('should override payload tenantId with the identifier tenantId', async () => {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockUpdateDate);
      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockUpdateResponse);

      const inputPayload = createMockRuleConfig();
      const originalTenantId = inputPayload.tenantId;

      await RuleConfigRepo.update(mockIdentifier, inputPayload);

      expect(inputPayload.tenantId).toBe(mockIdentifier.tenantId);
    });

    it('should return null when no rows are affected', async () => {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockUpdateDate);

      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      const inputPayload = createMockRuleConfig();
      const result = await RuleConfigRepo.update(mockIdentifier, inputPayload);

      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    const mockIdentifier = { id: 'rule-001', cfg: '1.0.0', tenantId: mockTenantId };

    it('should return true when a rule configuration is deleted', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 1,
      });

      const result = await RuleConfigRepo.remove(mockIdentifier);

      expect(result).toBe(true);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        {
          text: 'DELETE FROM rule WHERE ruleid = $1 AND rulecfg = $2 AND tenantid = $3;',
          values: [mockIdentifier.id, mockIdentifier.cfg, mockIdentifier.tenantId],
        },
        'configuration',
      );
    });

    it('should return false when no rule configuration is deleted', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await RuleConfigRepo.remove(mockIdentifier);

      expect(result).toBe(false);
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
});
