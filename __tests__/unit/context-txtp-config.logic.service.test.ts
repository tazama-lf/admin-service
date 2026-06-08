// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/context-txtp-configs.repository', () => ({
  createContextTxtpConfigInDb: jest.fn(),
  updateContextTxtpConfigInDb: jest.fn(),
  getContextTxtpConfigsByGenerationId: jest.fn(),
  deleteContextTxtpConfigInDb: jest.fn(),
}));

jest.mock('../../src/repositories/simulation-studio/context-field-strategies.repository', () => ({
  upsertFieldStrategyInDb: jest.fn(),
  getFieldStrategiesByContextConfigId: jest.fn(),
}));

jest.mock('../../src/repositories/configuration/tcs.config.repository', () => ({
  getSchemaByTransactionType: jest.fn(),
  getSchemaByEndpointPath: jest.fn(),
}));

jest.mock('@tazama-lf/tcs-lib', () => ({
  ContentType: { XML: 'application/xml', JSON: 'application/json' },
}));

jest.mock('../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
  configuration: {},
}));

import { HttpException } from '../../src/utils/error';
import * as contextConfigRepo from '../../src/repositories/simulation-studio/context-txtp-configs.repository';
import * as fieldStrategyRepo from '../../src/repositories/simulation-studio/context-field-strategies.repository';
import * as tcsRepo from '../../src/repositories/configuration/tcs.config.repository';
import {
  createConfigWithDefaultStrategies,
  createContextTxtpConfig,
  addContextTxtpConfig,
  getContextConfigsWithStrategies,
  bulkUpdateContextConfigs,
  getFieldStrategiesForContextConfig,
  deleteContextTxtpConfig,
} from '../../src/services/context-txtp-config.logic.service';
import type { SuiteContextTxtpConfig, ContextFieldStrategy } from '../../src/interface/suite-generation.interface';

const mockContextConfig: SuiteContextTxtpConfig = {
  id: 10,
  generation_id: 1,
  txtp: 'pacs.008',
  txtp_version: '001.08',
  display_order: 1,
  message_count: 100,
  schema_snapshot: { type: 'object', properties: { amount: {}, currency: {} } },
  generator_profile: {},
  created_at: new Date(),
};

