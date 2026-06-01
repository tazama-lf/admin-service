// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/suite-generations.repository', () => ({
  createSuiteGenerationInDb: jest.fn(),
  getNextGenerationNumber: jest.fn(),
  getGenerationsBySuiteId: jest.fn(),
  getLatestGenerationBySuiteId: jest.fn(),
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

jest.mock('../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
  configuration: {},
}));

import { HttpException } from '../../src/utils/error';
import * as generationsRepo from '../../src/repositories/simulation-studio/suite-generations.repository';
import * as contextConfigRepo from '../../src/repositories/simulation-studio/context-txtp-configs.repository';
import * as fieldStrategyRepo from '../../src/repositories/simulation-studio/context-field-strategies.repository';
import * as tcsRepo from '../../src/repositories/configuration/tcs.config.repository';
import {
  createSuiteGeneration,
  createContextTxtpConfig,
  updateContextTxtpConfig,
  upsertContextFieldStrategies,
  getGenerationsForSuite,
  getLatestGenerationForSuite,
  getContextConfigsForGeneration,
  getFieldStrategiesForContextConfig,
} from '../../src/services/trs-suite-generation.logic.service';
import type { SimulationSuite } from '../../src/interface/simulation-suites.interface';
import type { SuiteGeneration, SuiteContextTxtpConfig, ContextFieldStrategy } from '../../src/interface/suite-generation.interface';

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

const mockContextConfig: SuiteContextTxtpConfig = {
  id: 1,
  generation_id: 1,
  txtp: 'pacs.008',
  txtp_version: '001.08',
  display_order: 1,
  message_count: 1,
  schema_snapshot: {},
  created_at: new Date(),
  updated_at: new Date(),
};

const mockFieldStrategy: ContextFieldStrategy = {
  id: 1,
  context_txtp_config_id: 1,
  field_path: 'CdtTrfTxInf.IntrBkSttlmAmt.value',
  strategy_code: 'static',
  static_value: 999,
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => jest.clearAllMocks());

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

  it('wraps unknown errors in HttpException', async () => {
    (generationsRepo.getNextGenerationNumber as jest.Mock).mockRejectedValue(new Error('DB down'));

    await expect(createSuiteGeneration(mockSuite, 'user-1')).rejects.toMatchObject({ status: 500 });
  });
});

describe('createContextTxtpConfig', () => {
  it('fetches schema from tcs_config and inserts context config row', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue({
      schema: { type: 'object' },
      content_type: 'JSON',
      payload_json: { test: 'payload' },
    });
    (contextConfigRepo.createContextTxtpConfigInDb as jest.Mock).mockResolvedValue(mockContextConfig);

    const result = await createContextTxtpConfig(1, 'pacs.008', '001.08', 'tenant-001');

    expect(result).toEqual(mockContextConfig);
    expect(tcsRepo.getSchemaByTransactionType).toHaveBeenCalledWith('pacs.008', '001.08', 'tenant-001');
    expect(contextConfigRepo.createContextTxtpConfigInDb).toHaveBeenCalledWith(
      expect.objectContaining({ generation_id: 1, txtp: 'pacs.008', txtp_version: '001.08' }),
    );
  });

  it('returns null silently when tcs_config row not found', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockRejectedValue(new Error('Not found'));

    const result = await createContextTxtpConfig(1, 'pacs.008', '001.08', 'tenant-001');

    expect(result).toBeNull();
  });

  it('uses payload_xml branch when content_type is not JSON', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue({
      schema: { type: 'object' },
      content_type: 'XML',
      payload_xml: { xml: 'data' },
    });
    (contextConfigRepo.createContextTxtpConfigInDb as jest.Mock).mockResolvedValue(mockContextConfig);

    await createContextTxtpConfig(1, 'pacs.008', '001.08', 'tenant-001');

    expect(contextConfigRepo.createContextTxtpConfigInDb).toHaveBeenCalledWith(
      expect.objectContaining({ sample_payload_snapshot: { xml: 'data' } }),
    );
  });

  it('wraps createContextTxtpConfigInDb error in HttpException', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue({
      schema: {},
      content_type: 'JSON',
      payload_json: {},
    });
    (contextConfigRepo.createContextTxtpConfigInDb as jest.Mock).mockRejectedValue(new Error('insert failed'));

    await expect(createContextTxtpConfig(1, 'pacs.008', '001.08', 'tenant-001')).rejects.toMatchObject({ status: 500 });
  });
});

describe('updateContextTxtpConfig', () => {
  it('calls updateContextTxtpConfigInDb and returns updated row', async () => {
    const updated = { ...mockContextConfig, message_count: 5 };
    (contextConfigRepo.updateContextTxtpConfigInDb as jest.Mock).mockResolvedValue(updated);

    const result = await updateContextTxtpConfig(1, { message_count: 5 });

    expect(result).toEqual(updated);
    expect(contextConfigRepo.updateContextTxtpConfigInDb).toHaveBeenCalledWith(1, { message_count: 5 });
  });

  it('throws 404 when config not found', async () => {
    (contextConfigRepo.updateContextTxtpConfigInDb as jest.Mock).mockResolvedValue(null);

    await expect(updateContextTxtpConfig(99, { message_count: 5 })).rejects.toMatchObject({ status: 404 });
  });
});

