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
  resumeGenerationInDb,
  updateGenerationStatusInDb,
  updateGenerationCountsInDb,
  getGenerationSummaryFromDb,
  updateWizardProgressInDb,
  getGenerationByIdFromDb,
  cloneGenerationDataInDb,
} from '../../src/repositories/simulation-studio/suite-generations.repository';
import {
  createContextTxtpConfigInDb,
  updateContextTxtpConfigInDb,
  getContextTxtpConfigsByGenerationId,
  getContextTxtpConfigById,
  deleteContextTxtpConfigInDb,
} from '../../src/repositories/simulation-studio/context-txtp-configs.repository';
import {
  upsertFieldStrategyInDb,
  getFieldStrategiesByContextConfigId,
} from '../../src/repositories/simulation-studio/context-field-strategies.repository';
import {
  createTriggerTxtpConfigInDb,
  updateTriggerTxtpConfigInDb,
  getTriggerTxtpConfigsByGenerationId,
  getTriggerTxtpConfigByIdInDb,
  deleteTriggerTxtpConfigInDb,
} from '../../src/repositories/simulation-studio/trigger-txtp-configs.repository';
import {
  upsertTriggerFieldStrategyInDb,
  getTriggerFieldStrategiesByConfigId,
} from '../../src/repositories/simulation-studio/trigger-field-strategies.repository';
import {
  createEnrichmentTableInDb,
  getNextEnrichmentTableOrderInDb,
  updateEnrichmentTableInDb,
  getEnrichmentTablesByGenerationId,
  deleteEnrichmentTableInDb,
} from '../../src/repositories/simulation-studio/enrichment-tables.repository';
import { getEnrichmentFieldStrategiesByTableId } from '../../src/repositories/simulation-studio/enrichment-field-strategies.repository';

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
  faker_semantic_type: null,
  generator_options: '{}',
  is_required_override: null,
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
};

const enrichmentFieldStrategyRow = {
  id: 1,
  enrichment_table_id: 30,
  column_name: 'amount',
  column_type: null,
  strategy_code: 'range',
  static_value: null,
  range_min: 1,
  range_max: 99,
  generator_type: null,
  generator_options: '{"min":1,"max":99}',
  created_at: '2026-05-01T00:00:00.000Z',
};

beforeEach(() => jest.clearAllMocks());

// ── suite-generations.repository ─────────────────────────────────────────────

