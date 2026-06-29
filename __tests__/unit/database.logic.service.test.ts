// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQuery = jest.fn();
const mockReadonlyQuery = jest.fn();

jest.mock('../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
  databaseManager: {
    _configuration: { query: mockQuery },
    _eventHistory: { query: mockQuery },
    _evaluation: { query: mockQuery },
    _rawHistory: { query: mockQuery },
    // configuration has a readonly pool; raw_history intentionally does NOT (tests fail-closed).
    _configurationReadonly: { query: mockReadonlyQuery },
    _eventHistoryReadonly: { query: mockReadonlyQuery },
    _evaluationReadonly: { query: mockReadonlyQuery },
    _simulationReadonly: { query: mockReadonlyQuery },
  },
}));

import { handlePostExecuteSqlStatement, handleReadonlyExecuteSqlStatement } from '../../src/services/database.logic.service';

describe('Database Logic Service', () => {
  const mockQueryConfig = { text: 'SELECT 1', values: [] };
  const mockResult = { rows: [{ id: 1 }], rowCount: 1 };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute query on configuration database', async () => {
    mockQuery.mockResolvedValue(mockResult as never);
    const result = await handlePostExecuteSqlStatement(mockQueryConfig, 'configuration');
    expect(result).toEqual(mockResult);
    expect(mockQuery).toHaveBeenCalledWith(mockQueryConfig.text, mockQueryConfig.values);
  });

  it('should execute query on event_history database', async () => {
    mockQuery.mockResolvedValue(mockResult as never);
    const result = await handlePostExecuteSqlStatement(mockQueryConfig, 'event_history');
    expect(result).toEqual(mockResult);
  });

  it('should execute query on evaluation database', async () => {
    mockQuery.mockResolvedValue(mockResult as never);
    const result = await handlePostExecuteSqlStatement(mockQueryConfig, 'evaluation');
    expect(result).toEqual(mockResult);
  });

  it('should execute query on raw_history database', async () => {
    mockQuery.mockResolvedValue(mockResult as never);
    const result = await handlePostExecuteSqlStatement(mockQueryConfig, 'raw_history');
    expect(result).toEqual(mockResult);
  });

  it('should throw error when database name is not found', async () => {
    await expect(handlePostExecuteSqlStatement(mockQueryConfig, 'unknown_db')).rejects.toThrow('Specified database was not found.');
  });

  // RED (#436): when a pinned client is supplied, the statement must run on THAT client
  // (so it joins the open transaction) and must NOT borrow a separate pool connection -
  // otherwise a batch's INSERTs and its BEGIN/COMMIT land on different sessions and
  // atomicity is lost. handlePostExecuteSqlStatement does not accept a client arg yet,
  // so this is cast to keep the RED at the assertion level.
  it('runs the statement on the supplied client instead of the pool (#436)', async () => {
    const clientQuery = jest.fn();
    clientQuery.mockResolvedValue(mockResult as never);
    const client = { query: clientQuery };

    const runWithClient = handlePostExecuteSqlStatement as unknown as (
      q: typeof mockQueryConfig,
      db: string,
      client?: unknown,
    ) => Promise<typeof mockResult>;
    const result = await runWithClient(mockQueryConfig, 'configuration', client);

    expect(result).toEqual(mockResult);
    expect(clientQuery).toHaveBeenCalledWith(mockQueryConfig.text, mockQueryConfig.values);
    // Must NOT borrow a separate pooled connection when a transaction client is given.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should throw error when query fails', async () => {
    mockQuery.mockRejectedValue(new Error('Connection refused') as never);
    await expect(handlePostExecuteSqlStatement(mockQueryConfig, 'configuration')).rejects.toThrow('Connection refused');
  });

  describe('handleReadonlyExecuteSqlStatement', () => {
    it('should execute on the read-only pool, not the read/write pool', async () => {
      mockReadonlyQuery.mockResolvedValue(mockResult as never);

      const result = await handleReadonlyExecuteSqlStatement(mockQueryConfig, 'configuration');

      expect(result).toEqual(mockResult);
      expect(mockReadonlyQuery).toHaveBeenCalledWith(mockQueryConfig.text, mockQueryConfig.values);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should route to the read-only pool matching the dbName', async () => {
      mockReadonlyQuery.mockResolvedValue(mockResult as never);

      await handleReadonlyExecuteSqlStatement(mockQueryConfig, 'simulation');

      expect(mockReadonlyQuery).toHaveBeenCalledWith(mockQueryConfig.text, mockQueryConfig.values);
    });

    it('should throw when database name is not found', async () => {
      await expect(handleReadonlyExecuteSqlStatement(mockQueryConfig, 'unknown_db')).rejects.toThrow('Specified database was not found.');
    });

    it('should fail closed when no read-only pool is configured for the database', async () => {
      // raw_history has no _rawHistoryReadonly in the mock — must NOT fall back to the RW pool.
      await expect(handleReadonlyExecuteSqlStatement(mockQueryConfig, 'raw_history')).rejects.toThrow('Read-only pool for');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should propagate errors from the read-only pool', async () => {
      mockReadonlyQuery.mockRejectedValue(new Error('permission denied for table secret') as never);
      await expect(handleReadonlyExecuteSqlStatement(mockQueryConfig, 'configuration')).rejects.toThrow(
        'permission denied for table secret',
      );
    });
  });
});
