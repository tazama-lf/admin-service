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

import { getSuiteResultFromDb, saveRunResultInDb } from '../../../src/repositories/simulation-studio/simulation-run-results.repository';

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
    expect(trigger.trigger_id).toBe(1);
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

const mockGenRow = {
  suite_id: 1,
  rule_version: 'v1.0.1',
  trigger_count: 12,
  rule_name: 'rule01',
};

const mockDto = {
  gen_id: 13,
  trigger_id: 5,
  rule_result: { subRuleRef: '.02', indpdntVarbl: 500, id: 'rule01@1.0.0', cfg: 'none', wght: 0, prcgTm: 1000, tenantId: 'cbe' },
};

describe('saveRunResultInDb', () => {
  it('creates new run when none exists and inserts result', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockGenRow], rowCount: 1 }) // gen lookup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // existing run check
      .mockResolvedValueOnce({ rows: [{ id: 10 }], rowCount: 1 }) // run insert
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // suite run_count increment
      .mockResolvedValueOnce({ rows: [{ id: 100 }], rowCount: 1 }); // result insert

    const result = await saveRunResultInDb(mockDto);

    expect(result.run_id).toBe(10);
    expect(result.result_id).toBe(100);
    expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledTimes(5);
  });

  it('reuses existing run when found for gen_id', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockGenRow], rowCount: 1 }) // gen lookup
      .mockResolvedValueOnce({ rows: [{ id: 7 }], rowCount: 1 }) // existing run check (reuse, no increment)
      .mockResolvedValueOnce({ rows: [{ id: 200 }], rowCount: 1 }); // result insert

    const result = await saveRunResultInDb(mockDto);

    expect(result.run_id).toBe(7);
    expect(result.result_id).toBe(200);
    expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledTimes(3);
  });

  it('throws when generation not found', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(saveRunResultInDb(mockDto)).rejects.toThrow('Generation not found for gen_id: 13');
  });

  it('extracts subRuleRef and indpdntVarbl from rule_result', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockGenRow], rowCount: 1 }) // gen lookup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // existing run check
      .mockResolvedValueOnce({ rows: [{ id: 10 }], rowCount: 1 }) // run insert
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // suite run_count increment
      .mockResolvedValueOnce({ rows: [{ id: 100 }], rowCount: 1 }); // result insert

    await saveRunResultInDb(mockDto);

    const insertResultCall = mockHandlePostExecuteSqlStatement.mock.calls[4];
    const values = (insertResultCall[0] as { values: unknown[] }).values;
    expect(values[3]).toBe('.02');
    expect(values[4]).toBe(500);
    expect(values[5]).toBe('SUCCESS');
  });

  it('sets outcome to FAILED when subRuleRef contains err', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockGenRow], rowCount: 1 }) // gen lookup
      .mockResolvedValueOnce({ rows: [{ id: 7 }], rowCount: 1 }) // existing run check (reuse, no increment)
      .mockResolvedValueOnce({ rows: [{ id: 200 }], rowCount: 1 }); // result insert

    await saveRunResultInDb({ ...mockDto, rule_result: { ...mockDto.rule_result, subRuleRef: '.err' } });

    const insertResultCall = mockHandlePostExecuteSqlStatement.mock.calls[2];
    const values = (insertResultCall[0] as { values: unknown[] }).values;
    expect(values[5]).toBe('FAILED');
  });

  it('defaults subRuleRef to "none" when missing from rule_result', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockGenRow], rowCount: 1 }) // gen lookup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // existing run check
      .mockResolvedValueOnce({ rows: [{ id: 10 }], rowCount: 1 }) // run insert
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // suite run_count increment
      .mockResolvedValueOnce({ rows: [{ id: 100 }], rowCount: 1 }); // result insert

    await saveRunResultInDb({ ...mockDto, rule_result: { id: 'rule01@1.0.0', cfg: 'none', wght: 0, prcgTm: 1000, tenantId: 'cbe' } });

    const insertResultCall = mockHandlePostExecuteSqlStatement.mock.calls[4];
    const values = (insertResultCall[0] as { values: unknown[] }).values;
    expect(values[3]).toBe('none');
    expect(values[4]).toBeNull();
  });

  it('passes trigger_id to result insert', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockGenRow], rowCount: 1 }) // gen lookup
      .mockResolvedValueOnce({ rows: [{ id: 7 }], rowCount: 1 }) // existing run check (reuse, no increment)
      .mockResolvedValueOnce({ rows: [{ id: 200 }], rowCount: 1 }); // result insert

    await saveRunResultInDb({ ...mockDto, trigger_id: 42 });

    const insertResultCall = mockHandlePostExecuteSqlStatement.mock.calls[2];
    const values = (insertResultCall[0] as { values: unknown[] }).values;
    expect(values[1]).toBe(42);
  });
});
