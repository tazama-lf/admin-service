// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: jest.fn(),
}));

import * as db from '../../src/services/database.logic.service';
import {
  getEnrichmentFieldStrategiesByTableId,
  insertEnrichmentFieldStrategyInDb,
  deleteEnrichmentFieldStrategiesByTableIdInDb,
} from '../../src/repositories/simulation-studio/enrichment-field-strategies.repository';

const mockDb = db.handlePostExecuteSqlStatement as jest.Mock;

const makeRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 1,
  enrichment_table_id: 99,
  column_name: 'amount',
  column_type: 'number',
  strategy_code: 'random',
  static_value: null,
  range_min: null,
  range_max: null,
  generator_type: 'uuid',
  generator_options: '{"foo":"bar"}',
  created_at: '2026-06-18T00:00:00.000Z',
  ...overrides,
});

describe('enrichment-field-strategies.repository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getEnrichmentFieldStrategiesByTableId', () => {
    it('returns mapped rows when generator_options is a string', async () => {
      mockDb.mockResolvedValue({ rows: [makeRow()] } as never);

      const out = await getEnrichmentFieldStrategiesByTableId(99);

      expect(mockDb).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('SELECT * FROM trs_suite_enrichment_field_strategies'),
          values: [99],
        }),
        'simulation',
      );
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        id: 1,
        enrichment_table_id: 99,
        column_name: 'amount',
        column_type: 'number',
        strategy_code: 'random',
        generator_type: 'uuid',
        generator_options: { foo: 'bar' },
      });
      expect(out[0].created_at).toBeInstanceOf(Date);
    });

    it('uses the object form of generator_options when not stringified', async () => {
      mockDb.mockResolvedValue({
        rows: [makeRow({ generator_options: { picked: 'object' } })],
      } as never);

      const out = await getEnrichmentFieldStrategiesByTableId(99);

      expect(out[0].generator_options).toEqual({ picked: 'object' });
    });

    it("defaults column_type to 'text' when the row's column_type is null", async () => {
      mockDb.mockResolvedValue({ rows: [makeRow({ column_type: null })] } as never);

      const out = await getEnrichmentFieldStrategiesByTableId(99);

      expect(out[0].column_type).toBe('text');
    });
  });

  describe('insertEnrichmentFieldStrategyInDb', () => {
    it('inserts the row with all DTO fields serialised', async () => {
      mockDb.mockResolvedValue({ rows: [makeRow()] } as never);

      const dto = {
        column_name: 'amount',
        column_type: 'number',
        strategy_code: 'static' as const,
        static_value: { a: 1 },
        range_min: 10,
        range_max: 20,
        generator_type: '5',
        generator_options: { foo: 'bar' },
      };

      const out = await insertEnrichmentFieldStrategyInDb(42, dto);

      expect(mockDb).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('INSERT INTO trs_suite_enrichment_field_strategies'),
          values: [42, 'amount', 'number', 'static', JSON.stringify({ a: 1 }), 10, 20, '5', JSON.stringify({ foo: 'bar' })],
        }),
        'simulation',
      );
      expect(out.column_name).toBe('amount');
    });

    it('substitutes nulls for optional fields when omitted', async () => {
      mockDb.mockResolvedValue({ rows: [makeRow()] } as never);

      await insertEnrichmentFieldStrategyInDb(42, {
        column_name: 'email',
        strategy_code: 'keep_sample',
      });

      // values: [tableId, name, column_type=null, code, static=null, min=null, max=null, gen=null, options="{}"]
      const calledArgs = mockDb.mock.calls[0]?.[0] as { values: unknown[] };
      expect(calledArgs.values).toEqual([42, 'email', null, 'keep_sample', null, null, null, null, '{}']);
    });
  });

  describe('deleteEnrichmentFieldStrategiesByTableIdInDb', () => {
    it('deletes all strategies for the given table id', async () => {
      mockDb.mockResolvedValue({ rows: [] } as never);

      await deleteEnrichmentFieldStrategiesByTableIdInDb(77);

      expect(mockDb).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('DELETE FROM trs_suite_enrichment_field_strategies'),
          values: [77],
        }),
        'simulation',
      );
    });
  });
});