describe('upsertContextFieldStrategies', () => {
  it('upserts all strategies and returns array', async () => {
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await upsertContextFieldStrategies(1, [
      { field_path: 'CdtTrfTxInf.IntrBkSttlmAmt.value', strategy_code: 'static', static_value: 999 },
    ]);

    expect(result).toEqual([mockFieldStrategy]);
    expect(fieldStrategyRepo.upsertFieldStrategyInDb).toHaveBeenCalledTimes(1);
  });

  it('upserts multiple strategies in parallel', async () => {
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const strategies = [
      { field_path: 'field.a', strategy_code: 'keep_sample' as const },
      { field_path: 'field.b', strategy_code: 'null' as const },
      { field_path: 'field.c', strategy_code: 'skip' as const },
    ];
    await upsertContextFieldStrategies(1, strategies);

    expect(fieldStrategyRepo.upsertFieldStrategyInDb).toHaveBeenCalledTimes(3);
  });
});

describe('getGenerationsForSuite', () => {
  it('returns generations array', async () => {
    (generationsRepo.getGenerationsBySuiteId as jest.Mock).mockResolvedValue([mockGeneration]);

    const result = await getGenerationsForSuite(42);

    expect(result).toEqual([mockGeneration]);
    expect(generationsRepo.getGenerationsBySuiteId).toHaveBeenCalledWith(42);
  });

  it('wraps error in HttpException', async () => {
    (generationsRepo.getGenerationsBySuiteId as jest.Mock).mockRejectedValue(new Error('fail'));

    await expect(getGenerationsForSuite(42)).rejects.toMatchObject({ status: 500 });
  });
});

describe('getLatestGenerationForSuite', () => {
  it('returns latest generation', async () => {
    (generationsRepo.getLatestGenerationBySuiteId as jest.Mock).mockResolvedValue(mockGeneration);

    const result = await getLatestGenerationForSuite(42);

    expect(result).toEqual(mockGeneration);
  });

  it('returns null when no generations exist', async () => {
    (generationsRepo.getLatestGenerationBySuiteId as jest.Mock).mockResolvedValue(null);

    const result = await getLatestGenerationForSuite(42);

    expect(result).toBeNull();
  });
});

describe('getContextConfigsForGeneration', () => {
  it('returns context configs array', async () => {
    (contextConfigRepo.getContextTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([mockContextConfig]);

    const result = await getContextConfigsForGeneration(1);

    expect(result).toEqual([mockContextConfig]);
  });
});

describe('getFieldStrategiesForContextConfig', () => {
  it('returns field strategies array', async () => {
    (fieldStrategyRepo.getFieldStrategiesByContextConfigId as jest.Mock).mockResolvedValue([mockFieldStrategy]);

    const result = await getFieldStrategiesForContextConfig(1);

    expect(result).toEqual([mockFieldStrategy]);
    expect(fieldStrategyRepo.getFieldStrategiesByContextConfigId).toHaveBeenCalledWith(1);
  });

  it('wraps error in HttpException', async () => {
    (fieldStrategyRepo.getFieldStrategiesByContextConfigId as jest.Mock).mockRejectedValue(new Error('fail'));

    await expect(getFieldStrategiesForContextConfig(1)).rejects.toMatchObject({ status: 500 });
  });
});

describe('error propagation', () => {
  it('createSuiteGeneration rethrows HttpException as-is', async () => {
    const httpErr = new HttpException('already thrown', 409);
    (generationsRepo.getNextGenerationNumber as jest.Mock).mockRejectedValue(httpErr);

    await expect(createSuiteGeneration(mockSuite, 'user-1')).rejects.toBe(httpErr);
  });

  it('updateContextTxtpConfig rethrows HttpException as-is', async () => {
    const httpErr = new HttpException('already thrown', 409);
    (contextConfigRepo.updateContextTxtpConfigInDb as jest.Mock).mockRejectedValue(httpErr);

    await expect(updateContextTxtpConfig(1, { message_count: 5 })).rejects.toBe(httpErr);
  });

  it('updateContextTxtpConfig wraps non-HttpException error', async () => {
    (contextConfigRepo.updateContextTxtpConfigInDb as jest.Mock).mockRejectedValue(new Error('plain error'));

    await expect(updateContextTxtpConfig(1, { message_count: 5 })).rejects.toMatchObject({ status: 500 });
  });

  it('upsertContextFieldStrategies wraps error in HttpException', async () => {
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockRejectedValue(new Error('DB error'));

    await expect(upsertContextFieldStrategies(1, [{ field_path: 'a', strategy_code: 'null' }])).rejects.toMatchObject({ status: 500 });
  });

  it('getContextConfigsForGeneration wraps error in HttpException', async () => {
    (contextConfigRepo.getContextTxtpConfigsByGenerationId as jest.Mock).mockRejectedValue(new Error('fail'));

    await expect(getContextConfigsForGeneration(1)).rejects.toMatchObject({ status: 500 });
  });

  it('getLatestGenerationForSuite wraps error in HttpException', async () => {
    (generationsRepo.getLatestGenerationBySuiteId as jest.Mock).mockRejectedValue(new Error('fail'));

    await expect(getLatestGenerationForSuite(42)).rejects.toMatchObject({ status: 500 });
  });
});
