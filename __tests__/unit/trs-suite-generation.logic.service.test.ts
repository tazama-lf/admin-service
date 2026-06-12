// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/suite-generations.repository', () => ({
  createSuiteGenerationInDb: jest.fn(),
  getNextGenerationNumber: jest.fn(),
  getGenerationsBySuiteId: jest.fn(),
  getLatestGenerationBySuiteId: jest.fn(),
  resumeGenerationInDb: jest.fn(),
  updateWizardProgressInDb: jest.fn(),
  updateGenerationCountsInDb: jest.fn(),
  getGenerationSummaryFromDb: jest.fn(),
  updateGenerationStatusInDb: jest.fn(),
}));

jest.mock('../../src/repositories/simulation-studio/trigger-txtp-configs.repository', () => ({
  deleteTriggerTxtpConfigInDb: jest.fn(),
}));

jest.mock('../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: jest.fn(),
}));

jest.mock('../../src/repositories/simulation-studio/context-txtp-configs.repository', () => ({
  createContextTxtpConfigInDb: jest.fn(),
  updateContextTxtpConfigInDb: jest.fn(),
  getContextTxtpConfigsByGenerationId: jest.fn(),
}));

jest.mock('../../src/repositories/simulation-studio/context-field-strategies.repository', () => ({
  upsertFieldStrategyInDb: jest.fn(),
  getFieldStrategiesByContextConfigId: jest.fn(),
}));

jest.mock('../../src/repositories/configuration/tcs.config.repository', () => ({
  getSchemaByTransactionType: jest.fn(),
}));

jest.mock('@tazama-lf/tcs-lib', () => ({
  ContentType: { XML: 'application/xml', JSON: 'application/json' },
}));

jest.mock('../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
  configuration: {},
}));

import { HttpException } from '../../src/utils/error';
import * as generationsRepo from '../../src/repositories/simulation-studio/suite-generations.repository';
import * as triggerRepo from '../../src/repositories/simulation-studio/trigger-txtp-configs.repository';
import * as dbService from '../../src/services/database.logic.service';
import {
  createSuiteGeneration,
  getGenerationsForSuite,
  getLatestGenerationForSuite,
  resumeGeneration,
  updateWizardProgress,
  deleteTriggerTxtpConfig,
  recalculateGenerationCounts,
  getGenerationSummary,
} from '../../src/services/trs-suite-generation.logic.service';
import type { SimulationSuite } from '../../src/interface/simulation-suites.interface';
import type { SuiteGeneration } from '../../src/interface/suite-generation.interface';

const mockSuite: SimulationSuite = {
  id: 42,
  tenant_id: 'tenant-001',
  name: 'Test Suite',
  simulation_type: 'SINGLE_RULE' as any,
  rule_repo: 'repo-a',
  rule_version: 'v1.0',
  primary_txtp: 'pacs.008',
  primary_txtp_version: '001.08',
  iteration_count: 0,
  run_count: 0,
  wizard_progress: { completedSteps: [1] },
  metadata: {},
  created_by: 'user-1',
  created_at: new Date(),
  updated_at: new Date(),
};

const mockGeneration: SuiteGeneration = {
  id: 1,
  suite_id: 42,
  generation_number: 1,
  status: 'DRAFT' as any,
  simulation_type: 'SINGLE_RULE' as any,
  wizard_snapshot: {},
  generation_metadata: {},
  created_by: 'user-1',
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => jest.clearAllMocks());

// ── createSuiteGeneration ────────────────────────────────────────────────────

