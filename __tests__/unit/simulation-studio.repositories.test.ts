// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: jest.fn(),
}));

jest.mock('../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
  configuration: {},
}));

import * as db from '../../src/services/database.logic.service';
import {
  createSuiteGenerationInDb,
  getNextGenerationNumber,
  getGenerationsBySuiteId,
  getLatestGenerationBySuiteId,
} from '../../src/repositories/simulation-studio/suite-generations.repository';
import {
  createContextTxtpConfigInDb,
  updateContextTxtpConfigInDb,
  getContextTxtpConfigsByGenerationId,
} from '../../src/repositories/simulation-studio/context-txtp-configs.repository';
import {
  upsertFieldStrategyInDb,
  getFieldStrategiesByContextConfigId,
} from '../../src/repositories/simulation-studio/context-field-strategies.repository';

const mockDb = db.handlePostExecuteSqlStatement as jest.Mock;

const generationRow = {
  id: 1,
  suite_id: 42,
  generation_number: 1,
  status: 'DRAFT',
  simulation_type: 'SINGLE_RULE',
  rule_repo: null,
  rule_version: null,
  context_count: 0,
  trigger_count: 0,
  enrichment_table_count: 0,
  generated_context_count: 0,
  generated_trigger_count: 0,
  generated_enrichment_row_count: 0,
  context_field_config_count: 0,
  trigger_field_config_count: 0,
  enrichment_field_config_count: 0,
  wizard_snapshot: '{}',
  generation_metadata: '{}',
  created_by: 'user-1',
  created_by_email: null,
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
};

const contextConfigRow = {
  id: 1,
  generation_id: 1,
  txtp: 'pacs.008',
  txtp_version: '001.08',
  display_order: 1,
  message_count: 1,
  schema_snapshot: '{"type":"object"}',
  sample_payload_snapshot: '{"test":"payload"}',
  faker_seed: null,
  generator_profile: '{}',
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
};

const fieldStrategyRow = {
  id: 1,
  context_txtp_config_id: 1,
  field_path: 'CdtTrfTxInf.IntrBkSttlmAmt.value',
  strategy_code: 'static',
  static_value: '999',
  range_min: null,
  range_max: null,
  generator_type: null,
  generator_options: '{}',
  is_required_override: null,
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
};

beforeEach(() => jest.clearAllMocks());

// ── suite-generations.repository ─────────────────────────────────────────────

describe('createSuiteGenerationInDb', () => {
  it('inserts row and returns mapped generation', async () => {
    mockDb.mockResolvedValue({ rows: [generationRow] });

    const result = await createSuiteGenerationInDb(
      { suite_id: 42, simulation_type: 'SINGLE_RULE' as any, wizard_snapshot: {}, generation_metadata: {} },
      1,
      'user-1',
      'user@test.com',
    );

    expect(result.id).toBe(1);
    expect(result.suite_id).toBe(42);
    expect(result.wizard_snapshot).toEqual({});
    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('INSERT') }), 'simulation');
  });

  it('parses wizard_snapshot as object when already object', async () => {
    const rowWithObj = { ...generationRow, wizard_snapshot: { step: 1 }, generation_metadata: {} };
    mockDb.mockResolvedValue({ rows: [rowWithObj] });

    const result = await createSuiteGenerationInDb(
      { suite_id: 42, simulation_type: 'SINGLE_RULE' as any, wizard_snapshot: {}, generation_metadata: {} },
      1,
      'user-1',
    );

    expect(result.wizard_snapshot).toEqual({ step: 1 });
  });
});

describe('getNextGenerationNumber', () => {
  it('returns next generation number', async () => {
    mockDb.mockResolvedValue({ rows: [{ next_num: 3 }] });

    const result = await getNextGenerationNumber(42);

    expect(result).toBe(3);
    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ values: [42] }), 'simulation');
  });
});

describe('getGenerationsBySuiteId', () => {
  it('returns mapped array', async () => {
    mockDb.mockResolvedValue({ rows: [generationRow, generationRow] });

    const result = await getGenerationsBySuiteId(42);

    expect(result).toHaveLength(2);
    expect(result[0].suite_id).toBe(42);
  });

  it('returns empty array when no rows', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await getGenerationsBySuiteId(42)).toEqual([]);
  });
});

describe('getLatestGenerationBySuiteId', () => {
  it('returns mapped generation when found', async () => {
    mockDb.mockResolvedValue({ rows: [generationRow] });

    const result = await getLatestGenerationBySuiteId(42);

    expect(result).not.toBeNull();
    expect(result!.generation_number).toBe(1);
  });

  it('returns null when no rows', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await getLatestGenerationBySuiteId(42)).toBeNull();
  });
});

// ── context-txtp-configs.repository ──────────────────────────────────────────

