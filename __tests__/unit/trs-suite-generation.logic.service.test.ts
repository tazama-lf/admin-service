// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/suite-generations.repository', () => ({
  createSuiteGenerationInDb: jest.fn(),
  getGenerationsBySuiteId: jest.fn(),
  getLatestGenerationBySuiteId: jest.fn(),
  getGenerationByIdFromDb: jest.fn(),
  cloneGenerationDataInDb: jest.fn(),
  updateWizardProgressInDb: jest.fn(),
  updateGenerationCountsInDb: jest.fn(),
  getGenerationSummaryFromDb: jest.fn(),
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
import * as triggerConfigsRepo from '../../src/repositories/simulation-studio/trigger-txtp-configs.repository';
import * as dbService from '../../src/services/database.logic.service';
import {
  createSuiteGeneration,
  getGenerationsForSuite,
  getLatestGenerationForSuite,
  resumeGeneration,
  cloneGeneration,
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
  status: 'DRAFT' as any,
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
  it('creates generation row using atomic repository insert', async () => {
    (generationsRepo.createSuiteGenerationInDb as jest.Mock).mockResolvedValue(mockGeneration);

    const result = await createSuiteGeneration(mockSuite, 'user-1', 'user@test.com');

    expect(result).toEqual(mockGeneration);
    expect(generationsRepo.createSuiteGenerationInDb).toHaveBeenCalledWith(
      expect.objectContaining({ suite_id: 42, simulation_type: 'SINGLE_RULE' }),
      'user-1',
      'user@test.com',
    );
  });

  it('works without userEmail', async () => {
    (generationsRepo.createSuiteGenerationInDb as jest.Mock).mockResolvedValue({ ...mockGeneration, generation_number: 2 });

    const result = await createSuiteGeneration(mockSuite, 'user-1');

    expect(result.generation_number).toBe(2);
    expect(generationsRepo.createSuiteGenerationInDb).toHaveBeenCalledWith(expect.anything(), 'user-1', undefined);
  });

  it('passes wizard_progress as wizard_snapshot', async () => {
    (generationsRepo.createSuiteGenerationInDb as jest.Mock).mockResolvedValue(mockGeneration);
    const suiteWithProgress = { ...mockSuite, wizard_progress: { currentStep: 1, completedSteps: [1] } };

    await createSuiteGeneration(suiteWithProgress, 'user-1');

    expect(generationsRepo.createSuiteGenerationInDb).toHaveBeenCalledWith(
      expect.objectContaining({ wizard_snapshot: { currentStep: 1, completedSteps: [1] } }),
      expect.any(String),
      undefined,
    );
  });

  it('rethrows HttpException as-is', async () => {
    const httpErr = new HttpException('conflict', 409);
    (generationsRepo.createSuiteGenerationInDb as jest.Mock).mockRejectedValue(httpErr);
    await expect(createSuiteGeneration(mockSuite, 'user-1')).rejects.toBe(httpErr);
  });

  it('wraps unknown Error in HttpException 500', async () => {
    (generationsRepo.createSuiteGenerationInDb as jest.Mock).mockRejectedValue(new Error('DB down'));
    await expect(createSuiteGeneration(mockSuite, 'user-1')).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value in HttpException 500', async () => {
    (generationsRepo.createSuiteGenerationInDb as jest.Mock).mockRejectedValue('string error');
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
    it('returns latest generation for suite', async () => {
      const resumed = { id: 1, suite_id: 42 } as any;
      (generationsRepo.getLatestGenerationBySuiteId as jest.Mock).mockResolvedValue(resumed as never);

      await expect(resumeGeneration(42)).resolves.toBe(resumed);
      expect(generationsRepo.getLatestGenerationBySuiteId).toHaveBeenCalledWith(42);
    });

    it('returns null when no generation exists', async () => {
      (generationsRepo.getLatestGenerationBySuiteId as jest.Mock).mockResolvedValue(null as never);
      await expect(resumeGeneration(42)).resolves.toBeNull();
    });

    it('wraps repository errors in HttpException 500', async () => {
      (generationsRepo.getLatestGenerationBySuiteId as jest.Mock).mockRejectedValue(new Error('db down') as never);
      await expect(resumeGeneration(42)).rejects.toMatchObject({ status: 500 });
    });
  });

  // ── cloneGeneration ──────────────────────────────────────────────────────────

  describe('cloneGeneration', () => {
    const sourceGen = { id: 5, suite_id: 42, generation_number: 1 } as any;
    const clonedGen = { id: 6, suite_id: 42, generation_number: 2 } as any;

    it('clones generation with next generation number', async () => {
      (generationsRepo.getGenerationByIdFromDb as jest.Mock).mockResolvedValue(sourceGen);
      (generationsRepo.getNextGenerationNumber as jest.Mock).mockResolvedValue(2);
      (generationsRepo.cloneGenerationDataInDb as jest.Mock).mockResolvedValue(clonedGen);

      const result = await cloneGeneration(5, 'user-2', 'user2@test.com');

      expect(result).toEqual(clonedGen);
      expect(generationsRepo.getGenerationByIdFromDb).toHaveBeenCalledWith(5);
      expect(generationsRepo.getNextGenerationNumber).toHaveBeenCalledWith(42);
      expect(generationsRepo.cloneGenerationDataInDb).toHaveBeenCalledWith(5, 42, 2, 'user-2', 'user2@test.com');
    });

    it('works without userEmail', async () => {
      (generationsRepo.getGenerationByIdFromDb as jest.Mock).mockResolvedValue(sourceGen);
      (generationsRepo.getNextGenerationNumber as jest.Mock).mockResolvedValue(2);
      (generationsRepo.cloneGenerationDataInDb as jest.Mock).mockResolvedValue(clonedGen);

      await cloneGeneration(5, 'user-2');

      expect(generationsRepo.cloneGenerationDataInDb).toHaveBeenCalledWith(5, 42, 2, 'user-2', undefined);
    });

    it('throws 404 when source generation not found', async () => {
      (generationsRepo.getGenerationByIdFromDb as jest.Mock).mockResolvedValue(null);

      await expect(cloneGeneration(999, 'user-2')).rejects.toMatchObject({
        status: 404,
        message: expect.stringContaining('not found'),
      });
      expect(generationsRepo.getNextGenerationNumber).not.toHaveBeenCalled();
    });

    it('rethrows HttpException from repository as-is', async () => {
      const httpErr = new HttpException('source locked', 409);
      (generationsRepo.getGenerationByIdFromDb as jest.Mock).mockRejectedValue(httpErr);

      await expect(cloneGeneration(5, 'user-2')).rejects.toBe(httpErr);
    });

    it('wraps unknown Error in HttpException 500', async () => {
      (generationsRepo.getGenerationByIdFromDb as jest.Mock).mockRejectedValue(new Error('db error'));

      await expect(cloneGeneration(5, 'user-2')).rejects.toMatchObject({ status: 500 });
    });

    it('wraps non-Error thrown value in HttpException 500', async () => {
      (generationsRepo.getGenerationByIdFromDb as jest.Mock).mockRejectedValue('unknown error');

      await expect(cloneGeneration(5, 'user-2')).rejects.toMatchObject({ status: 500 });
    });

    it('passes source suite_id to getNextGenerationNumber', async () => {
      const sourceWithDiffSuite = { ...sourceGen, suite_id: 99 };
      (generationsRepo.getGenerationByIdFromDb as jest.Mock).mockResolvedValue(sourceWithDiffSuite);
      (generationsRepo.getNextGenerationNumber as jest.Mock).mockResolvedValue(3);
      (generationsRepo.cloneGenerationDataInDb as jest.Mock).mockResolvedValue({ ...clonedGen, suite_id: 99 });

      await cloneGeneration(5, 'user-2');

      expect(generationsRepo.getNextGenerationNumber).toHaveBeenCalledWith(99);
    });
  });

  // ── updateWizardProgress ─────────────────────────────────────────────────────

  describe('updateWizardProgress', () => {
    it('updates wizard progress successfully', async () => {
      (generationsRepo.updateWizardProgressInDb as jest.Mock).mockResolvedValue(undefined);

      await updateWizardProgress(1, 2, [1, 2]);

      expect(generationsRepo.updateWizardProgressInDb).toHaveBeenCalledWith(1, 2, [1, 2]);
    });

    it('rethrows HttpException from repository', async () => {
      const httpErr = new HttpException('read-only', 403);
      (generationsRepo.updateWizardProgressInDb as jest.Mock).mockRejectedValue(httpErr);

      await expect(updateWizardProgress(1, 2, [1, 2])).rejects.toBe(httpErr);
    });

    it('wraps unknown Error in HttpException 500', async () => {
      (generationsRepo.updateWizardProgressInDb as jest.Mock).mockRejectedValue(new Error('db fail'));

      await expect(updateWizardProgress(1, 2, [1, 2])).rejects.toMatchObject({ status: 500 });
    });

    it('wraps non-Error thrown value in HttpException 500', async () => {
      (generationsRepo.updateWizardProgressInDb as jest.Mock).mockRejectedValue('error string');

      await expect(updateWizardProgress(1, 2, [1, 2])).rejects.toMatchObject({ status: 500 });
    });
  });

  // ── deleteTriggerTxtpConfig ──────────────────────────────────────────────────

  describe('deleteTriggerTxtpConfig', () => {
    it('deletes trigger config successfully', async () => {
      (triggerConfigsRepo.deleteTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(true);

      await deleteTriggerTxtpConfig(10);

      expect(triggerConfigsRepo.deleteTriggerTxtpConfigInDb).toHaveBeenCalledWith(10);
    });

    it('throws 404 when trigger config not found', async () => {
      (triggerConfigsRepo.deleteTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(false);

      await expect(deleteTriggerTxtpConfig(999)).rejects.toMatchObject({
        status: 404,
        message: expect.stringContaining('not found'),
      });
    });

    it('rethrows HttpException from repository', async () => {
      const httpErr = new HttpException('in use', 409);
      (triggerConfigsRepo.deleteTriggerTxtpConfigInDb as jest.Mock).mockRejectedValue(httpErr);

      await expect(deleteTriggerTxtpConfig(10)).rejects.toBe(httpErr);
    });

    it('wraps unknown Error in HttpException 500', async () => {
      (triggerConfigsRepo.deleteTriggerTxtpConfigInDb as jest.Mock).mockRejectedValue(new Error('db down'));

      await expect(deleteTriggerTxtpConfig(10)).rejects.toMatchObject({ status: 500 });
    });

    it('wraps non-Error thrown value in HttpException 500', async () => {
      (triggerConfigsRepo.deleteTriggerTxtpConfigInDb as jest.Mock).mockRejectedValue('error');

      await expect(deleteTriggerTxtpConfig(10)).rejects.toMatchObject({ status: 500 });
    });
  });

  // ── recalculateGenerationCounts ──────────────────────────────────────────────

  describe('recalculateGenerationCounts', () => {
    it('recalculates and updates counts from all three tables', async () => {
      (dbService.handlePostExecuteSqlStatement as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '5' }] })
        .mockResolvedValueOnce({ rows: [{ total: '3' }] })
        .mockResolvedValueOnce({ rows: [{ total: '2' }] });
      (generationsRepo.updateGenerationCountsInDb as jest.Mock).mockResolvedValue(undefined);

      await recalculateGenerationCounts(1);

      expect(dbService.handlePostExecuteSqlStatement).toHaveBeenCalledTimes(3);
      expect(generationsRepo.updateGenerationCountsInDb).toHaveBeenCalledWith(1, {
        context_count: 5,
        trigger_count: 3,
        enrichment_table_count: 2,
      });
    });

    it('handles zero counts from empty tables', async () => {
      (dbService.handlePostExecuteSqlStatement as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });
      (generationsRepo.updateGenerationCountsInDb as jest.Mock).mockResolvedValue(undefined);

      await recalculateGenerationCounts(1);

      expect(generationsRepo.updateGenerationCountsInDb).toHaveBeenCalledWith(1, {
        context_count: 0,
        trigger_count: 0,
        enrichment_table_count: 0,
      });
    });

    it('rethrows HttpException from database or repository', async () => {
      const httpErr = new HttpException('forbidden', 403);
      (dbService.handlePostExecuteSqlStatement as jest.Mock).mockRejectedValue(httpErr);

      await expect(recalculateGenerationCounts(1)).rejects.toBe(httpErr);
    });

    it('wraps unknown Error in HttpException 500', async () => {
      (dbService.handlePostExecuteSqlStatement as jest.Mock).mockRejectedValue(new Error('connection fail'));

      await expect(recalculateGenerationCounts(1)).rejects.toMatchObject({ status: 500 });
    });

    it('wraps non-Error thrown value in HttpException 500', async () => {
      (dbService.handlePostExecuteSqlStatement as jest.Mock).mockRejectedValue('network error');

      await expect(recalculateGenerationCounts(1)).rejects.toMatchObject({ status: 500 });
    });

    it('parses string totals as base-10 integers', async () => {
      (dbService.handlePostExecuteSqlStatement as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '10' }] })
        .mockResolvedValueOnce({ rows: [{ total: '20' }] })
        .mockResolvedValueOnce({ rows: [{ total: '30' }] });
      (generationsRepo.updateGenerationCountsInDb as jest.Mock).mockResolvedValue(undefined);

      await recalculateGenerationCounts(1);

      const call = (generationsRepo.updateGenerationCountsInDb as jest.Mock).mock.calls[0];
      expect(call[1]).toEqual({
        context_count: 10,
        trigger_count: 20,
        enrichment_table_count: 30,
      });
    });
  });

  // ── getGenerationSummary ─────────────────────────────────────────────────────

  describe('getGenerationSummary', () => {
    const summary = {
      id: 1,
      suite_id: 42,
      generation_number: 1,
      context_configs: [],
      trigger_configs: [],
      enrichment_tables: [],
    } as any;

    it('returns generation summary when found', async () => {
      (generationsRepo.getGenerationSummaryFromDb as jest.Mock).mockResolvedValue(summary);

      const result = await getGenerationSummary(1);

      expect(result).toEqual(summary);
      expect(generationsRepo.getGenerationSummaryFromDb).toHaveBeenCalledWith(1);
    });

    it('returns null when generation not found', async () => {
      (generationsRepo.getGenerationSummaryFromDb as jest.Mock).mockResolvedValue(null);

      const result = await getGenerationSummary(999);

      expect(result).toBeNull();
    });

    it('rethrows HttpException from repository', async () => {
      const httpErr = new HttpException('access denied', 403);
      (generationsRepo.getGenerationSummaryFromDb as jest.Mock).mockRejectedValue(httpErr);

      await expect(getGenerationSummary(1)).rejects.toBe(httpErr);
    });

    it('wraps unknown Error in HttpException 500', async () => {
      (generationsRepo.getGenerationSummaryFromDb as jest.Mock).mockRejectedValue(new Error('db timeout'));

      await expect(getGenerationSummary(1)).rejects.toMatchObject({ status: 500 });
    });

    it('wraps non-Error thrown value in HttpException 500', async () => {
      (generationsRepo.getGenerationSummaryFromDb as jest.Mock).mockRejectedValue('error');

      await expect(getGenerationSummary(1)).rejects.toMatchObject({ status: 500 });
    });
  });
});