describe('createSuiteGeneration', () => {
  it('fetches next generation number and inserts row', async () => {
    (generationsRepo.getNextGenerationNumber as jest.Mock).mockResolvedValue(1);
    (generationsRepo.createSuiteGenerationInDb as jest.Mock).mockResolvedValue(mockGeneration);

    const result = await createSuiteGeneration(mockSuite, 'user-1', 'user@test.com');

    expect(result).toEqual(mockGeneration);
    expect(generationsRepo.getNextGenerationNumber).toHaveBeenCalledWith(42);
    expect(generationsRepo.createSuiteGenerationInDb).toHaveBeenCalledWith(
      expect.objectContaining({ suite_id: 42, simulation_type: 'SINGLE_RULE' }),
      1,
      'user-1',
      'user@test.com',
    );
  });

  it('works without userEmail', async () => {
    (generationsRepo.getNextGenerationNumber as jest.Mock).mockResolvedValue(2);
    (generationsRepo.createSuiteGenerationInDb as jest.Mock).mockResolvedValue({ ...mockGeneration, generation_number: 2 });

    const result = await createSuiteGeneration(mockSuite, 'user-1');

    expect(result.generation_number).toBe(2);
    expect(generationsRepo.createSuiteGenerationInDb).toHaveBeenCalledWith(expect.anything(), 2, 'user-1', undefined);
  });

  it('passes wizard_progress as wizard_snapshot', async () => {
    (generationsRepo.getNextGenerationNumber as jest.Mock).mockResolvedValue(1);
    (generationsRepo.createSuiteGenerationInDb as jest.Mock).mockResolvedValue(mockGeneration);
    const suiteWithProgress = { ...mockSuite, wizard_progress: { currentStep: 1, completedSteps: [1] } };

    await createSuiteGeneration(suiteWithProgress, 'user-1');

    expect(generationsRepo.createSuiteGenerationInDb).toHaveBeenCalledWith(
      expect.objectContaining({ wizard_snapshot: { currentStep: 1, completedSteps: [1] } }),
      expect.any(Number),
      expect.any(String),
      undefined,
    );
  });

  it('rethrows HttpException as-is', async () => {
    const httpErr = new HttpException('conflict', 409);
    (generationsRepo.getNextGenerationNumber as jest.Mock).mockRejectedValue(httpErr);
    await expect(createSuiteGeneration(mockSuite, 'user-1')).rejects.toBe(httpErr);
  });

  it('wraps unknown Error in HttpException 500', async () => {
    (generationsRepo.getNextGenerationNumber as jest.Mock).mockRejectedValue(new Error('DB down'));
    await expect(createSuiteGeneration(mockSuite, 'user-1')).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value in HttpException 500', async () => {
    (generationsRepo.getNextGenerationNumber as jest.Mock).mockRejectedValue('string error');
    await expect(createSuiteGeneration(mockSuite, 'user-1')).rejects.toMatchObject({ status: 500 });
  });
});

// ── getGenerationsForSuite ───────────────────────────────────────────────────

