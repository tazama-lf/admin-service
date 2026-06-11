// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHandlePostExecuteSqlStatement = jest.fn();

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
  outcome: 'PASS',
  rule_version: 'v10',
  rule_name: 'rule021',
  trigger_count: 2,
};

const makeResultJoinRow = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  run_id: 1,
  outcome: 'PASS',
  independent_variable: '500',
  sub_rule_ref: '.x02',
  rule_result: { score: 0.5 },
  tc_id: 1,
  tc_generation_id: 10,
  tc_txtp: 'pacs.002.001.12',
  tc_txtp_version: '001.12',
  tc_display_order: 1,
  tc_message_count: 100,
  tc_link_to_context_pairs: false,
  tc_payload_template_json: { TxTp: 'pacs.002' },
  tc_expected_independent_variable: 500,
  tc_expected_result_band: 'good',
  tc_notes: null,
  tc_faker_seed: null,
  tc_generator_profile: {},
  tc_related_txtp_config_id: null,
  tc_related_transaction: null,
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('getSuiteResultFromDb', () => {
  it('returns null when no runs found', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await getSuiteResultFromDb(99);

    expect(result).toBeNull();
    expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledTimes(1);
  });

  it('returns suite result with trigger config joined', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockRunRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [makeResultJoinRow()], rowCount: 1 });

    const result = await getSuiteResultFromDb(3);

    expect(result).not.toBeNull();
    expect(result!.suite_id).toBe(3);
    expect(result!.total_runs).toBe(1);
    expect(result!.results).toHaveLength(1);
    expect(result!.results[0].rule_name).toBe('rule021');
    expect(result!.results[0].rule_version).toBe('v10');
    expect(result!.results[0].triggers).toHaveLength(1);
    expect(result!.results[0].triggers[0].trigger?.txtp).toBe('pacs.002.001.12');
  });

  it('returns null trigger when tc_id is null (LEFT JOIN miss)', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockRunRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [makeResultJoinRow({ tc_id: null })], rowCount: 1 });

    const result = await getSuiteResultFromDb(3);

    expect(result!.results[0].triggers[0].trigger).toBeNull();
  });

  it('parses tc_payload_template_json string to object', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockRunRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [makeResultJoinRow({ tc_payload_template_json: '{"TxTp":"pacs.002"}' })], rowCount: 1 });

    const result = await getSuiteResultFromDb(3);

    expect(result!.results[0].triggers[0].trigger?.payload_template_json).toEqual({ TxTp: 'pacs.002' });
  });

  it('parses tc_generator_profile string to object', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockRunRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [makeResultJoinRow({ tc_generator_profile: '{"mode":"faker"}' })], rowCount: 1 });

    const result = await getSuiteResultFromDb(3);

    expect(result!.results[0].triggers[0].trigger?.generator_profile).toEqual({ mode: 'faker' });
  });

  it('groups multiple result rows under correct run', async () => {
    const run1 = { ...mockRunRow, id: 1 };
    const run2 = { ...mockRunRow, id: 2, rule_name: 'rule022' };
    const resultRow1 = makeResultJoinRow({ id: 10, run_id: 1 });
    const resultRow2 = makeResultJoinRow({ id: 11, run_id: 1 });
    const resultRow3 = makeResultJoinRow({ id: 20, run_id: 2 });

    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [run1, run2], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [resultRow1, resultRow2, resultRow3], rowCount: 3 });

    const result = await getSuiteResultFromDb(3);

    expect(result!.total_runs).toBe(2);
    expect(result!.results[0].triggers).toHaveLength(2);
    expect(result!.results[1].triggers).toHaveLength(1);
    expect(result!.results[1].rule_name).toBe('rule022');
  });

  it('returns empty triggers array when run has no result rows', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockRunRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await getSuiteResultFromDb(3);

    expect(result!.results[0].triggers).toHaveLength(0);
  });

  it('uses rowCount ?? 0 when rowCount is null', async () => {
    mockHandlePostExecuteSqlStatement
      .mockResolvedValueOnce({ rows: [mockRunRow], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await getSuiteResultFromDb(3);

    expect(result!.total_runs).toBe(0);
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
});
