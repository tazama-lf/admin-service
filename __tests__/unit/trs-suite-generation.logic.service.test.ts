// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/suite-generations.repository', () => ({
  createSuiteGenerationInDb: jest.fn(),
  getGenerationsBySuiteId: jest.fn(),
  getLatestGenerationBySuiteId: jest.fn(),
  resumeGenerationInDb: jest.fn(),
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
import {
  createSuiteGeneration,
  getGenerationsForSuite,
  getLatestGenerationForSuite,
  resumeGeneration,
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
  });
});