describe('createSuiteGenerationInDb', () => {
  it('inserts row and returns mapped generation', async () => {
    mockDb.mockResolvedValue({ rows: [generationRow] });

    const result = await createSuiteGenerationInDb(
      { suite_id: 42, simulation_type: 'SINGLE_RULE' as any, wizard_snapshot: {}, generation_metadata: {} },
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

// ── suite-generations.repository — optional fields branches ──────────────────

describe('createSuiteGenerationInDb — optional fields', () => {
  it('uses SINGLE_RULE default when simulation_type absent', async () => {
    mockDb.mockResolvedValue({ rows: [generationRow] });
    await createSuiteGenerationInDb({ suite_id: 42 } as any, 'user-1');
    const callValues = (mockDb.mock.calls[0][0] as { values: unknown[] }).values;
    expect(callValues[1]).toBe('SINGLE_RULE');
  });

  it('uses provided simulation_type when given', async () => {
    mockDb.mockResolvedValue({ rows: [generationRow] });
    await createSuiteGenerationInDb({ suite_id: 42, simulation_type: 'INTEGRATION_TESTING' as any }, 'user-1');
    const callValues = (mockDb.mock.calls[0][0] as { values: unknown[] }).values;
    expect(callValues[1]).toBe('INTEGRATION_TESTING');
  });

  it('passes non-null rule_repo and rule_version when provided', async () => {
    mockDb.mockResolvedValue({ rows: [generationRow] });
    await createSuiteGenerationInDb(
      { suite_id: 42, simulation_type: 'SINGLE_RULE' as any, rule_repo: 'repo-a', rule_version: 'v1' },
      'user-1',
    );
    const callValues = (mockDb.mock.calls[0][0] as { values: unknown[] }).values;
    expect(callValues[2]).toBe('repo-a');
    expect(callValues[3]).toBe('v1');
  });

  it('passes null for optional rule_repo and rule_version when absent', async () => {
    mockDb.mockResolvedValue({ rows: [generationRow] });
    await createSuiteGenerationInDb({ suite_id: 42, simulation_type: 'INTEGRATION_TESTING' as any }, 'user-1');
    const callValues = (mockDb.mock.calls[0][0] as { values: unknown[] }).values;
    expect(callValues[2]).toBeNull();
    expect(callValues[3]).toBeNull();
    expect(callValues[7]).toBeNull();
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

describe('deleteContextTxtpConfigInDb', () => {
  it('returns true when target and related rows are deleted', async () => {
    mockDb.mockResolvedValue({ rows: [{ deleted_count: '2' }] } as never);
    expect(await deleteContextTxtpConfigInDb(10)).toBe(true);
    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('DELETE FROM trs_suite_context_txtp_configs') }),
      'simulation',
    );
    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('related_txtp_config_id') }), 'simulation');
  });

  it('returns false when row not found', async () => {
    mockDb.mockResolvedValue({ rows: [{ deleted_count: '0' }] } as never);
    expect(await deleteContextTxtpConfigInDb(999)).toBe(false);
  });

  it('returns false when rows array is empty (deleted_count defaults to 0)', async () => {
    mockDb.mockResolvedValue({ rows: [] } as never);
    expect(await deleteContextTxtpConfigInDb(10)).toBe(false);
  });
});

describe('createContextTxtpConfigInDb — object-typed row fields', () => {
  it('handles schema_snapshot, sample_payload_snapshot, and generator_profile already as objects', async () => {
    const objectRow = {
      ...contextConfigRow,
      schema_snapshot: { type: 'object' },
      sample_payload_snapshot: { test: 'payload' },
      generator_profile: { mode: 'fast' },
      related_txtp_config_id: 5,
    };
    mockDb.mockResolvedValue({ rows: [objectRow] });

    const result = await createContextTxtpConfigInDb({
      generation_id: 1,
      txtp: 'pacs.008',
      txtp_version: '001.08',
      display_order: 1,
      message_count: 100,
      schema_snapshot: { type: 'object' },
      sample_payload_snapshot: { test: 'payload' },
    });

    expect(result.schema_snapshot).toEqual({ type: 'object' });
    expect(result.sample_payload_snapshot).toEqual({ test: 'payload' });
    expect(result.generator_profile).toEqual({ mode: 'fast' });
    expect(result.related_txtp_config_id).toBe(5);
  });

  it('handles null sample_payload_snapshot (maps to undefined)', async () => {
    const noPayloadRow = {
      ...contextConfigRow,
      sample_payload_snapshot: null,
      related_txtp_config_id: null,
    };
    mockDb.mockResolvedValue({ rows: [noPayloadRow] });

    const result = await createContextTxtpConfigInDb({
      generation_id: 1,
      txtp: 'pacs.008',
      txtp_version: '001.08',
      display_order: 1,
      message_count: 100,
      schema_snapshot: {},
    });

    expect(result.sample_payload_snapshot).toBeUndefined();
    expect(result.related_txtp_config_id).toBeNull();
  });
});

describe('deleteTriggerTxtpConfigInDb', () => {
  it('returns true when target and related rows are deleted', async () => {
    mockDb.mockResolvedValue({ rows: [{ deleted_count: '2' }] } as never);
    expect(await deleteTriggerTxtpConfigInDb(20)).toBe(true);
    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('DELETE FROM trs_suite_trigger_txtp_configs') }),
      'simulation',
    );
    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('related_txtp_config_id') }), 'simulation');
  });

  it('returns false when row not found', async () => {
    mockDb.mockResolvedValue({ rows: [{ deleted_count: '0' }] } as never);
    expect(await deleteTriggerTxtpConfigInDb(999)).toBe(false);
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
      faker_semantic_type: 'iso20022.bic',
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

// ── createSuiteGenerationInDb — optional fields branch ───────────────────────

describe('createSuiteGenerationInDb — optional fields', () => {
  it('uses SINGLE_RULE default when simulation_type absent', async () => {
    mockDb.mockResolvedValue({ rows: [generationRow] });

    await createSuiteGenerationInDb({ suite_id: 42 } as any, 'user-1');

    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ values: expect.arrayContaining(['SINGLE_RULE']) }), 'simulation');
  });

  it('passes null for optional rule_repo, rule_version, userEmail when absent', async () => {
    mockDb.mockResolvedValue({ rows: [generationRow] });

    await createSuiteGenerationInDb({ suite_id: 42, simulation_type: 'INTEGRATION_TESTING' as any }, 'user-1');

    const callValues = (mockDb.mock.calls[0][0] as { values: unknown[] }).values;
    expect(callValues[2]).toBeNull(); // rule_repo
    expect(callValues[3]).toBeNull(); // rule_version
    expect(callValues[7]).toBeNull(); // userEmail
  });
});

// ── trigger-txtp-configs.repository ─────────────────────────────────────────