const mockFieldStrategy: ContextFieldStrategy = {
  id: 1,
  context_txtp_config_id: 10,
  field_path: 'amount',
  strategy_code: 'keep_sample',
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

const relatedTcsRow = {
  schema: { type: 'object', properties: { id: {} } },
  content_type: 'application/json',
  payload_json: { id: 'abc' },
  payload_xml: null,
  transaction_type: 'pacs.002.001.10',
  version: '001.10',
};

const tcsRowXml = {
  schema: { type: 'object', properties: { amount: {} } },
  content_type: 'application/xml',
  payload_xml: { amount: '<xml>' },
  payload_json: null,
  related_transaction: null,
};

beforeEach(() => jest.clearAllMocks());

// ── createConfigWithDefaultStrategies ────────────────────────────────────────

describe('createConfigWithDefaultStrategies', () => {
  it('fetches schema, inserts config, seeds keep_sample for each payload field path', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    (contextConfigRepo.createContextTxtpConfigInDb as jest.Mock).mockResolvedValue(mockContextConfig);
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await createConfigWithDefaultStrategies({
      generationId: 1,
      txtp: 'pacs.008',
      txtpVersion: '001.08',
      messageCount: 100,
      displayOrder: 1,
      tenantId: 'tenant-001',
    });

    expect(tcsRepo.getSchemaByTransactionType).toHaveBeenCalledWith('pacs.008', '001.08', 'tenant-001');
    expect(contextConfigRepo.createContextTxtpConfigInDb).toHaveBeenCalledWith(
      expect.objectContaining({
        generation_id: 1,
        txtp: 'pacs.008',
        txtp_version: '001.08',
        display_order: 1,
        message_count: 100,
        schema_snapshot: tcsRowJson.schema,
        sample_payload_snapshot: tcsRowJson.payload_json,
      }),
    );
    // payload has 2 leaf fields: amount, currency
    expect(fieldStrategyRepo.upsertFieldStrategyInDb).toHaveBeenCalledTimes(2);
    expect(fieldStrategyRepo.upsertFieldStrategyInDb).toHaveBeenCalledWith(10, expect.objectContaining({ strategy_code: 'keep_sample' }));
    expect(result.context_txtp_config_id).toBe(10);
    expect(result.field_strategies).toHaveLength(2);
  });

  it('uses payload_xml when content_type is XML', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowXml);
    (contextConfigRepo.createContextTxtpConfigInDb as jest.Mock).mockResolvedValue(mockContextConfig);
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await createConfigWithDefaultStrategies({
      generationId: 1,
      txtp: 'pacs.008',
      txtpVersion: '001.08',
      messageCount: 100,
      displayOrder: 1,
      tenantId: 'tenant-001',
    });

    expect(contextConfigRepo.createContextTxtpConfigInDb).toHaveBeenCalledWith(
      expect.objectContaining({ sample_payload_snapshot: tcsRowXml.payload_xml }),
    );
  });

  it('falls back to schema paths when payload is null', async () => {
    const tcsNoPayload = { ...tcsRowJson, payload_json: null };
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsNoPayload);
    (contextConfigRepo.createContextTxtpConfigInDb as jest.Mock).mockResolvedValue(mockContextConfig);
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await createConfigWithDefaultStrategies({
      generationId: 1,
      txtp: 'pacs.008',
      txtpVersion: '001.08',
      messageCount: 100,
      displayOrder: 1,
      tenantId: 'tenant-001',
    });

    // schema has amount and currency — still seeds 2 strategies
    expect(fieldStrategyRepo.upsertFieldStrategyInDb).toHaveBeenCalledTimes(2);
  });

  it('flattens nested payload objects recursively', async () => {
    const nestedPayload = { transaction: { amount: 100, currency: 'USD' } };
    const tcsNestedPayload = { ...tcsRowJson, payload_json: nestedPayload };
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsNestedPayload);
    (contextConfigRepo.createContextTxtpConfigInDb as jest.Mock).mockResolvedValue(mockContextConfig);
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await createConfigWithDefaultStrategies({
      generationId: 1,
      txtp: 'pacs.008',
      txtpVersion: '001.08',
      messageCount: 100,
      displayOrder: 1,
      tenantId: 'tenant-001',
    });

    expect(fieldStrategyRepo.upsertFieldStrategyInDb).toHaveBeenCalledTimes(2);
    expect(fieldStrategyRepo.upsertFieldStrategyInDb).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ field_path: 'transaction.amount' }),
    );
    expect(fieldStrategyRepo.upsertFieldStrategyInDb).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ field_path: 'transaction.currency' }),
    );
  });

  it('returns no field strategies when schema is a non-object primitive', async () => {
    const tcsStringSchema = {
      schema: 'not-an-object',
      content_type: 'application/json',
      payload_json: null,
      payload_xml: null,
      related_transaction: null,
    };
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsStringSchema);
    (contextConfigRepo.createContextTxtpConfigInDb as jest.Mock).mockResolvedValue(mockContextConfig);
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await createConfigWithDefaultStrategies({
      generationId: 1,
      txtp: 'pacs.008',
      txtpVersion: '001.08',
      messageCount: 100,
      displayOrder: 1,
      tenantId: 'tenant-001',
    });

    expect(fieldStrategyRepo.upsertFieldStrategyInDb).not.toHaveBeenCalled();
    expect(result.field_strategies).toHaveLength(0);
  });

  it('throws when tcs_config row not found', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockRejectedValue(new Error('Not found'));
    await expect(
      createConfigWithDefaultStrategies({
        generationId: 1,
        txtp: 'x',
        txtpVersion: '1',
        messageCount: 100,
        displayOrder: 1,
        tenantId: 'tenant',
      }),
    ).rejects.toThrow('Not found');
  });

  it('seeds no strategies when schema has no leaf paths', async () => {
    const emptySchema = { ...tcsRowJson, schema: {}, payload_json: {} };
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(emptySchema);
    (contextConfigRepo.createContextTxtpConfigInDb as jest.Mock).mockResolvedValue({ ...mockContextConfig, schema_snapshot: {} });
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await createConfigWithDefaultStrategies({
      generationId: 1,
      txtp: 'pacs.008',
      txtpVersion: '001.08',
      messageCount: 100,
      displayOrder: 1,
      tenantId: 'tenant-001',
    });

    expect(fieldStrategyRepo.upsertFieldStrategyInDb).not.toHaveBeenCalled();
    expect(result.field_strategies).toHaveLength(0);
  });
});

// ── createContextTxtpConfig ──────────────────────────────────────────────────