describe('getGenerationsForSuite', () => {
  it('returns generations array', async () => {
    (generationsRepo.getGenerationsBySuiteId as jest.Mock).mockResolvedValue([mockGeneration]);
    const result = await getGenerationsForSuite(42);
    expect(result).toEqual([mockGeneration]);
    expect(generationsRepo.getGenerationsBySuiteId).toHaveBeenCalledWith(42);
  });

  it('returns empty array when no generations', async () => {
    (generationsRepo.getGenerationsBySuiteId as jest.Mock).mockResolvedValue([]);
    expect(await getGenerationsForSuite(42)).toEqual([]);
  });

  it('wraps error in HttpException 500', async () => {
    (generationsRepo.getGenerationsBySuiteId as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(getGenerationsForSuite(42)).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value', async () => {
    (generationsRepo.getGenerationsBySuiteId as jest.Mock).mockRejectedValue('string error');
    await expect(getGenerationsForSuite(42)).rejects.toMatchObject({ status: 500 });
  });
});

// ── getLatestGenerationForSuite ──────────────────────────────────────────────

describe('getLatestGenerationForSuite', () => {
  it('returns latest generation', async () => {
    (generationsRepo.getLatestGenerationBySuiteId as jest.Mock).mockResolvedValue(mockGeneration);
    expect(await getLatestGenerationForSuite(42)).toEqual(mockGeneration);
    expect(generationsRepo.getLatestGenerationBySuiteId).toHaveBeenCalledWith(42);
  });

  it('returns null when no generations exist', async () => {
    (generationsRepo.getLatestGenerationBySuiteId as jest.Mock).mockResolvedValue(null);
    expect(await getLatestGenerationForSuite(42)).toBeNull();
  });

  it('wraps error in HttpException 500', async () => {
    (generationsRepo.getLatestGenerationBySuiteId as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(getLatestGenerationForSuite(42)).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value', async () => {
    (generationsRepo.getLatestGenerationBySuiteId as jest.Mock).mockRejectedValue('string error');
    await expect(getLatestGenerationForSuite(42)).rejects.toMatchObject({ status: 500 });
  });
  // ── resumeGeneration ────────────────────────────────────────────────────────

  describe('resumeGeneration', () => {
    it('delegates to resumeGenerationInDb', async () => {
      const resumed = { id: 1, suite_id: 42 } as any;
      (generationsRepo.resumeGenerationInDb as jest.Mock).mockResolvedValue(resumed);

      await expect(resumeGeneration(42)).resolves.toBe(resumed);
      expect(generationsRepo.resumeGenerationInDb).toHaveBeenCalledWith(42);
    });

    it('wraps repository errors in HttpException 500', async () => {
      (generationsRepo.resumeGenerationInDb as jest.Mock).mockRejectedValue(new Error('db down'));

      await expect(resumeGeneration(42)).rejects.toMatchObject({ status: 500 });
    });

    it('wraps non-Error thrown value in HttpException 500', async () => {
      (generationsRepo.resumeGenerationInDb as jest.Mock).mockRejectedValue('string error');

      await expect(resumeGeneration(42)).rejects.toMatchObject({ status: 500 });
    });
  });
});

// ── updateWizardProgress ─────────────────────────────────────────────────────

describe('updateWizardProgress', () => {
  it('delegates to updateWizardProgressInDb', async () => {
    (generationsRepo.updateWizardProgressInDb as jest.Mock).mockResolvedValue(undefined);

    await expect(updateWizardProgress(1, 2, [1, 2])).resolves.toBeUndefined();
    expect(generationsRepo.updateWizardProgressInDb).toHaveBeenCalledWith(1, 2, [1, 2]);
  });

  it('rethrows HttpException as-is', async () => {
    const httpErr = new HttpException('not found', 404);
    (generationsRepo.updateWizardProgressInDb as jest.Mock).mockRejectedValue(httpErr);

    await expect(updateWizardProgress(1, 2, [1])).rejects.toBe(httpErr);
  });

  it('wraps unknown Error in HttpException 500', async () => {
    (generationsRepo.updateWizardProgressInDb as jest.Mock).mockRejectedValue(new Error('db fail'));

    await expect(updateWizardProgress(1, 2, [1])).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value in HttpException 500', async () => {
    (generationsRepo.updateWizardProgressInDb as jest.Mock).mockRejectedValue('string error');

    await expect(updateWizardProgress(1, 2, [])).rejects.toMatchObject({ status: 500 });
  });
});

// ── deleteTriggerTxtpConfig ──────────────────────────────────────────────────

describe('deleteTriggerTxtpConfig', () => {
  it('calls deleteTriggerTxtpConfigInDb and resolves when deleted', async () => {
    (triggerRepo.deleteTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(true);

    await expect(deleteTriggerTxtpConfig(5)).resolves.toBeUndefined();
    expect(triggerRepo.deleteTriggerTxtpConfigInDb).toHaveBeenCalledWith(5);
  });

  it('throws 404 when config not found', async () => {
    (triggerRepo.deleteTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(false);

    await expect(deleteTriggerTxtpConfig(99)).rejects.toMatchObject({ status: 404 });
  });

  it('rethrows HttpException as-is', async () => {
    const httpErr = new HttpException('conflict', 409);
    (triggerRepo.deleteTriggerTxtpConfigInDb as jest.Mock).mockRejectedValue(httpErr);

    await expect(deleteTriggerTxtpConfig(5)).rejects.toBe(httpErr);
  });

  it('wraps unknown Error in HttpException 500', async () => {
    (triggerRepo.deleteTriggerTxtpConfigInDb as jest.Mock).mockRejectedValue(new Error('db fail'));

    await expect(deleteTriggerTxtpConfig(5)).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value in HttpException 500', async () => {
    (triggerRepo.deleteTriggerTxtpConfigInDb as jest.Mock).mockRejectedValue('string error');

    await expect(deleteTriggerTxtpConfig(5)).rejects.toMatchObject({ status: 500 });
  });
});

// ── recalculateGenerationCounts ──────────────────────────────────────────────

describe('recalculateGenerationCounts', () => {
  it('queries all three tables and calls updateGenerationCountsInDb', async () => {
    (dbService.handlePostExecuteSqlStatement as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ total: '300' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: '150' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: '50' }], rowCount: 1 });
    (generationsRepo.updateGenerationCountsInDb as jest.Mock).mockResolvedValue(undefined);

    await expect(recalculateGenerationCounts(7)).resolves.toBeUndefined();
    expect(generationsRepo.updateGenerationCountsInDb).toHaveBeenCalledWith(7, {
      context_count: 300,
      trigger_count: 150,
      enrichment_table_count: 50,
    });
  });

  it('parses totals as integers', async () => {
    (dbService.handlePostExecuteSqlStatement as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 });
    (generationsRepo.updateGenerationCountsInDb as jest.Mock).mockResolvedValue(undefined);

    await recalculateGenerationCounts(7);

    expect(generationsRepo.updateGenerationCountsInDb).toHaveBeenCalledWith(7, {
      context_count: 0,
      trigger_count: 0,
      enrichment_table_count: 0,
    });
  });

  it('rethrows HttpException as-is', async () => {
    const httpErr = new HttpException('forbidden', 403);
    (dbService.handlePostExecuteSqlStatement as jest.Mock).mockRejectedValue(httpErr);

    await expect(recalculateGenerationCounts(7)).rejects.toBe(httpErr);
  });

  it('wraps unknown Error in HttpException 500', async () => {
    (dbService.handlePostExecuteSqlStatement as jest.Mock).mockRejectedValue(new Error('timeout'));

    await expect(recalculateGenerationCounts(7)).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value in HttpException 500', async () => {
    (dbService.handlePostExecuteSqlStatement as jest.Mock).mockRejectedValue('string error');

    await expect(recalculateGenerationCounts(7)).rejects.toMatchObject({ status: 500 });
  });
});