const triggerConfigRow = {
  id: 20,
  generation_id: 1,
  txtp: 'pacs.008',
  txtp_version: '001.08',
  display_order: 1,
  message_count: 1,
  link_to_context_pairs: false,
  payload_template_json: JSON.stringify({ amount: 100 }),
  expected_independent_variable: null,
  expected_result_band: null,
  notes: null,
  faker_seed: null,
  generator_profile: '{}',
  created_at: '2026-05-01T00:00:00.000Z',
};

const triggerStrategyRow = {
  id: 1,
  trigger_txtp_config_id: 20,
  field_path: 'amount',
  strategy_code: 'null',
  static_value: null,
  range_min: null,
  range_max: null,
  faker_semantic_type: null,
  generator_options: '{}',
  created_at: '2026-05-01T00:00:00.000Z',
};

describe('createTriggerTxtpConfigInDb', () => {
  it('inserts row and returns mapped trigger config', async () => {
    mockDb.mockResolvedValue({ rows: [triggerConfigRow] });

    const result = await createTriggerTxtpConfigInDb({
      generation_id: 1,
      txtp: 'pacs.008',
      txtp_version: '001.08',
      display_order: 1,
      message_count: 1,
      payload_template_json: { amount: 100 },
    });

    expect(result.id).toBe(20);
    expect(result.txtp).toBe('pacs.008');
    expect(result.payload_template_json).toEqual({ amount: 100 });
    expect(result.link_to_context_pairs).toBe(false);
    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('INSERT INTO trs_suite_trigger_txtp_configs') }),
      'simulation',
    );
  });

  it('parses payload_template_json when stored as object (not string)', async () => {
    const rowWithObj = { ...triggerConfigRow, payload_template_json: { amount: 100 } };
    mockDb.mockResolvedValue({ rows: [rowWithObj] });

    const result = await createTriggerTxtpConfigInDb({
      generation_id: 1,
      txtp: 'pacs.008',
      txtp_version: '001.08',
      display_order: 1,
      message_count: 1,
      payload_template_json: { amount: 100 },
    });

    expect(result.payload_template_json).toEqual({ amount: 100 });
  });

  it('handles optional fields: expected_result_band, notes, faker_seed', async () => {
    const rowWithOptionals = {
      ...triggerConfigRow,
      expected_result_band: 'good',
      notes: 'boundary case',
      faker_seed: 42,
    };
    mockDb.mockResolvedValue({ rows: [rowWithOptionals] });

    const result = await createTriggerTxtpConfigInDb({
      generation_id: 1,
      txtp: 'pacs.008',
      txtp_version: '001.08',
      display_order: 1,
      message_count: 1,
      payload_template_json: {},
      expected_result_band: 'good',
      notes: 'boundary case',
      faker_seed: 42,
    });

    expect(result.expected_result_band).toBe('good');
    expect(result.notes).toBe('boundary case');
    expect(result.faker_seed).toBe(42);
  });
});

describe('updateTriggerTxtpConfigInDb', () => {
  it('updates message_count and returns updated row', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...triggerConfigRow, message_count: 3 }] });

    const result = await updateTriggerTxtpConfigInDb(20, { message_count: 3 });

    expect(result!.message_count).toBe(3);
    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('UPDATE trs_suite_trigger_txtp_configs') }),
      'simulation',
    );
  });

  it('updates link_to_context_pairs', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...triggerConfigRow, link_to_context_pairs: true }] });
    const result = await updateTriggerTxtpConfigInDb(20, { link_to_context_pairs: true });
    expect(result!.link_to_context_pairs).toBe(true);
  });

  it('updates payload_template_json', async () => {
    const updated = { ...triggerConfigRow, payload_template_json: JSON.stringify({ amount: 999 }) };
    mockDb.mockResolvedValue({ rows: [updated] });
    const result = await updateTriggerTxtpConfigInDb(20, { payload_template_json: { amount: 999 } });
    expect(result!.payload_template_json).toEqual({ amount: 999 });
  });

  it('updates expected_result_band and notes', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...triggerConfigRow, expected_result_band: 'bad', notes: 'edge' }] });
    const result = await updateTriggerTxtpConfigInDb(20, { expected_result_band: 'bad', notes: 'edge' });
    expect(result!.expected_result_band).toBe('bad');
    expect(result!.notes).toBe('edge');
  });

  it('updates faker_seed and generator_profile', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...triggerConfigRow, faker_seed: 99 }] });
    const result = await updateTriggerTxtpConfigInDb(20, { faker_seed: 99, generator_profile: { type: 'bic' } });
    expect(result!.faker_seed).toBe(99);
  });

  it('fetches existing row when no fields to update', async () => {
    mockDb.mockResolvedValue({ rows: [triggerConfigRow] });
    const result = await updateTriggerTxtpConfigInDb(20, {});
    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('SELECT') }), 'simulation');
    expect(result).not.toBeNull();
  });

  it('returns null when no fields and row not found', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await updateTriggerTxtpConfigInDb(99, {})).toBeNull();
  });

  it('returns null when UPDATE finds no row', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await updateTriggerTxtpConfigInDb(99, { message_count: 5 })).toBeNull();
  });
});

