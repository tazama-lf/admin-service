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
import {
  createTriggerTxtpConfigInDb,
  updateTriggerTxtpConfigInDb,
  getTriggerTxtpConfigsByGenerationId,
} from '../../src/repositories/simulation-studio/trigger-txtp-configs.repository';
import {
  upsertTriggerFieldOverrideInDb,
  getTriggerFieldOverridesByConfigId,
} from '../../src/repositories/simulation-studio/trigger-field-strategies.repository';
import {
  createEnrichmentTableInDb,
  updateEnrichmentTableInDb,
  getEnrichmentTablesByGenerationId,
  deleteEnrichmentTableInDb,
} from '../../src/repositories/simulation-studio/enrichment-tables.repository';
import {
  upsertEnrichmentFieldStrategyInDb,
  getEnrichmentFieldStrategiesByTableId,
} from '../../src/repositories/simulation-studio/enrichment-field-strategies.repository';

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

// ── createSuiteGenerationInDb — optional fields branch ───────────────────────

describe('createSuiteGenerationInDb — optional fields', () => {
  it('uses SINGLE_RULE default when simulation_type absent', async () => {
    mockDb.mockResolvedValue({ rows: [generationRow] });

    await createSuiteGenerationInDb({ suite_id: 42 } as any, 1, 'user-1');

    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ values: expect.arrayContaining(['SINGLE_RULE']) }), 'simulation');
  });

  it('passes null for optional rule_repo, rule_version, userEmail when absent', async () => {
    mockDb.mockResolvedValue({ rows: [generationRow] });

    await createSuiteGenerationInDb({ suite_id: 42, simulation_type: 'INTEGRATION_TESTING' as any }, 1, 'user-1');

    const callValues = (mockDb.mock.calls[0][0] as { values: unknown[] }).values;
    expect(callValues[3]).toBeNull(); // rule_repo
    expect(callValues[4]).toBeNull(); // rule_version
    expect(callValues[8]).toBeNull(); // userEmail
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

const triggerOverrideRow = {
  id: 1,
  trigger_txtp_config_id: 20,
  field_path: 'amount',
  override_type: 'null',
  static_value: null,
  range_min: null,
  range_max: null,
  generator_type: null,
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

describe('upsertTriggerFieldOverrideInDb', () => {
  it('upserts row and returns mapped override', async () => {
    mockDb.mockResolvedValue({ rows: [triggerOverrideRow] });

    const result = await upsertTriggerFieldOverrideInDb(20, {
      field_path: 'amount',
      override_type: 'null',
    });

    expect(result.id).toBe(1);
    expect(result.trigger_txtp_config_id).toBe(20);
    expect(result.override_type).toBe('null');
    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('ON CONFLICT') }), 'simulation');
  });

  it('handles static override type', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...triggerOverrideRow, override_type: 'static', static_value: '"999"' }] });

    const result = await upsertTriggerFieldOverrideInDb(20, {
      field_path: 'amount',
      override_type: 'static',
      static_value: '999',
    });

    expect(result.override_type).toBe('static');
  });

  it('handles range override type', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...triggerOverrideRow, override_type: 'range', range_min: 1, range_max: 100 }] });

    const result = await upsertTriggerFieldOverrideInDb(20, {
      field_path: 'amount',
      override_type: 'range',
      range_min: 1,
      range_max: 100,
    });

    expect(result.range_min).toBe(1);
    expect(result.range_max).toBe(100);
  });

  it('handles generator_options as object (not string)', async () => {
    const rowWithObj = { ...triggerOverrideRow, generator_options: { type: 'bic' } };
    mockDb.mockResolvedValue({ rows: [rowWithObj] });

    const result = await upsertTriggerFieldOverrideInDb(20, {
      field_path: 'bic',
      override_type: 'generated',
      generator_type: 'iso20022.bic',
      generator_options: { type: 'bic' },
    });

    expect(result.generator_options).toEqual({ type: 'bic' });
  });

  it('handles remove override type', async () => {
    mockDb.mockResolvedValue({ rows: [{ ...triggerOverrideRow, override_type: 'remove' }] });
    const result = await upsertTriggerFieldOverrideInDb(20, { field_path: 'field.a', override_type: 'remove' });
    expect(result.override_type).toBe('remove');
  });
});