describe('createContextTxtpConfig', () => {
  it('calls createConfigWithDefaultStrategies with display_order=1 and message_count=100', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    (contextConfigRepo.createContextTxtpConfigInDb as jest.Mock).mockResolvedValue(mockContextConfig);
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await createContextTxtpConfig(1, 'pacs.008', '001.08', 'tenant-001');

    expect(contextConfigRepo.createContextTxtpConfigInDb).toHaveBeenCalledWith(
      expect.objectContaining({ display_order: 1, message_count: 100 }),
    );
  });

  it('wraps error in HttpException 500', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(createContextTxtpConfig(1, 'pacs.008', '001.08', 'tenant-001')).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('bad', 404);
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockRejectedValue(err);
    await expect(createContextTxtpConfig(1, 'pacs.008', '001.08', 'tenant-001')).rejects.toBe(err);
  });

  it('skips related config when related_transaction is null', async () => {
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    (contextConfigRepo.createContextTxtpConfigInDb as jest.Mock).mockResolvedValue(mockContextConfig);
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await createContextTxtpConfig(1, 'pacs.008', '001.08', 'tenant-001');

    expect(tcsRepo.getSchemaByEndpointPath).not.toHaveBeenCalled();
    expect(contextConfigRepo.createContextTxtpConfigInDb).toHaveBeenCalledTimes(1);
  });
});

// ── addContextTxtpConfig ─────────────────────────────────────────────────────