describe('getTriggerTxtpConfigsByGenerationId', () => {
  it('returns mapped trigger configs array', async () => {
    mockDb.mockResolvedValue({ rows: [triggerConfigRow] });
    const result = await getTriggerTxtpConfigsByGenerationId(1);
    expect(result).toHaveLength(1);
    expect(result[0].generation_id).toBe(1);
  });

  it('returns empty array when no rows', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await getTriggerTxtpConfigsByGenerationId(1)).toEqual([]);
  });
});

// ── trigger-field-strategies.repository ─────────────────────────────────────

describe('upsertTriggerFieldStrategyInDb', () => {
  it('upserts row and returns mapped strategy', async () => {
    mockDb.mockResolvedValue({ rows: [triggerStrategyRow] });

    const result = await upsertTriggerFieldStrategyInDb(20, {
      field_path: 'amount',
      strategy_code: 'null',
    });

    expect(result.id).toBe(1);
    expect(result.trigger_txtp_config_id).toBe(20);
    expect(result.strategy_code).toBe('null');
    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('ON CONFLICT') }), 'simulation');
  });

  it('handles static strategy_code', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...triggerStrategyRow, strategy_code: 'static', static_value: '"999"' }] });

    const result = await upsertTriggerFieldStrategyInDb(20, {
      field_path: 'amount',
      strategy_code: 'static',
      static_value: '999',
    });

    expect(result.strategy_code).toBe('static');
  });

  it('handles range strategy_code', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...triggerStrategyRow, strategy_code: 'range', range_min: 1, range_max: 100 }] });

    const result = await upsertTriggerFieldStrategyInDb(20, {
      field_path: 'amount',
      strategy_code: 'range',
      range_min: 1,
      range_max: 100,
    });

    expect(result.range_min).toBe(1);
    expect(result.range_max).toBe(100);
  });

  it('handles generator_options as object (not string)', async () => {
    const rowWithObj = { ...triggerStrategyRow, generator_options: { type: 'bic' } };
    mockDb.mockResolvedValue({ rows: [rowWithObj] });

    const result = await upsertTriggerFieldStrategyInDb(20, {
      field_path: 'bic',
      strategy_code: 'generated',
      faker_semantic_type: 'iso20022.bic',
      generator_options: { type: 'bic' },
    });

    expect(result.generator_options).toEqual({ type: 'bic' });
  });

  it('handles skip strategy_code', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...triggerStrategyRow, strategy_code: 'skip' }] });
    const result = await upsertTriggerFieldStrategyInDb(20, { field_path: 'field.a', strategy_code: 'skip' });
    expect(result.strategy_code).toBe('skip');
  });
});

describe('getTriggerFieldStrategiesByConfigId', () => {
  it('returns mapped strategies array', async () => {
    mockDb.mockResolvedValue({ rows: [triggerStrategyRow] });

    const result = await getTriggerFieldStrategiesByConfigId(20);

    expect(result).toHaveLength(1);
    expect(result[0].field_path).toBe('amount');
    expect(result[0].strategy_code).toBe('null');
  });

  it('returns empty array when no rows', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await getTriggerFieldStrategiesByConfigId(20)).toEqual([]);
  });
});

// ── enrichment-tables.repository ─────────────────────────────────────────────

const enrichmentTableRow = {
  id: 30,
  generation_id: 1,
  table_name: 'account_enrichment',
  table_order: 1,
  row_count: 13,
  payload_template_json: JSON.stringify({ name: 'feeba', country: 'Pak' }),
  schema_template_json: null,
  faker_profile: '{}',
  created_at: '2026-06-01T00:00:00.000Z',
};