describe('createContextTxtpConfigInDb', () => {
  it('inserts row and returns mapped config', async () => {
    mockDb.mockResolvedValue({ rows: [contextConfigRow] });

    const result = await createContextTxtpConfigInDb({
      generation_id: 1,
      txtp: 'pacs.008',
      txtp_version: '001.08',
      display_order: 1,
      message_count: 1,
      schema_snapshot: { type: 'object' },
      sample_payload_snapshot: { test: 'payload' },
    });

    expect(result.id).toBe(1);
    expect(result.txtp).toBe('pacs.008');
    expect(result.schema_snapshot).toEqual({ type: 'object' });
    expect(result.sample_payload_snapshot).toEqual({ test: 'payload' });
  });

  it('handles null sample_payload_snapshot', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...contextConfigRow, sample_payload_snapshot: null }] });

    const result = await createContextTxtpConfigInDb({
      generation_id: 1,
      txtp: 'pacs.008',
      txtp_version: '001.08',
      display_order: 1,
      message_count: 1,
      schema_snapshot: {},
    });

    expect(result.sample_payload_snapshot).toBeUndefined();
  });
});

describe('updateContextTxtpConfigInDb', () => {
  it('updates message_count and returns updated row', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...contextConfigRow, message_count: 5 }] });

    const result = await updateContextTxtpConfigInDb(1, { message_count: 5 });

    expect(result!.message_count).toBe(5);
    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('UPDATE') }), 'simulation');
  });

  it('updates faker_seed', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...contextConfigRow, faker_seed: 42 }] });

    const result = await updateContextTxtpConfigInDb(1, { faker_seed: 42 });

    expect(result!.faker_seed).toBe(42);
  });

  it('updates generator_profile', async () => {
    const profile = { type: 'bic' };
    mockDb.mockResolvedValue({ rows: [{ ...contextConfigRow, generator_profile: JSON.stringify(profile) }] });

    const result = await updateContextTxtpConfigInDb(1, { generator_profile: profile });

    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('UPDATE') }), 'simulation');
    expect(result).not.toBeNull();
  });

  it('fetches existing row when no fields to update', async () => {
    mockDb.mockResolvedValue({ rows: [contextConfigRow] });

    const result = await updateContextTxtpConfigInDb(1, {});

    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('SELECT') }), 'simulation');
    expect(result).not.toBeNull();
  });

  it('returns null when no fields and row not found', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await updateContextTxtpConfigInDb(99, {})).toBeNull();
  });

  it('returns null when UPDATE finds no row', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await updateContextTxtpConfigInDb(99, { message_count: 5 })).toBeNull();
  });
});

describe('getContextTxtpConfigsByGenerationId', () => {
  it('returns mapped configs array', async () => {
    mockDb.mockResolvedValue({ rows: [contextConfigRow] });

    const result = await getContextTxtpConfigsByGenerationId(1);

    expect(result).toHaveLength(1);
    expect(result[0].generation_id).toBe(1);
  });
});

// ── context-field-strategies.repository ──────────────────────────────────────

describe('upsertFieldStrategyInDb', () => {
  it('upserts row and returns mapped strategy', async () => {
    mockDb.mockResolvedValue({ rows: [fieldStrategyRow] });

    const result = await upsertFieldStrategyInDb(1, {
      field_path: 'CdtTrfTxInf.IntrBkSttlmAmt.value',
      strategy_code: 'static',
      static_value: 999,
    });

    expect(result.id).toBe(1);
    expect(result.strategy_code).toBe('static');
    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('ON CONFLICT') }), 'simulation');
  });

  it('handles range strategy fields', async () => {
    const rangeRow = { ...fieldStrategyRow, strategy_code: 'range', range_min: 1, range_max: 100, static_value: null };
    mockDb.mockResolvedValue({ rows: [rangeRow] });

    const result = await upsertFieldStrategyInDb(1, {
      field_path: 'amount',
      strategy_code: 'range',
      range_min: 1,
      range_max: 100,
    });

    expect(result.strategy_code).toBe('range');
  });

  it('handles generator_options as object (not string)', async () => {
    const rowWithObjOptions = { ...fieldStrategyRow, generator_options: { type: 'bic' } };
    mockDb.mockResolvedValue({ rows: [rowWithObjOptions] });

    const result = await upsertFieldStrategyInDb(1, {
      field_path: 'bic',
      strategy_code: 'generated',
      generator_type: 'iso20022.bic',
      generator_options: { type: 'bic' },
    });

    expect(result.generator_options).toEqual({ type: 'bic' });
  });
});

describe('getFieldStrategiesByContextConfigId', () => {
  it('returns mapped strategies array', async () => {
    mockDb.mockResolvedValue({ rows: [fieldStrategyRow] });

    const result = await getFieldStrategiesByContextConfigId(1);

    expect(result).toHaveLength(1);
    expect(result[0].field_path).toBe('CdtTrfTxInf.IntrBkSttlmAmt.value');
  });

  it('returns empty array when no rows', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await getFieldStrategiesByContextConfigId(1)).toEqual([]);
  });
});
