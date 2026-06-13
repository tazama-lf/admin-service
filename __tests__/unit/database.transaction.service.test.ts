// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// RED tests (#434): withConfigurationTransaction does not exist yet. It wraps a unit
// of work in a real pg transaction on the configuration pool so a multi-statement
// active-map swap is atomic. Contract:
//  - acquire a client from databaseManager._configuration.connect()
//  - BEGIN, run the work, COMMIT (in that order), return the work's result
//  - on error: ROLLBACK (not COMMIT) and rethrow
//  - ALWAYS release the client

const mockConnect = jest.fn();

jest.mock('../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
  databaseManager: {
    _configuration: { connect: (...args: unknown[]) => mockConnect(...args) },
  },
}));

import * as dbLogic from '../../src/services/database.logic.service';

type TransactionClient = { query: (text: string, values?: unknown[]) => Promise<unknown>; release: () => void };
const withConfigurationTransaction = (
  dbLogic as unknown as {
    withConfigurationTransaction: <T>(work: (client: TransactionClient) => Promise<T>) => Promise<T>;
  }
).withConfigurationTransaction;

describe('withConfigurationTransaction (#434)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs BEGIN -> work -> COMMIT in order, releases the client, and returns the work result', async () => {
    const queryCalls: string[] = [];
    const release = jest.fn();
    const client: TransactionClient = {
      query: jest.fn(async (text: string) => {
        queryCalls.push(text);
        return { rows: [], rowCount: 0 };
      }),
      release,
    };
    mockConnect.mockResolvedValue(client as never);

    const result = await withConfigurationTransaction(async (c) => {
      await c.query('WORK');
      return 'done';
    });

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(queryCalls).toEqual(['BEGIN', 'WORK', 'COMMIT']);
    expect(release).toHaveBeenCalledTimes(1);
    expect(result).toBe('done');
  });

  it('rolls back (not commits) and rethrows when the work fails, still releasing the client', async () => {
    const queryCalls: string[] = [];
    const release = jest.fn();
    const client: TransactionClient = {
      query: jest.fn(async (text: string) => {
        queryCalls.push(text);
        return { rows: [], rowCount: 0 };
      }),
      release,
    };
    mockConnect.mockResolvedValue(client as never);

    await expect(
      withConfigurationTransaction(async () => {
        throw new Error('swap failed');
      }),
    ).rejects.toThrow('swap failed');

    expect(queryCalls).toContain('BEGIN');
    expect(queryCalls).toContain('ROLLBACK');
    expect(queryCalls).not.toContain('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