describe('createEnrichmentTableInDb', () => {
  it('inserts row and returns mapped enrichment table', async () => {
    mockDb.mockResolvedValue({ rows: [enrichmentTableRow] });

    const result = await createEnrichmentTableInDb({
      generation_id: 1,
      table_name: 'account_enrichment',
      row_count: 13,
      payload_template_json: { name: 'feeba', country: 'Pak' },
    });

    expect(result.id).toBe(30);
    expect(result.table_name).toBe('account_enrichment');
    expect(result.row_count).toBe(13);
    expect(result.payload_template_json).toEqual({ name: 'feeba', country: 'Pak' });
    expect(result.faker_profile).toEqual({});
    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('INSERT INTO trs_suite_enrichment_tables') }),
      'simulation',
    );
  });

  it('uses default table_order=1 when not provided', async () => {
    mockDb.mockResolvedValue({ rows: [enrichmentTableRow] });
    await createEnrichmentTableInDb({ generation_id: 1, table_name: 'cnic', row_count: 5 });
    const callValues = (mockDb.mock.calls[0][0] as { values: unknown[] }).values;
    expect(callValues[2]).toBe(1); // table_order default
  });

  it('handles null payload_template_json', async () => {
    const rowNoPayload = { ...enrichmentTableRow, payload_template_json: null };
    mockDb.mockResolvedValue({ rows: [rowNoPayload] });
    const result = await createEnrichmentTableInDb({ generation_id: 1, table_name: 'x', row_count: 1 });
    expect(result.payload_template_json).toBeUndefined();
  });

  it('parses payload_template_json when already an object', async () => {
    const rowObjPayload = { ...enrichmentTableRow, payload_template_json: { name: 'feeba' } };
    mockDb.mockResolvedValue({ rows: [rowObjPayload] });
    const result = await createEnrichmentTableInDb({ generation_id: 1, table_name: 'x', row_count: 1 });
    expect(result.payload_template_json).toEqual({ name: 'feeba' });
  });

  it('parses faker_profile when already an object', async () => {
    const rowObjFaker = { ...enrichmentTableRow, faker_profile: { locale: 'ur' } };
    mockDb.mockResolvedValue({ rows: [rowObjFaker] });
    const result = await createEnrichmentTableInDb({ generation_id: 1, table_name: 'x', row_count: 1 });
    expect(result.faker_profile).toEqual({ locale: 'ur' });
  });

  it('defaults faker_profile to {} when null', async () => {
    const rowNullFaker = { ...enrichmentTableRow, faker_profile: null };
    mockDb.mockResolvedValue({ rows: [rowNullFaker] });
    const result = await createEnrichmentTableInDb({ generation_id: 1, table_name: 'x', row_count: 1 });
    expect(result.faker_profile).toEqual({});
  });
});

describe('updateEnrichmentTableInDb', () => {
  it('updates row_count and returns mapped row', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...enrichmentTableRow, row_count: 5 }] });
    const result = await updateEnrichmentTableInDb(30, 1, { row_count: 5 });
    expect(result!.row_count).toBe(5);
    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('UPDATE trs_suite_enrichment_tables') }),
      'simulation',
    );
  });

  it('updates payload_template_json', async () => {
    mockDb.mockResolvedValue({ rows: [enrichmentTableRow] });
    await updateEnrichmentTableInDb(30, 1, { payload_template_json: { city: 'Karachi' } });
    const callArg = (mockDb.mock.calls[0][0] as { values: unknown[] }).values;
    expect(callArg).toContain(JSON.stringify({ city: 'Karachi' }));
  });

  it('updates schema_template_json', async () => {
    mockDb.mockResolvedValue({ rows: [enrichmentTableRow] });
    await updateEnrichmentTableInDb(30, 1, { schema_template_json: { col: 'VARCHAR' } });
    const callArg = (mockDb.mock.calls[0][0] as { values: unknown[] }).values;
    expect(callArg).toContain(JSON.stringify({ col: 'VARCHAR' }));
  });

  it('updates faker_profile', async () => {
    mockDb.mockResolvedValue({ rows: [enrichmentTableRow] });
    await updateEnrichmentTableInDb(30, 1, { faker_profile: { locale: 'ur' } });
    const callArg = (mockDb.mock.calls[0][0] as { values: unknown[] }).values;
    expect(callArg).toContain(JSON.stringify({ locale: 'ur' }));
  });

  it('fetches existing row when no fields to update', async () => {
    mockDb.mockResolvedValue({ rows: [enrichmentTableRow] });
    const result = await updateEnrichmentTableInDb(30, 1, {});
    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('SELECT') }), 'simulation');
    expect(result).not.toBeNull();
  });

  it('returns null when no fields and row not found', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await updateEnrichmentTableInDb(99, 1, {})).toBeNull();
  });

  it('returns null when UPDATE finds no row', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await updateEnrichmentTableInDb(99, 1, { row_count: 5 })).toBeNull();
  });
});