// ── getGenerationSummary ─────────────────────────────────────────────────────

describe('getGenerationSummary', () => {
  const mockSummary = { generationId: 1, contextCount: 2, triggerCount: 3 } as any;

  it('returns summary from repo', async () => {
    (generationsRepo.getGenerationSummaryFromDb as jest.Mock).mockResolvedValue(mockSummary);

    const result = await getGenerationSummary(1);

    expect(result).toBe(mockSummary);
    expect(generationsRepo.getGenerationSummaryFromDb).toHaveBeenCalledWith(1);
  });

  it('returns null when no summary exists', async () => {
    (generationsRepo.getGenerationSummaryFromDb as jest.Mock).mockResolvedValue(null);

    expect(await getGenerationSummary(1)).toBeNull();
  });

  it('rethrows HttpException as-is', async () => {
    const httpErr = new HttpException('not found', 404);
    (generationsRepo.getGenerationSummaryFromDb as jest.Mock).mockRejectedValue(httpErr);

    await expect(getGenerationSummary(1)).rejects.toBe(httpErr);
  });

  it('wraps unknown Error in HttpException 500', async () => {
    (generationsRepo.getGenerationSummaryFromDb as jest.Mock).mockRejectedValue(new Error('db fail'));

    await expect(getGenerationSummary(1)).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value in HttpException 500', async () => {
    (generationsRepo.getGenerationSummaryFromDb as jest.Mock).mockRejectedValue('string error');

    await expect(getGenerationSummary(1)).rejects.toMatchObject({ status: 500 });
  });
});
