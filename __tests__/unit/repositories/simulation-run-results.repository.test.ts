// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockHandlePostExecuteSqlStatement: any = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: any[]) => mockHandlePostExecuteSqlStatement(...args),
}));

jest.mock('../../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
  configuration: {},
}));

import { getSuiteResultFromDb } from '../../../src/repositories/simulation-studio/simulation-run-results.repository';

const mockRunRow = {
  id: 1,
  generation_id: 13,
  outcome: 'success',
  rule_version: 'v1.0.1',
  rule_name: 'rule01',
  trigger_count: 12,
};

const makeResultRow = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  run_id: 1,
  trigger_id: 1,
  rule_result: { score: 0.5 },
  independent_variable: '500',
  sub_rule_ref: '.02',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getSuiteResultFromDb', () => {
  it('returns null when no runs found', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await getSuiteResultFromDb(99);

    expect(result).toBeNull();
    expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledTimes(1);
  });

  it('returns suite result with correct shape', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockRunRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [makeResultRow()], rowCount: 1 });

    const result = await getSuiteResultFromDb(1);

    expect(result).not.toBeNull();
    expect(result!.suite_id).toBe(1);
    expect(result!.results).toHaveLength(1);
  });

  it('maps run fields correctly', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockRunRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await getSuiteResultFromDb(1);

    const run = result!.results[0];
    expect(run.run_id).toBe(1);
    expect(run.generation_id).toBe(13);
    expect(run.rule_name).toBe('rule01');
    expect(run.rule_version).toBe('v1.0.1');
    expect(run.trigger_count).toBe(12);
    expect(run.outcome).toBe('success');
  });

  it('maps trigger entries correctly', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockRunRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [makeResultRow()], rowCount: 1 });

    const result = await getSuiteResultFromDb(1);

    const trigger = result!.results[0].triggers[0];
    expect(trigger.id).toBe(10);
    expect(trigger.rule_result).toEqual({ score: 0.5 });
    expect(trigger.independent_variable).toBe('500');
    expect(trigger.sub_rule_ref).toBe('.02');
  });

  it('returns empty triggers array when run has no result rows', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockRunRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await getSuiteResultFromDb(1);

    expect(result!.results[0].triggers).toHaveLength(0);
  });

  it('groups multiple result rows under correct run', async () => {
    const run1 = { ...mockRunRow, id: 1 };
    const run2 = { ...mockRunRow, id: 2, rule_name: 'rule02' };
    const r1 = makeResultRow({ id: 10, run_id: 1 });
    const r2 = makeResultRow({ id: 11, run_id: 1 });
    const r3 = makeResultRow({ id: 20, run_id: 2 });

    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [run1, run2], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [r1, r2, r3], rowCount: 3 });

    const result = await getSuiteResultFromDb(3);

    expect(result!.results).toHaveLength(2);
    expect(result!.results[0].triggers).toHaveLength(2);
    expect(result!.results[1].triggers).toHaveLength(1);
    expect(result!.results[1].rule_name).toBe('rule02');
  });

  it('passes suiteId to runs query', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockRunRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await getSuiteResultFromDb(42);

    const firstCall = mockHandlePostExecuteSqlStatement.mock.calls[0];
    expect((firstCall[0] as { values: unknown[] }).values).toContain(42);
  });

  it('passes run ids to results query', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [{ ...mockRunRow, id: 7 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await getSuiteResultFromDb(3);

    const secondCall = mockHandlePostExecuteSqlStatement.mock.calls[1];
    expect((secondCall[0] as { values: unknown[] }).values[0]).toContain(7);
  });

  it('uses rowCount null check — returns null when rowCount is null and no rows', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [], rowCount: null });

    const result = await getSuiteResultFromDb(3);

    expect(result).toBeNull();
  });
});