describe('getNextEnrichmentTableOrderInDb', () => {
  it('returns next table order for a generation', async () => {
    mockDb.mockResolvedValue({ rows: [{ next_order: '4' }] });
    await expect(getNextEnrichmentTableOrderInDb(1)).resolves.toBe(4);
  });

  it('defaults to 1 when query has no row', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    await expect(getNextEnrichmentTableOrderInDb(1)).resolves.toBe(1);
  });
});

describe('getEnrichmentTablesByGenerationId', () => {
  it('returns mapped array ordered by table_order', async () => {
    mockDb.mockResolvedValue({ rows: [enrichmentTableRow] });
    const result = await getEnrichmentTablesByGenerationId(1);
    expect(result).toHaveLength(1);
    expect(result[0].generation_id).toBe(1);
    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('ORDER BY table_order ASC') }),
      'simulation',
    );
  });

  it('returns empty array when no rows', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await getEnrichmentTablesByGenerationId(1)).toEqual([]);
  });
});

describe('deleteEnrichmentTableInDb', () => {
  it('returns true when row deleted', async () => {
    mockDb.mockResolvedValue({ rows: [{ id: 30 }] });
    expect(await deleteEnrichmentTableInDb(30)).toBe(true);
    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('DELETE FROM trs_suite_enrichment_tables') }),
      'simulation',
    );
  });

  it('returns false when row not found', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await deleteEnrichmentTableInDb(999)).toBe(false);
  });
});

// ── updateGenerationCountsInDb ────────────────────────────────────────────────

describe('updateGenerationCountsInDb', () => {
  it('updates context_count only', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    await updateGenerationCountsInDb(1, { context_count: 100 });
    const callArg = mockDb.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(callArg.text).toContain('context_count');
    expect(callArg.text).not.toContain('trigger_count');
    expect(callArg.values).toContain(100);
    expect(callArg.values).toContain(1);
  });

  it('updates trigger_count only', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    await updateGenerationCountsInDb(1, { trigger_count: 10 });
    const callArg = mockDb.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(callArg.text).toContain('trigger_count');
    expect(callArg.values).toContain(10);
  });

  it('updates enrichment_table_count only', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    await updateGenerationCountsInDb(1, { enrichment_table_count: 3 });
    const callArg = mockDb.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(callArg.text).toContain('enrichment_table_count');
    expect(callArg.values).toContain(3);
  });

  it('updates all three counts in one call', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    await updateGenerationCountsInDb(7, { context_count: 100, trigger_count: 10, enrichment_table_count: 2 });
    const callArg = mockDb.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(callArg.text).toContain('context_count');
    expect(callArg.text).toContain('trigger_count');
    expect(callArg.text).toContain('enrichment_table_count');
    expect(callArg.values).toContain(7);
  });

  it('does nothing when counts object is empty', async () => {
    await updateGenerationCountsInDb(1, {});
    expect(mockDb).not.toHaveBeenCalled();
  });

  it('includes updated_at = NOW() in SET clause', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    await updateGenerationCountsInDb(1, { context_count: 5 });
    const callArg = mockDb.mock.calls[0][0] as { text: string };
    expect(callArg.text).toContain('updated_at = NOW()');
  });
});

// ── getGenerationSummaryFromDb ────────────────────────────────────────────────