describe('getTriggerFieldOverridesByConfigId', () => {
  it('returns mapped overrides array', async () => {
    mockDb.mockResolvedValue({ rows: [triggerOverrideRow] });

    const result = await getTriggerFieldOverridesByConfigId(20);

    expect(result).toHaveLength(1);
    expect(result[0].field_path).toBe('amount');
    expect(result[0].override_type).toBe('null');
  });

  it('returns empty array when no rows', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await getTriggerFieldOverridesByConfigId(20)).toEqual([]);
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

const enrichmentStrategyRow = {
  id: 1,
  enrichment_table_id: 30,
  column_name: 'name',
  column_type: null,
  strategy_code: 'null',
  static_value: null,
  range_min: null,
  range_max: null,
  generator_type: null,
  generator_options: '{}',
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
    const result = await updateEnrichmentTableInDb(30, { row_count: 5 });
    expect(result!.row_count).toBe(5);
    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('UPDATE trs_suite_enrichment_tables') }),
      'simulation',
    );
  });

  it('updates payload_template_json', async () => {
    mockDb.mockResolvedValue({ rows: [enrichmentTableRow] });
    await updateEnrichmentTableInDb(30, { payload_template_json: { city: 'Karachi' } });
    const callArg = (mockDb.mock.calls[0][0] as { values: unknown[] }).values;
    expect(callArg).toContain(JSON.stringify({ city: 'Karachi' }));
  });

  it('updates schema_template_json', async () => {
    mockDb.mockResolvedValue({ rows: [enrichmentTableRow] });
    await updateEnrichmentTableInDb(30, { schema_template_json: { col: 'VARCHAR' } });
    const callArg = (mockDb.mock.calls[0][0] as { values: unknown[] }).values;
    expect(callArg).toContain(JSON.stringify({ col: 'VARCHAR' }));
  });

  it('updates faker_profile', async () => {
    mockDb.mockResolvedValue({ rows: [enrichmentTableRow] });
    await updateEnrichmentTableInDb(30, { faker_profile: { locale: 'ur' } });
    const callArg = (mockDb.mock.calls[0][0] as { values: unknown[] }).values;
    expect(callArg).toContain(JSON.stringify({ locale: 'ur' }));
  });

  it('fetches existing row when no fields to update', async () => {
    mockDb.mockResolvedValue({ rows: [enrichmentTableRow] });
    const result = await updateEnrichmentTableInDb(30, {});
    expect(mockDb).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('SELECT') }), 'simulation');
    expect(result).not.toBeNull();
  });

  it('returns null when no fields and row not found', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await updateEnrichmentTableInDb(99, {})).toBeNull();
  });

  it('returns null when UPDATE finds no row', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await updateEnrichmentTableInDb(99, { row_count: 5 })).toBeNull();
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

// ── enrichment-field-strategies.repository ───────────────────────────────────

describe('upsertEnrichmentFieldStrategyInDb', () => {
  it('upserts row with column_name and returns mapped strategy', async () => {
    mockDb.mockResolvedValue({ rows: [enrichmentStrategyRow] });

    const result = await upsertEnrichmentFieldStrategyInDb(30, {
      column_name: 'name',
      strategy_code: 'null',
    });

    expect(result.id).toBe(1);
    expect(result.enrichment_table_id).toBe(30);
    expect(result.column_name).toBe('name');
    expect(result.strategy_code).toBe('null');
    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('ON CONFLICT (enrichment_table_id, column_name)') }),
      'simulation',
    );
  });

  it('handles column_type', async () => {
    const rowWithType = { ...enrichmentStrategyRow, column_type: 'VARCHAR(128)' };
    mockDb.mockResolvedValue({ rows: [rowWithType] });
    const result = await upsertEnrichmentFieldStrategyInDb(30, { column_name: 'name', column_type: 'VARCHAR(128)', strategy_code: 'null' });
    expect(result.column_type).toBe('VARCHAR(128)');
  });

  it('handles static strategy', async () => {
    const staticRow = { ...enrichmentStrategyRow, strategy_code: 'static', static_value: '"Ahmad"' };
    mockDb.mockResolvedValue({ rows: [staticRow] });
    const result = await upsertEnrichmentFieldStrategyInDb(30, { column_name: 'name', strategy_code: 'static', static_value: 'Ahmad' });
    expect(result.strategy_code).toBe('static');
  });

  it('handles range strategy', async () => {
    const rangeRow = { ...enrichmentStrategyRow, strategy_code: 'range', range_min: 1, range_max: 100 };
    mockDb.mockResolvedValue({ rows: [rangeRow] });
    const result = await upsertEnrichmentFieldStrategyInDb(30, {
      column_name: 'age',
      strategy_code: 'range',
      range_min: 1,
      range_max: 100,
    });
    expect(result.range_min).toBe(1);
    expect(result.range_max).toBe(100);
  });

  it('handles generator_options as object (not string)', async () => {
    const rowWithObj = { ...enrichmentStrategyRow, generator_options: { type: 'name' } };
    mockDb.mockResolvedValue({ rows: [rowWithObj] });
    const result = await upsertEnrichmentFieldStrategyInDb(30, {
      column_name: 'name',
      strategy_code: 'generated',
      generator_type: 'faker.name',
      generator_options: { type: 'name' },
    });
    expect(result.generator_options).toEqual({ type: 'name' });
  });

  it('handles copy strategy', async () => {
    const copyRow = { ...enrichmentStrategyRow, strategy_code: 'copy' };
    mockDb.mockResolvedValue({ rows: [copyRow] });
    const result = await upsertEnrichmentFieldStrategyInDb(30, { column_name: 'name', strategy_code: 'copy' });
    expect(result.strategy_code).toBe('copy');
  });
});

describe('getEnrichmentFieldStrategiesByTableId', () => {
  it('returns mapped strategies ordered by column_name', async () => {
    mockDb.mockResolvedValue({ rows: [enrichmentStrategyRow] });
    const result = await getEnrichmentFieldStrategiesByTableId(30);
    expect(result).toHaveLength(1);
    expect(result[0].column_name).toBe('name');
    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('ORDER BY column_name ASC') }),
      'simulation',
    );
  });

  it('returns empty array when no rows', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    expect(await getEnrichmentFieldStrategiesByTableId(30)).toEqual([]);
  });
});
