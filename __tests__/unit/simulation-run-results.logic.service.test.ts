// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/simulation-run-results.repository', () => ({
  getSuiteResultFromDb: jest.fn(),
  saveRunResultInDb: jest.fn(),
}));

jest.mock('../../src/services/trs-suite-generation.logic.service', () => ({
  updateGenerationStatus: jest.fn(),
}));

jest.mock('../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
  configuration: {},
}));

import * as repo from '../../src/repositories/simulation-studio/simulation-run-results.repository';
import * as genService from '../../src/services/trs-suite-generation.logic.service';
import { getSuiteResult, saveRunResult } from '../../src/services/simulation-run-results.logic.service';
import { HttpException } from '../../src/utils/error';

const mockRun = {
  id: 1,
  outcome: 'PASS',
  rule_version: 'v10',
  rule_name: 'rule021',
  triggers: [
    {
      id: 10,
      outcome: 'PASS',
      independent_variable: '500',
      result_band: 'good',
      rule_result: { score: 0.5 },
      trigger_id: 99,
    },
  ],
};

const mockSuiteResult = {
  suite_id: 3,
  total_runs: 1,
  results: [mockRun],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getSuiteResult', () => {
  it('returns suite result when found', async () => {
    (repo.getSuiteResultFromDb as jest.Mock).mockResolvedValue(mockSuiteResult);

    const result = await getSuiteResult(3);

    expect(repo.getSuiteResultFromDb).toHaveBeenCalledWith(3);
    expect(result).toEqual(mockSuiteResult);
    expect(result.suite_id).toBe(3);
    expect(result.total_runs).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].rule_name).toBe('rule021');
    expect(result.results[0].rule_version).toBe('v10');
    expect(result.results[0].triggers).toHaveLength(1);
  });

  it('throws 404 when suite not found', async () => {
    (repo.getSuiteResultFromDb as jest.Mock).mockResolvedValue(null);

    await expect(getSuiteResult(999)).rejects.toThrow(HttpException);
    await expect(getSuiteResult(999)).rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 with correct message when suite not found', async () => {
    (repo.getSuiteResultFromDb as jest.Mock).mockResolvedValue(null);

    try {
      await getSuiteResult(42);
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).message).toContain('42');
    }
  });

  it('rethrows HttpException as-is', async () => {
    const httpErr = new HttpException('custom error', 422);
    (repo.getSuiteResultFromDb as jest.Mock).mockRejectedValue(httpErr);

    await expect(getSuiteResult(3)).rejects.toBe(httpErr);
  });

  it('wraps unknown error in HttpException 500', async () => {
    (repo.getSuiteResultFromDb as jest.Mock).mockRejectedValue(new Error('db connection failed'));

    await expect(getSuiteResult(3)).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value in HttpException 500', async () => {
    (repo.getSuiteResultFromDb as jest.Mock).mockRejectedValue('unexpected string');

    await expect(getSuiteResult(3)).rejects.toMatchObject({ status: 500 });
  });

  it('returns empty results array when suite has no runs', async () => {
    (repo.getSuiteResultFromDb as jest.Mock).mockResolvedValue({
      suite_id: 5,
      total_runs: 0,
      results: [],
    });

    const result = await getSuiteResult(5);
    expect(result.results).toEqual([]);
    expect(result.total_runs).toBe(0);
  });

  it('returns multiple run results', async () => {
    const multiResult = {
      suite_id: 7,
      total_runs: 2,
      results: [
        { id: 1, outcome: 'PASS', rule_version: 'v10', rule_name: 'rule021', triggers: [] },
        { id: 2, outcome: 'FAIL', rule_version: 'v11', rule_name: 'rule022', triggers: [] },
      ],
    };
    (repo.getSuiteResultFromDb as jest.Mock).mockResolvedValue(multiResult);

    const result = await getSuiteResult(7);
    expect(result.total_runs).toBe(2);
    expect(result.results[1].outcome).toBe('FAIL');
    expect(result.results[1].rule_name).toBe('rule022');
  });
});

describe('saveRunResult', () => {
  const mockDto = {
    gen_id: 1,
    trigger_id: null,
    rule_result: {
      subRuleRef: 'rule001',
      indpdntVarbl: 100,
    },
  };

  it('saves run result and updates generation status to COMPLETED when outcome is SUCCESS', async () => {
    const saveResult = { run_id: 1, result_id: 100, outcome: 'SUCCESS' };
    (repo.saveRunResultInDb as jest.Mock).mockResolvedValue(saveResult);
    (genService.updateGenerationStatus as jest.Mock).mockResolvedValue({ id: 1, status: 'COMPLETED' });

    const result = await saveRunResult(mockDto);

    expect(repo.saveRunResultInDb).toHaveBeenCalledWith(mockDto);
    expect(genService.updateGenerationStatus).toHaveBeenCalledWith(1, 'COMPLETED');
    expect(result).toEqual({ run_id: 1, result_id: 100 });
  });

  it('saves run result and updates generation status to FAILED when outcome is FAILED', async () => {
    const saveResult = { run_id: 1, result_id: 100, outcome: 'FAILED' };
    (repo.saveRunResultInDb as jest.Mock).mockResolvedValue(saveResult);
    (genService.updateGenerationStatus as jest.Mock).mockResolvedValue({ id: 1, status: 'FAILED' });

    const failureDto = {
      ...mockDto,
      rule_result: { subRuleRef: 'error_rule_001', indpdntVarbl: 100 },
    };

    const result = await saveRunResult(failureDto);

    expect(repo.saveRunResultInDb).toHaveBeenCalledWith(failureDto);
    expect(genService.updateGenerationStatus).toHaveBeenCalledWith(1, 'FAILED');
    expect(result).toEqual({ run_id: 1, result_id: 100 });
  });

  it('rethrows HttpException from repository', async () => {
    const httpErr = new HttpException('db error', 500);
    (repo.saveRunResultInDb as jest.Mock).mockRejectedValue(httpErr);

    await expect(saveRunResult(mockDto)).rejects.toBe(httpErr);
  });

  it('wraps unknown error in HttpException 500', async () => {
    (repo.saveRunResultInDb as jest.Mock).mockRejectedValue(new Error('unexpected error'));

    await expect(saveRunResult(mockDto)).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException from generation status update', async () => {
    const saveResult = { run_id: 1, result_id: 100, outcome: 'SUCCESS' };
    (repo.saveRunResultInDb as jest.Mock).mockResolvedValue(saveResult);
    const httpErr = new HttpException('generation not found', 404);
    (genService.updateGenerationStatus as jest.Mock).mockRejectedValue(httpErr);

    await expect(saveRunResult(mockDto)).rejects.toBe(httpErr);
  });
});