describe('getGenerationSummaryFromDb', () => {
  const summaryGenRow = {
    generation_id: 7,
    generation_number: 1,
    status: 'DRAFT',
    context_count: 100,
    trigger_count: 10,
    enrichment_table_count: 1,
    suite_name: 'Q3 Edge Cases',
    associated_rule: 'Rule 001',
    primary_txtp: 'pacs.008',
    iteration_number: 0,
  };

  it('returns null when generation not found', async () => {
    mockDb.mockResolvedValueOnce({ rows: [] } as never);
    const result = await getGenerationSummaryFromDb(999);
    expect(result).toBeNull();
  });

  it('returns summary with context configs and enrichment table names', async () => {
    mockDb
      .mockResolvedValueOnce({ rows: [summaryGenRow] } as never)
      .mockResolvedValueOnce({ rows: [{ txtp: 'pacs.008', txtp_version: '001.08', message_count: 100 }] } as never)
      .mockResolvedValueOnce({ rows: [{ table_name: 'account_enrichment' }] } as never);

    const result = await getGenerationSummaryFromDb(7);

    expect(result).not.toBeNull();
    expect(result!.generation_id).toBe(7);
    expect(result!.suite_name).toBe('Q3 Edge Cases');
    expect(result!.associated_rule).toBe('Rule 001');
    expect(result!.primary_txtp).toBe('pacs.008');
    expect(result!.context_txtp_configs).toHaveLength(1);
    expect(result!.context_txtp_configs[0]).toEqual({ txtp: 'pacs.008', txtp_version: '001.08', message_count: 100 });
    expect(result!.enrichment_table_names).toEqual(['account_enrichment']);
    expect(result!.context_count).toBe(100);
    expect(result!.trigger_count).toBe(10);
    expect(result!.enrichment_table_count).toBe(1);
  });

  it('returns empty arrays when no context configs or enrichment tables', async () => {
    mockDb
      .mockResolvedValueOnce({ rows: [summaryGenRow] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const result = await getGenerationSummaryFromDb(7);

    expect(result!.context_txtp_configs).toEqual([]);
    expect(result!.enrichment_table_names).toEqual([]);
  });

  it('handles null associated_rule and primary_txtp', async () => {
    const rowNoRule = { ...summaryGenRow, associated_rule: null, primary_txtp: null };
    mockDb
      .mockResolvedValueOnce({ rows: [rowNoRule] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const result = await getGenerationSummaryFromDb(7);

    expect(result!.associated_rule).toBeNull();
    expect(result!.primary_txtp).toBeNull();
  });
});

// ── updateWizardProgressInDb ─────────────────────────────────────────────────

describe('updateWizardProgressInDb', () => {
  it('updates wizard_snapshot with currentStep and completedSteps array', async () => {
    mockDb.mockResolvedValue({ rows: [] } as never);

    await updateWizardProgressInDb(7, 3, [1, 2, 3]);

    const callArg = mockDb.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(callArg.text).toContain('UPDATE trs_suite_generations');
    expect(callArg.text).toContain('wizard_snapshot');
    expect(callArg.text).toContain('currentStep');
    expect(callArg.text).toContain('completedSteps');
    expect(callArg.values[0]).toBe(3);
    expect(callArg.values[1]).toBe(JSON.stringify([1, 2, 3]));
    expect(callArg.values[2]).toBe(7);
  });

  it('serializes completedSteps array as JSON', async () => {
    mockDb.mockResolvedValue({ rows: [] } as never);

    await updateWizardProgressInDb(7, 5, [1, 2, 3, 4, 5]);

    const callArg = mockDb.mock.calls[0][0] as { values: unknown[] };
    expect(callArg.values[1]).toBe('[1,2,3,4,5]');
  });

  it('handles step 1 with single completed step', async () => {
    mockDb.mockResolvedValue({ rows: [] } as never);

    await updateWizardProgressInDb(7, 1, [1]);

    const callArg = mockDb.mock.calls[0][0] as { values: unknown[] };
    expect(callArg.values[0]).toBe(1);
    expect(callArg.values[1]).toBe('[1]');
    expect(callArg.values[2]).toBe(7);
  });

  it('includes updated_at = NOW() in SET clause', async () => {
    mockDb.mockResolvedValue({ rows: [] } as never);
    await updateWizardProgressInDb(7, 2, [1, 2]);
    const callArg = mockDb.mock.calls[0][0] as { text: string };
    expect(callArg.text).toContain('updated_at = NOW()');
  });
});

describe('resumeGenerationInDb', () => {
  it('returns latest DRAFT generation when found', async () => {
    mockDb.mockResolvedValue({ rows: [generationRow] });

    const result = await resumeGenerationInDb(42);

    expect(result).not.toBeNull();
    expect(result!.suite_id).toBe(42);
    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ values: [42] }), 'simulation');
  });

  it('returns null when no DRAFT generation exists', async () => {
    mockDb.mockResolvedValue({ rows: [] });

    expect(await resumeGenerationInDb(42)).toBeNull();
  });
});

describe('updateGenerationStatusInDb', () => {
  it('updates status and returns mapped generation', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...generationRow, status: 'READY' }] });

    const result = await updateGenerationStatusInDb(1, 'READY');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('READY');
    const callArg = mockDb.mock.calls[0][0] as { values: unknown[] };
    expect(callArg.values).toEqual(['READY', 1]);
  });

  it('returns null when generation is not found', async () => {
    mockDb.mockResolvedValue({ rows: [] });

    expect(await updateGenerationStatusInDb(999, 'COMPLETED')).toBeNull();
  });
});

describe('getContextTxtpConfigById', () => {
  it('returns mapped config when found', async () => {
    mockDb.mockResolvedValue({ rows: [contextConfigRow] });

    const result = await getContextTxtpConfigById(1);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ values: [1] }), 'simulation');
  });

  it('returns null when config does not exist', async () => {
    mockDb.mockResolvedValue({ rows: [] });

    expect(await getContextTxtpConfigById(999)).toBeNull();
  });
});

