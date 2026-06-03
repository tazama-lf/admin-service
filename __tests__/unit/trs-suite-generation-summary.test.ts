// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/suite-generations.repository', () => ({
  createSuiteGenerationInDb: jest.fn(),
  getNextGenerationNumber: jest.fn(),
  getGenerationsBySuiteId: jest.fn(),
  getLatestGenerationBySuiteId: jest.fn(),
  updateGenerationCountsInDb: jest.fn(),
  getGenerationSummaryFromDb: jest.fn(),
}));

jest.mock('../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: jest.fn(),
}));

jest.mock('../../src/repositories/simulation-studio/context-txtp-configs.repository', () => ({}));
jest.mock('../../src/repositories/simulation-studio/context-field-strategies.repository', () => ({}));

jest.mock('../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
  configuration: {},
}));

import { HttpException } from '../../src/utils/error';
import * as generationsRepo from '../../src/repositories/simulation-studio/suite-generations.repository';
import * as dbService from '../../src/services/database.logic.service';
import { recalculateGenerationCounts, getGenerationSummary } from '../../src/services/trs-suite-generation.logic.service';

const mockSummary = {
  generation_id: 7,
  generation_number: 1,
  status: 'DRAFT',
  suite_name: 'Q3 Edge Cases',
  associated_rule: 'Rule 001',
  primary_txtp: 'pacs.008',
  context_txtp_configs: [{ txtp: 'pacs.008', txtp_version: '001.08', message_count: 100 }],
  enrichment_table_names: ['account_enrichment'],
  context_count: 100,
  trigger_count: 10,
  enrichment_table_count: 1,
  iteration_number: 0,
};

beforeEach(() => jest.clearAllMocks());

// ── recalculateGenerationCounts ───────────────────────────────────────────────

describe('recalculateGenerationCounts', () => {
  it('sums message_count from all 3 tables and calls updateGenerationCountsInDb', async () => {
    (dbService.handlePostExecuteSqlStatement as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ total: '100' }] }) // context
      .mockResolvedValueOnce({ rows: [{ total: '10' }] }) // trigger
      .mockResolvedValueOnce({ rows: [{ total: '1' }] }); // enrichment
    (generationsRepo.updateGenerationCountsInDb as jest.Mock).mockResolvedValue(undefined);

    await recalculateGenerationCounts(7);

    expect(dbService.handlePostExecuteSqlStatement).toHaveBeenCalledTimes(3);
    expect(generationsRepo.updateGenerationCountsInDb).toHaveBeenCalledWith(7, {
      context_count: 100,
      trigger_count: 10,
      enrichment_table_count: 1,
    });
  });

  it('handles zero totals when tables are empty', async () => {
    (dbService.handlePostExecuteSqlStatement as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] });
    (generationsRepo.updateGenerationCountsInDb as jest.Mock).mockResolvedValue(undefined);

    await recalculateGenerationCounts(7);

    expect(generationsRepo.updateGenerationCountsInDb).toHaveBeenCalledWith(7, {
      context_count: 0,
      trigger_count: 0,
      enrichment_table_count: 0,
    });
  });

  it('wraps DB error in HttpException 500', async () => {
    (dbService.handlePostExecuteSqlStatement as jest.Mock).mockRejectedValue(new Error('DB fail'));
    await expect(recalculateGenerationCounts(7)).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('forbidden', 403);
    (dbService.handlePostExecuteSqlStatement as jest.Mock).mockRejectedValue(err);
    await expect(recalculateGenerationCounts(7)).rejects.toBe(err);
  });

  it('queries all 3 config tables with correct SQL patterns', async () => {
    (dbService.handlePostExecuteSqlStatement as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] });
    (generationsRepo.updateGenerationCountsInDb as jest.Mock).mockResolvedValue(undefined);

    await recalculateGenerationCounts(7);

    const calls = (dbService.handlePostExecuteSqlStatement as jest.Mock).mock.calls;
    expect((calls[0][0] as { text: string }).text).toContain('trs_suite_context_txtp_configs');
    expect((calls[1][0] as { text: string }).text).toContain('trs_suite_trigger_txtp_configs');
    expect((calls[2][0] as { text: string }).text).toContain('trs_suite_enrichment_tables');
  });
});

// ── getGenerationSummary ──────────────────────────────────────────────────────

describe('getGenerationSummary', () => {
  it('returns summary from repo', async () => {
    (generationsRepo.getGenerationSummaryFromDb as jest.Mock).mockResolvedValue(mockSummary);

    const result = await getGenerationSummary(7);

    expect(result).toEqual(mockSummary);
    expect(generationsRepo.getGenerationSummaryFromDb).toHaveBeenCalledWith(7);
  });

  it('returns null when generation not found', async () => {
    (generationsRepo.getGenerationSummaryFromDb as jest.Mock).mockResolvedValue(null);
    expect(await getGenerationSummary(999)).toBeNull();
  });

  it('wraps error in HttpException 500', async () => {
    (generationsRepo.getGenerationSummaryFromDb as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(getGenerationSummary(7)).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('not found', 404);
    (generationsRepo.getGenerationSummaryFromDb as jest.Mock).mockRejectedValue(err);
    await expect(getGenerationSummary(7)).rejects.toBe(err);
  });
});