describe('addContextTxtpConfig', () => {
  it('sets display_order = existing count + 1', async () => {
    (contextConfigRepo.getContextTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([mockContextConfig]);
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    (contextConfigRepo.createContextTxtpConfigInDb as jest.Mock).mockResolvedValue({ ...mockContextConfig, id: 20, display_order: 2 });
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await addContextTxtpConfig(1, { txtp: 'pacs.002', txtp_version: '001.08', message_count: 50 }, 'tenant-001');

    expect(contextConfigRepo.createContextTxtpConfigInDb).toHaveBeenCalledWith(
      expect.objectContaining({ display_order: 2, message_count: 50 }),
    );
    expect(result.context_txtp_config_id).toBe(20);
  });

  it('defaults message_count to 100 when not provided', async () => {
    (contextConfigRepo.getContextTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([]);
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    (contextConfigRepo.createContextTxtpConfigInDb as jest.Mock).mockResolvedValue(mockContextConfig);
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await addContextTxtpConfig(1, { txtp: 'pacs.008', txtp_version: '001.08' }, 'tenant-001');

    expect(contextConfigRepo.createContextTxtpConfigInDb).toHaveBeenCalledWith(
      expect.objectContaining({ message_count: 100, display_order: 1 }),
    );
  });

  it('wraps error in HttpException 500', async () => {
    (contextConfigRepo.getContextTxtpConfigsByGenerationId as jest.Mock).mockRejectedValue(new Error('DB fail'));
    await expect(addContextTxtpConfig(1, { txtp: 'x', txtp_version: '1' }, 'tenant')).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('conflict', 409);
    (contextConfigRepo.getContextTxtpConfigsByGenerationId as jest.Mock).mockRejectedValue(err);
    await expect(addContextTxtpConfig(1, { txtp: 'x', txtp_version: '1' }, 'tenant')).rejects.toBe(err);
  });
});

// ── getContextConfigsWithStrategies ──────────────────────────────────────────

describe('getContextConfigsWithStrategies', () => {
  it('returns all configs with their field strategies', async () => {
    (contextConfigRepo.getContextTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([mockContextConfig]);
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    (fieldStrategyRepo.getFieldStrategiesByContextConfigId as jest.Mock).mockResolvedValue([mockFieldStrategy]);

    const result = await getContextConfigsWithStrategies(1, 'tenant-001');

    expect(result).toHaveLength(1);
    expect(result[0].context_txtp_config_id).toBe(10);
    expect(result[0].txtp).toBe('pacs.008');
    expect(result[0].field_strategies).toEqual([mockFieldStrategy]);
    expect(result[0].related_txtp_config_id).toBeNull();
    expect(fieldStrategyRepo.getFieldStrategiesByContextConfigId).toHaveBeenCalledWith(10);
  });

  it('returns empty array when no configs exist', async () => {
    (contextConfigRepo.getContextTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([]);
    const result = await getContextConfigsWithStrategies(1, 'tenant-001');
    expect(result).toEqual([]);
  });

  it('handles multiple configs, fetches strategies for each', async () => {
    const config2 = { ...mockContextConfig, id: 11, txtp: 'pacs.002', related_txtp_config_id: 10 };
    (contextConfigRepo.getContextTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([mockContextConfig, config2]);
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    (fieldStrategyRepo.getFieldStrategiesByContextConfigId as jest.Mock).mockResolvedValue([mockFieldStrategy]);

    const result = await getContextConfigsWithStrategies(1, 'tenant-001');

    expect(result).toHaveLength(2);
    expect(result[1].related_txtp_config_id).toBe(10);
    expect(fieldStrategyRepo.getFieldStrategiesByContextConfigId).toHaveBeenCalledTimes(2);
    expect(fieldStrategyRepo.getFieldStrategiesByContextConfigId).toHaveBeenCalledWith(10);
    expect(fieldStrategyRepo.getFieldStrategiesByContextConfigId).toHaveBeenCalledWith(11);
  });

  it('wraps error in HttpException 500', async () => {
    (contextConfigRepo.getContextTxtpConfigsByGenerationId as jest.Mock).mockRejectedValue(new Error('DB fail'));
    await expect(getContextConfigsWithStrategies(1, 'tenant-001')).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value', async () => {
    (contextConfigRepo.getContextTxtpConfigsByGenerationId as jest.Mock).mockRejectedValue('string error');
    await expect(getContextConfigsWithStrategies(1, 'tenant-001')).rejects.toMatchObject({ status: 500 });
  });
});

// ── bulkUpdateContextConfigs ─────────────────────────────────────────────────

describe('bulkUpdateContextConfigs', () => {
  beforeEach(() => {
    (contextConfigRepo.getContextTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([mockContextConfig]);
    (tcsRepo.getSchemaByTransactionType as jest.Mock).mockResolvedValue(tcsRowJson);
    (fieldStrategyRepo.getFieldStrategiesByContextConfigId as jest.Mock).mockResolvedValue([mockFieldStrategy]);
  });

  it('updates message_count and upserts strategies, returns updated configs', async () => {
    (contextConfigRepo.updateContextTxtpConfigInDb as jest.Mock).mockResolvedValue(mockContextConfig);
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await bulkUpdateContextConfigs(
      1,
      [{ context_txtp_config_id: 10, message_count: 50, field_strategies: [{ field_path: 'amount', strategy_code: 'keep_sample' }] }],
      'tenant-001',
    );

    expect(contextConfigRepo.updateContextTxtpConfigInDb).toHaveBeenCalledWith(10, { message_count: 50 });
    expect(fieldStrategyRepo.upsertFieldStrategyInDb).toHaveBeenCalledWith(10, { field_path: 'amount', strategy_code: 'keep_sample' });
    expect(result).toHaveLength(1);
    expect(result[0].context_txtp_config_id).toBe(10);
  });

  it('skips updateContextTxtpConfigInDb when no updateable scalar fields', async () => {
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    await bulkUpdateContextConfigs(
      1,
      [{ context_txtp_config_id: 10, field_strategies: [{ field_path: 'amount', strategy_code: 'skip' }] }],
      'tenant-001',
    );

    expect(contextConfigRepo.updateContextTxtpConfigInDb).not.toHaveBeenCalled();
    expect(fieldStrategyRepo.upsertFieldStrategyInDb).toHaveBeenCalledTimes(1);
  });

  it('skips upsertFieldStrategyInDb when field_strategies is empty array', async () => {
    (contextConfigRepo.updateContextTxtpConfigInDb as jest.Mock).mockResolvedValue(mockContextConfig);

    await bulkUpdateContextConfigs(1, [{ context_txtp_config_id: 10, message_count: 5, field_strategies: [] }], 'tenant-001');

    expect(fieldStrategyRepo.upsertFieldStrategyInDb).not.toHaveBeenCalled();
    expect(contextConfigRepo.updateContextTxtpConfigInDb).toHaveBeenCalledWith(10, { message_count: 5 });
  });

  it('skips upsertFieldStrategyInDb when field_strategies absent', async () => {
    (contextConfigRepo.updateContextTxtpConfigInDb as jest.Mock).mockResolvedValue(mockContextConfig);

    await bulkUpdateContextConfigs(1, [{ context_txtp_config_id: 10, message_count: 5 }], 'tenant-001');

    expect(fieldStrategyRepo.upsertFieldStrategyInDb).not.toHaveBeenCalled();
  });

  it('processes multiple items in parallel', async () => {
    const config2 = { ...mockContextConfig, id: 11 };
    (contextConfigRepo.getContextTxtpConfigsByGenerationId as jest.Mock).mockResolvedValue([mockContextConfig, config2]);
    (fieldStrategyRepo.getFieldStrategiesByContextConfigId as jest.Mock).mockResolvedValue([mockFieldStrategy]);
    (contextConfigRepo.updateContextTxtpConfigInDb as jest.Mock).mockResolvedValue(mockContextConfig);
    (fieldStrategyRepo.upsertFieldStrategyInDb as jest.Mock).mockResolvedValue(mockFieldStrategy);

    const result = await bulkUpdateContextConfigs(
      1,
      [
        { context_txtp_config_id: 10, message_count: 50 },
        {
          context_txtp_config_id: 11,
          message_count: 200,
          field_strategies: [{ field_path: 'amount', strategy_code: 'static', static_value: 'x' }],
        },
      ],
      'tenant-001',
    );

    expect(contextConfigRepo.updateContextTxtpConfigInDb).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });

  it('wraps error in HttpException 500', async () => {
    (contextConfigRepo.updateContextTxtpConfigInDb as jest.Mock).mockRejectedValue(new Error('DB fail'));
    await expect(bulkUpdateContextConfigs(1, [{ context_txtp_config_id: 10, message_count: 5 }], 'tenant-001')).rejects.toMatchObject({
      status: 500,
    });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('not found', 404);
    (contextConfigRepo.updateContextTxtpConfigInDb as jest.Mock).mockRejectedValue(err);
    await expect(bulkUpdateContextConfigs(1, [{ context_txtp_config_id: 10, message_count: 5 }], 'tenant-001')).rejects.toBe(err);
  });

  it('wraps non-Error thrown value', async () => {
    (contextConfigRepo.updateContextTxtpConfigInDb as jest.Mock).mockRejectedValue('string error');
    await expect(bulkUpdateContextConfigs(1, [{ context_txtp_config_id: 10, message_count: 5 }], 'tenant-001')).rejects.toMatchObject({
      status: 500,
    });
  });
});

// ── getFieldStrategiesForContextConfig ───────────────────────────────────────

describe('getFieldStrategiesForContextConfig', () => {
  it('returns field strategies for a config', async () => {
    (fieldStrategyRepo.getFieldStrategiesByContextConfigId as jest.Mock).mockResolvedValue([mockFieldStrategy]);

    const result = await getFieldStrategiesForContextConfig(10);

    expect(result).toEqual([mockFieldStrategy]);
    expect(fieldStrategyRepo.getFieldStrategiesByContextConfigId).toHaveBeenCalledWith(10);
  });

  it('returns empty array when no strategies', async () => {
    (fieldStrategyRepo.getFieldStrategiesByContextConfigId as jest.Mock).mockResolvedValue([]);
    expect(await getFieldStrategiesForContextConfig(10)).toEqual([]);
  });

  it('wraps error in HttpException 500', async () => {
    (fieldStrategyRepo.getFieldStrategiesByContextConfigId as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(getFieldStrategiesForContextConfig(10)).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value', async () => {
    (fieldStrategyRepo.getFieldStrategiesByContextConfigId as jest.Mock).mockRejectedValue('string error');
    await expect(getFieldStrategiesForContextConfig(10)).rejects.toMatchObject({ status: 500 });
  });
});

// ── deleteContextTxtpConfig ───────────────────────────────────────────────────

describe('deleteContextTxtpConfig', () => {
  it('deletes context config successfully (field strategies cascade via FK)', async () => {
    (contextConfigRepo.deleteContextTxtpConfigInDb as jest.Mock).mockResolvedValue(true);
    await expect(deleteContextTxtpConfig(10)).resolves.toBeUndefined();
    expect(contextConfigRepo.deleteContextTxtpConfigInDb).toHaveBeenCalledWith(10);
  });

  it('throws 404 when config not found', async () => {
    (contextConfigRepo.deleteContextTxtpConfigInDb as jest.Mock).mockResolvedValue(false);
    await expect(deleteContextTxtpConfig(999)).rejects.toMatchObject({ status: 404 });
  });

  it('wraps DB error in HttpException 500', async () => {
    (contextConfigRepo.deleteContextTxtpConfigInDb as jest.Mock).mockRejectedValue(new Error('DB fail'));
    await expect(deleteContextTxtpConfig(10)).rejects.toMatchObject({ status: 500 });
  });

  it('rethrows HttpException as-is', async () => {
    const err = new HttpException('forbidden', 403);
    (contextConfigRepo.deleteContextTxtpConfigInDb as jest.Mock).mockRejectedValue(err);
    await expect(deleteContextTxtpConfig(10)).rejects.toBe(err);
  });

  it('wraps non-Error thrown value', async () => {
    (contextConfigRepo.deleteContextTxtpConfigInDb as jest.Mock).mockRejectedValue('string error');
    await expect(deleteContextTxtpConfig(10)).rejects.toMatchObject({ status: 500 });
  });
});