describe('getTriggerTxtpConfigByIdInDb', () => {
  it('returns mapped config when found', async () => {
    mockDb.mockResolvedValue({ rows: [triggerConfigRow] });

    const result = await getTriggerTxtpConfigByIdInDb(20);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(20);
    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ values: [20] }), 'simulation');
  });

  it('returns null when config does not exist', async () => {
    mockDb.mockResolvedValue({ rows: [] });

    expect(await getTriggerTxtpConfigByIdInDb(999)).toBeNull();
  });
});

describe('getEnrichmentFieldStrategiesByTableId', () => {
  it('returns mapped strategies and defaults null column_type to text', async () => {
    mockDb.mockResolvedValue({ rows: [enrichmentFieldStrategyRow] });

    const result = await getEnrichmentFieldStrategiesByTableId(30);

    expect(result).toHaveLength(1);
    expect(result[0].enrichment_table_id).toBe(30);
    expect(result[0].column_type).toBe('text');
    expect(result[0].generator_options).toEqual({ min: 1, max: 99 });
  });

  it('returns empty array when no strategies exist', async () => {
    mockDb.mockResolvedValue({ rows: [] });

    expect(await getEnrichmentFieldStrategiesByTableId(30)).toEqual([]);
  });
});

// ── getGenerationByIdFromDb ───────────────────────────────────────────────────

describe('getGenerationByIdFromDb', () => {
  it('returns mapped generation when found', async () => {
    mockDb.mockResolvedValue({ rows: [generationRow] } as never);
    const result = await getGenerationByIdFromDb(1);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('SELECT * FROM trs_suite_generations WHERE id = $1') }),
      'simulation',
    );
  });

  it('returns null when not found', async () => {
    mockDb.mockResolvedValue({ rows: [] } as never);
    expect(await getGenerationByIdFromDb(999)).toBeNull();
  });
});

// ── cloneGenerationDataInDb ───────────────────────────────────────────────────

describe('cloneGenerationDataInDb', () => {
  it('inserts new generation row with target suite id and generation number', async () => {
    mockDb
      .mockResolvedValueOnce({ rows: [{ ...generationRow, id: 99, suite_id: 5, generation_number: 2 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const result = await cloneGenerationDataInDb(1, 5, 2, 'user-1', 'user@test.com');

    expect(result.id).toBe(99);
    expect(result.suite_id).toBe(5);
    expect(result.generation_number).toBe(2);
    // First DB call inserts into trs_suite_generations
    const firstCall = mockDb.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(firstCall.text).toContain('INSERT INTO trs_suite_generations');
    expect(firstCall.values[0]).toBe(5); // targetSuiteId
    expect(firstCall.values[1]).toBe(2); // targetGenerationNumber
    expect(firstCall.values[2]).toBe('user-1');
  });

  it('clones context txtp configs and their field strategies', async () => {
    mockDb
      .mockResolvedValueOnce({ rows: [{ ...generationRow, id: 99 }] } as never)
      .mockResolvedValueOnce({ rows: [{ old_id: 10, new_id: 20 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await cloneGenerationDataInDb(1, 5, 2, 'user-1');

    // Second call = context txtp clone WITH/SELECT
    const ctxCall = mockDb.mock.calls[1][0] as { text: string };
    expect(ctxCall.text).toContain('trs_suite_context_txtp_configs');

    // Third call = field strategy insert for mapped config
    const fsCall = mockDb.mock.calls[2][0] as { text: string; values: unknown[] };
    expect(fsCall.text).toContain('trs_suite_context_field_strategies');
    expect(fsCall.values[0]).toBe(20); // newId
    expect(fsCall.values[1]).toBe(10); // oldId
  });

  it('clones trigger txtp configs and their field overrides', async () => {
    mockDb
      .mockResolvedValueOnce({ rows: [{ ...generationRow, id: 99 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ old_id: 30, new_id: 40 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await cloneGenerationDataInDb(1, 5, 2, 'user-1');

    const trigCall = mockDb.mock.calls[2][0] as { text: string };
    expect(trigCall.text).toContain('trs_suite_trigger_txtp_configs');

    const overrideCall = mockDb.mock.calls[3][0] as { text: string; values: unknown[] };
    expect(overrideCall.text).toContain('trs_suite_trigger_field_strategies');
    expect(overrideCall.values[0]).toBe(40);
    expect(overrideCall.values[1]).toBe(30);
  });

  it('clones enrichment tables', async () => {
    mockDb
      .mockResolvedValueOnce({ rows: [{ ...generationRow, id: 99 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await cloneGenerationDataInDb(1, 5, 2, 'user-1');

    const enrichCall = mockDb.mock.calls[3][0] as { text: string };
    expect(enrichCall.text).toContain('trs_suite_enrichment_tables');
  });
});
