// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/trigger-txtp-configs.repository', () => ({
  createTriggerTxtpConfigInDb: jest.fn(),
  updateTriggerTxtpConfigInDb: jest.fn(),
  getTriggerTxtpConfigsByGenerationId: jest.fn(),
  getTriggerTxtpConfigByIdInDb: jest.fn(),
}));

jest.mock('../../src/repositories/simulation-studio/trigger-field-strategies.repository', () => ({
  upsertTriggerFieldStrategyInDb: jest.fn(),
  getTriggerFieldStrategiesByConfigId: jest.fn(),
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
import * as triggerConfigRepo from '../../src/repositories/simulation-studio/trigger-txtp-configs.repository';
import * as triggerStrategyRepo from '../../src/repositories/simulation-studio/trigger-field-strategies.repository';
import * as tcsRepo from '../../src/repositories/configuration/tcs.config.repository';
import {
  createTriggerConfigWithDefaultStrategies,
  createTriggerTxtpConfig,
  addTriggerTxtpConfig,
  getTriggerConfigsWithStrategies,
  bulkUpdateTriggerConfigs,
  getTriggerFieldStrategiesForConfig,
  getTriggerConfigById,
} from '../../src/services/trigger-txtp-config.logic.service';
import type { SuiteTriggerTxtpConfig, TriggerFieldStrategy } from '../../src/interface/simulation-studio/suite-generation.interface';

const mockTriggerConfig: SuiteTriggerTxtpConfig = {
  id: 20,
  generation_id: 1,
  txtp: 'pacs.008',
  txtp_version: '001.08',
  display_order: 1,
  message_count: 1,
  link_to_context_pairs: false,
  payload_template_json: { amount: 100, currency: 'USD' },
  generator_profile: {},
  created_at: new Date(),
};

const mockFieldStrategy: TriggerFieldStrategy = {
  id: 1,
  trigger_txtp_config_id: 20,
  field_path: 'amount',
  strategy_code: 'null',
  generator_options: {},
  created_at: new Date(),
};

const tcsRowJson = {
  schema: { type: 'object', properties: { amount: {}, currency: {} } },
  content_type: 'application/json',
  payload_json: { amount: 100, currency: 'USD' },
  payload_xml: null,
  related_transaction: null,
};

const tcsRowJsonWithRelated = {
  ...tcsRowJson,
  related_transaction: '/default/1.0.0/test/pacs.002.001.10',
};

const relatedTcsTriggerRow = {
  schema: { type: 'object', properties: { id: {} } },
  content_type: 'application/json',
  payload_json: { id: 'abc' },
  payload_xml: null,
  transaction_type: 'pacs.002.001.10',
  version: '001.10',
};

const tcsRowXml = {
  schema: { type: 'object' },
  content_type: 'application/xml',
  payload_xml: { amount: '<xml>' },
  payload_json: null,
  related_transaction: null,
};

beforeEach(() => jest.clearAllMocks());

// ── createTriggerConfigWithDefaultStrategies ─────────────────────────────────

describe('createTriggerConfigWithDefaultStrategies', () => {
  it('fetches payload, inserts config, seeds null strategy for each payload field', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    (triggerConfigRepo.createTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(mockTriggerConfig);
    (triggerStrategyRepo.upsertTriggerFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await createTriggerConfigWithDefaultStrategies({
      generationId: 1,
      txtp: 'pacs.008',
      txtpVersion: '001.08',
      messageCount: 1,
      displayOrder: 1,
      tenantId: 'tenant-001',
    });

    expect(tcsRepo.getSchemaByTransactionType).toHaveBeenCalledWith('pacs.008', '001.08', 'tenant-001');
    expect(triggerConfigRepo.createTriggerTxtpConfigInDb).toHaveBeenCalledWith(
      expect.objectContaining({
        generation_id: 1,
        txtp: 'pacs.008',
        message_count: 1,
        payload_template_json: tcsRowJson.payload_json,
      }),
    );
    // payload has 2 leaf fields: amount, currency
    expect(triggerStrategyRepo.upsertTriggerFieldStrategyInDb).toHaveBeenCalledTimes(2);
    expect(triggerStrategyRepo.upsertTriggerFieldStrategyInDb).toHaveBeenCalledWith(20, expect.objectContaining({ strategy_code: 'null' }));
    expect(result.trigger_txtp_config_id).toBe(20);
    expect(result.field_strategies).toHaveLength(2);
  });

  it('uses payload_xml when content_type is XML', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowXml);
    (triggerConfigRepo.createTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(mockTriggerConfig);
    (triggerStrategyRepo.upsertTriggerFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await createTriggerConfigWithDefaultStrategies({
      generationId: 1,
      txtp: 'pacs.008',
      txtpVersion: '001.08',
      messageCount: 1,
      displayOrder: 1,
      tenantId: 'tenant-001',
    });

    expect(triggerConfigRepo.createTriggerTxtpConfigInDb).toHaveBeenCalledWith(
      expect.objectContaining({ payload_template_json: tcsRowXml.payload_xml }),
    );
  });

  it('seeds no strategies when payload is null', async () => {
    const tcsNoPayload = { ...tcsRowJson, payload_json: null };
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsNoPayload);
    (triggerConfigRepo.createTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue({ ...mockTriggerConfig, payload_template_json: {} });
    (triggerStrategyRepo.upsertTriggerFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await createTriggerConfigWithDefaultStrategies({
      generationId: 1,
      txtp: 'pacs.008',
      txtpVersion: '001.08',
      messageCount: 1,
      displayOrder: 1,
      tenantId: 'tenant-001',
    });

    expect(triggerStrategyRepo.upsertTriggerFieldStrategyInDb).not.toHaveBeenCalled();
    expect(result.field_strategies).toHaveLength(0);
  });

  it('flattens nested payload objects recursively', async () => {
    const nestedPayload = { transaction: { amount: 100, currency: 'USD' } };
    const tcsNestedPayload = { ...tcsRowJson, payload_json: nestedPayload };
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsNestedPayload);
    (triggerConfigRepo.createTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue({
      ...mockTriggerConfig,
      payload_template_json: nestedPayload,
    });
    (triggerStrategyRepo.upsertTriggerFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await createTriggerConfigWithDefaultStrategies({
      generationId: 1,
      txtp: 'pacs.008',
      txtpVersion: '001.08',
      messageCount: 1,
      displayOrder: 1,
      tenantId: 'tenant-001',
    });

    expect(triggerStrategyRepo.upsertTriggerFieldStrategyInDb).toHaveBeenCalledTimes(2);
    expect(triggerStrategyRepo.upsertTriggerFieldStrategyInDb).toHaveBeenCalledWith(
      20,
      expect.objectContaining({ field_path: 'transaction.amount' }),
    );
    expect(triggerStrategyRepo.upsertTriggerFieldStrategyInDb).toHaveBeenCalledWith(
      20,
      expect.objectContaining({ field_path: 'transaction.currency' }),
    );
  });

  it('throws when tcs_config row not found', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockRejectedValue(new Error('Not found'));
    await expect(
      createTriggerConfigWithDefaultStrategies({
        generationId: 1,
        txtp: 'x',
        txtpVersion: '1',
        messageCount: 1,
        displayOrder: 1,
        tenantId: 'tenant',
      }),
    ).rejects.toThrow('Not found');
  });
});

// ── createTriggerTxtpConfig ──────────────────────────────────────────────────

describe('createTriggerTxtpConfig', () => {
  it('calls factory with display_order=1 and message_count=1', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    (triggerConfigRepo.createTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(mockTriggerConfig);
    (triggerStrategyRepo.upsertTriggerFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await createTriggerTxtpConfig(1, 'pacs.008', '001.08', 'tenant-001');

    expect(triggerConfigRepo.createTriggerTxtpConfigInDb).toHaveBeenCalledWith(
      expect.objectContaining({ display_order: 1, message_count: 1 }),
    );
  });

  it('wraps error in HttpException 500', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(createTriggerTxtpConfig(1, 'pacs.008', '001.08', 'tenant-001')).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('bad', 404);
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockRejectedValue(err);
    await expect(createTriggerTxtpConfig(1, 'pacs.008', '001.08', 'tenant-001')).rejects.toBe(err);
  });

  it('wraps non-Error thrown value', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockRejectedValue('string error');
    await expect(createTriggerTxtpConfig(1, 'pacs.008', '001.08', 'tenant-001')).rejects.toMatchObject({ status: 500 });
  });

  it('skips related trigger config when related_transaction is null', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    (triggerConfigRepo.createTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(mockTriggerConfig);
    (triggerStrategyRepo.upsertTriggerFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await createTriggerTxtpConfig(1, 'pacs.008', '001.08', 'tenant-001');

    expect(tcsRepo.getSchemaByTransactionType).toHaveBeenCalledTimes(1);
    expect(triggerConfigRepo.createTriggerTxtpConfigInDb).toHaveBeenCalledTimes(1);
  });
});

// ── addTriggerTxtpConfig ─────────────────────────────────────────────────────

describe('addTriggerTxtpConfig', () => {
  it('sets display_order = existing count + 1', async () => {
    (triggerConfigRepo.getTriggerTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([mockTriggerConfig]);
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    (triggerConfigRepo.createTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue({ ...mockTriggerConfig, id: 21, display_order: 2 });
    (triggerStrategyRepo.upsertTriggerFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await addTriggerTxtpConfig(1, { txtp: 'pacs.002', txtp_version: '001.08', message_count: 2 }, 'tenant-001');

    expect(triggerConfigRepo.createTriggerTxtpConfigInDb).toHaveBeenCalledWith(
      expect.objectContaining({ display_order: 2, message_count: 2 }),
    );
    expect(result.trigger_txtp_config_id).toBe(21);
  });

  it('defaults message_count to 1 when not provided', async () => {
    (triggerConfigRepo.getTriggerTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([]);
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    (triggerConfigRepo.createTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(mockTriggerConfig);
    (triggerStrategyRepo.upsertTriggerFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await addTriggerTxtpConfig(1, { txtp: 'pacs.008', txtp_version: '001.08' }, 'tenant-001');

    expect(triggerConfigRepo.createTriggerTxtpConfigInDb).toHaveBeenCalledWith(
      expect.objectContaining({ message_count: 1, display_order: 1 }),
    );
  });

  it('updates related config when related_trigger_txtp_id provided', async () => {
    (triggerConfigRepo.getTriggerTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([mockTriggerConfig]);
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    const newConfig = { ...mockTriggerConfig, id: 21, display_order: 2 };
    (triggerConfigRepo.createTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(newConfig);
    (triggerStrategyRepo.upsertTriggerFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);
    (triggerConfigRepo.updateTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(mockTriggerConfig);

    await addTriggerTxtpConfig(1, { txtp: 'pacs.002', txtp_version: '001.08', related_trigger_txtp_id: 20 }, 'tenant-001');

    expect(triggerConfigRepo.updateTriggerTxtpConfigInDb).toHaveBeenCalledWith(20, { related_txtp_config_id: 21 });
  });

  it('wraps error in HttpException 500', async () => {
    (triggerConfigRepo.getTriggerTxtpConfigsByGenerationId as jest.Mock).mockRejectedValue(new Error('DB fail'));
    await expect(addTriggerTxtpConfig(1, { txtp: 'x', txtp_version: '1' }, 'tenant')).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('conflict', 409);
    (triggerConfigRepo.getTriggerTxtpConfigsByGenerationId as jest.Mock).mockRejectedValue(err);
    await expect(addTriggerTxtpConfig(1, { txtp: 'x', txtp_version: '1' }, 'tenant')).rejects.toBe(err);
  });
});

// ── getTriggerConfigsWithStrategies ──────────────────────────────────────────

describe('getTriggerConfigsWithStrategies', () => {
  it('returns all configs with their field strategies', async () => {
    (triggerConfigRepo.getTriggerTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([mockTriggerConfig]);
    (triggerStrategyRepo.getTriggerFieldStrategiesByConfigId as jest.Mock).mockResolvedValue([mockFieldStrategy]);

    const result = await getTriggerConfigsWithStrategies(1);

    expect(result).toHaveLength(1);
    expect(result[0].trigger_txtp_config_id).toBe(20);
    expect(result[0].related_txtp_config_id).toBeNull();
    expect(result[0].field_strategies).toEqual([mockFieldStrategy]);
    expect(triggerStrategyRepo.getTriggerFieldStrategiesByConfigId).toHaveBeenCalledWith(20);
  });

  it('returns empty array when no configs', async () => {
    (triggerConfigRepo.getTriggerTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([]);
    expect(await getTriggerConfigsWithStrategies(1)).toEqual([]);
  });

  it('fetches strategies for each config independently', async () => {
    const config2 = { ...mockTriggerConfig, id: 21, txtp: 'pacs.002', related_txtp_config_id: 20 };
    (triggerConfigRepo.getTriggerTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([mockTriggerConfig, config2]);
    (triggerStrategyRepo.getTriggerFieldStrategiesByConfigId as jest.Mock).mockResolvedValue([mockFieldStrategy]);

    const result = await getTriggerConfigsWithStrategies(1);

    expect(result).toHaveLength(2);
    expect(result[1].related_txtp_config_id).toBe(20);
    expect(triggerStrategyRepo.getTriggerFieldStrategiesByConfigId).toHaveBeenCalledTimes(2);
    expect(triggerStrategyRepo.getTriggerFieldStrategiesByConfigId).toHaveBeenCalledWith(20);
    expect(triggerStrategyRepo.getTriggerFieldStrategiesByConfigId).toHaveBeenCalledWith(21);
  });

  it('wraps error in HttpException 500', async () => {
    (triggerConfigRepo.getTriggerTxtpConfigsByGenerationId as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(getTriggerConfigsWithStrategies(1)).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value', async () => {
    (triggerConfigRepo.getTriggerTxtpConfigsByGenerationId as jest.Mock).mockRejectedValue('string error');
    await expect(getTriggerConfigsWithStrategies(1)).rejects.toMatchObject({ status: 500 });
  });
});

// ── bulkUpdateTriggerConfigs ─────────────────────────────────────────────────

describe('bulkUpdateTriggerConfigs', () => {
  beforeEach(() => {
    (triggerConfigRepo.getTriggerTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([mockTriggerConfig]);
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    (triggerStrategyRepo.getTriggerFieldStrategiesByConfigId as jest.Mock).mockResolvedValue([mockFieldStrategy]);
  });

  it('updates message_count and upserts strategies, returns updated configs', async () => {
    (triggerConfigRepo.updateTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(mockTriggerConfig);
    (triggerStrategyRepo.upsertTriggerFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await bulkUpdateTriggerConfigs(1, [
      {
        trigger_txtp_config_id: 20,
        message_count: 3,
        field_strategies: [{ field_path: 'amount', strategy_code: 'static', static_value: '999' }],
      },
    ]);

    expect(triggerConfigRepo.updateTriggerTxtpConfigInDb).toHaveBeenCalledWith(20, { message_count: 3 });
    expect(triggerStrategyRepo.upsertTriggerFieldStrategyInDb).toHaveBeenCalledWith(20, {
      field_path: 'amount',
      strategy_code: 'static',
      static_value: '999',
    });
    expect(result[0].trigger_txtp_config_id).toBe(20);
  });

  it('skips update when no scalar fields provided', async () => {
    (triggerStrategyRepo.upsertTriggerFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await bulkUpdateTriggerConfigs(1, [
      { trigger_txtp_config_id: 20, field_strategies: [{ field_path: 'amount', strategy_code: 'null' }] },
    ]);

    expect(triggerConfigRepo.updateTriggerTxtpConfigInDb).not.toHaveBeenCalled();
    expect(triggerStrategyRepo.upsertTriggerFieldStrategyInDb).toHaveBeenCalledTimes(1);
  });

  it('skips upsert when field_strategies is empty array', async () => {
    (triggerConfigRepo.updateTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(mockTriggerConfig);

    await bulkUpdateTriggerConfigs(1, [{ trigger_txtp_config_id: 20, message_count: 2, field_strategies: [] }]);

    expect(triggerStrategyRepo.upsertTriggerFieldStrategyInDb).not.toHaveBeenCalled();
  });

  it('skips upsert when field_strategies absent', async () => {
    (triggerConfigRepo.updateTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(mockTriggerConfig);

    await bulkUpdateTriggerConfigs(1, [{ trigger_txtp_config_id: 20, message_count: 2 }]);

    expect(triggerStrategyRepo.upsertTriggerFieldStrategyInDb).not.toHaveBeenCalled();
  });

  it('processes multiple items in parallel', async () => {
    const config2 = { ...mockTriggerConfig, id: 21 };
    (triggerConfigRepo.getTriggerTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([mockTriggerConfig, config2]);
    (triggerConfigRepo.updateTriggerTxtpConfigInDb as jest.Mock).mockResolvedValue(mockTriggerConfig);
    (triggerStrategyRepo.upsertTriggerFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await bulkUpdateTriggerConfigs(1, [
      { trigger_txtp_config_id: 20, message_count: 2 },
      {
        trigger_txtp_config_id: 21,
        message_count: 3,
        field_strategies: [{ field_path: 'amount', strategy_code: 'range', range_min: 1, range_max: 100 }],
      },
    ]);

    expect(triggerConfigRepo.updateTriggerTxtpConfigInDb).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });

  it('wraps error in HttpException 500', async () => {
    (triggerConfigRepo.updateTriggerTxtpConfigInDb as jest.Mock).mockRejectedValue(new Error('DB fail'));
    await expect(bulkUpdateTriggerConfigs(1, [{ trigger_txtp_config_id: 20, message_count: 2 }])).rejects.toMatchObject({
      status: 500,
    });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('not found', 404);
    (triggerConfigRepo.updateTriggerTxtpConfigInDb as jest.Mock).mockRejectedValue(err);
    await expect(bulkUpdateTriggerConfigs(1, [{ trigger_txtp_config_id: 20, message_count: 2 }])).rejects.toBe(err);
  });

  it('wraps non-Error thrown value', async () => {
    (triggerConfigRepo.updateTriggerTxtpConfigInDb as jest.Mock).mockRejectedValue('string error');
    await expect(bulkUpdateTriggerConfigs(1, [{ trigger_txtp_config_id: 20, message_count: 2 }])).rejects.toMatchObject({
      status: 500,
    });
  });
});

// ── getTriggerFieldStrategiesForConfig ───────────────────────────────────────

describe('getTriggerFieldStrategiesForConfig', () => {
  it('returns field strategies for a config', async () => {
    (triggerStrategyRepo.getTriggerFieldStrategiesByConfigId as jest.Mock).mockResolvedValue([mockFieldStrategy]);

    const result = await getTriggerFieldStrategiesForConfig(20);

    expect(result).toEqual([mockFieldStrategy]);
    expect(triggerStrategyRepo.getTriggerFieldStrategiesByConfigId).toHaveBeenCalledWith(20);
  });

  it('returns empty array when no strategies', async () => {
    (triggerStrategyRepo.getTriggerFieldStrategiesByConfigId as jest.Mock).mockResolvedValue([]);
    expect(await getTriggerFieldStrategiesForConfig(20)).toEqual([]);
  });

  it('wraps error in HttpException 500', async () => {
    (triggerStrategyRepo.getTriggerFieldStrategiesByConfigId as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(getTriggerFieldStrategiesForConfig(20)).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value', async () => {
    (triggerStrategyRepo.getTriggerFieldStrategiesByConfigId as jest.Mock).mockRejectedValue('string error');
    await expect(getTriggerFieldStrategiesForConfig(20)).rejects.toMatchObject({ status: 500 });
  });
});

// ── getTriggerConfigById ─────────────────────────────────────────────────────

describe('getTriggerConfigById', () => {
  it('returns config with field strategies when found', async () => {
    (triggerConfigRepo.getTriggerTxtpConfigByIdInDb as jest.Mock).mockResolvedValue(mockTriggerConfig);
    (triggerStrategyRepo.getTriggerFieldStrategiesByConfigId as jest.Mock).mockResolvedValue([mockFieldStrategy]);

    const result = await getTriggerConfigById(20);

    expect(result).not.toBeNull();
    expect(result!.trigger_txtp_config_id).toBe(20);
    expect(result!.txtp).toBe('pacs.008');
    expect(result!.field_strategies).toEqual([mockFieldStrategy]);
    expect(triggerConfigRepo.getTriggerTxtpConfigByIdInDb).toHaveBeenCalledWith(20);
    expect(triggerStrategyRepo.getTriggerFieldStrategiesByConfigId).toHaveBeenCalledWith(20);
  });

  it('returns null when config not found', async () => {
    (triggerConfigRepo.getTriggerTxtpConfigByIdInDb as jest.Mock).mockResolvedValue(null);

    const result = await getTriggerConfigById(99);

    expect(result).toBeNull();
    expect(triggerStrategyRepo.getTriggerFieldStrategiesByConfigId).not.toHaveBeenCalled();
  });

  it('maps all config fields correctly', async () => {
    const configWithRelated = { ...mockTriggerConfig, related_txtp_config_id: 5, related_transaction: '/default/1.0.0/test/pacs.002' };
    (triggerConfigRepo.getTriggerTxtpConfigByIdInDb as jest.Mock).mockResolvedValue(configWithRelated);
    (triggerStrategyRepo.getTriggerFieldStrategiesByConfigId as jest.Mock).mockResolvedValue([]);

    const result = await getTriggerConfigById(20);

    expect(result!.related_txtp_config_id).toBe(5);
    expect(result!.related_transaction).toBe('/default/1.0.0/test/pacs.002');
    expect(result!.message_count).toBe(mockTriggerConfig.message_count);
    expect(result!.display_order).toBe(mockTriggerConfig.display_order);
  });

  it('returns empty field_strategies array when none exist', async () => {
    (triggerConfigRepo.getTriggerTxtpConfigByIdInDb as jest.Mock).mockResolvedValue(mockTriggerConfig);
    (triggerStrategyRepo.getTriggerFieldStrategiesByConfigId as jest.Mock).mockResolvedValue([]);

    const result = await getTriggerConfigById(20);

    expect(result!.field_strategies).toHaveLength(0);
  });

  it('wraps error in HttpException 500', async () => {
    (triggerConfigRepo.getTriggerTxtpConfigByIdInDb as jest.Mock).mockRejectedValue(new Error('DB fail'));
    await expect(getTriggerConfigById(20)).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('not found', 404);
    (triggerConfigRepo.getTriggerTxtpConfigByIdInDb as jest.Mock).mockRejectedValue(err);
    await expect(getTriggerConfigById(20)).rejects.toBe(err);
  });

  it('wraps non-Error thrown value', async () => {
    (triggerConfigRepo.getTriggerTxtpConfigByIdInDb as jest.Mock).mockRejectedValue('string error');
    await expect(getTriggerConfigById(20)).rejects.toMatchObject({ status: 500 });
  });
});
