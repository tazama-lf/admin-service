// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from '@jest/globals';

import { fieldStrategiesFromSchemaTemplate } from '../../src/utils/enrichment-schema-template';

describe('fieldStrategiesFromSchemaTemplate', () => {
  it('returns [] for missing or malformed schemas', () => {
    expect(fieldStrategiesFromSchemaTemplate(undefined)).toEqual([]);
    expect(fieldStrategiesFromSchemaTemplate({})).toEqual([]);
    expect(fieldStrategiesFromSchemaTemplate({ properties: 'not-an-array' })).toEqual([]);
  });

  it('maps UI strategy strings to resolver strategy codes (case + space tolerant)', () => {
    const out = fieldStrategiesFromSchemaTemplate({
      properties: [
        { fieldName: 'a', strategy: 'Random' },
        { fieldName: 'b', strategy: 'Sample Value' },
        { fieldName: 'c', strategy: 'sample-value' },
        { fieldName: 'd', strategy: 'Static' },
        { fieldName: 'e', strategy: 'Range' },
        { fieldName: 'f', strategy: 'Skip' },
        { fieldName: 'g', strategy: 'remove' },
        { fieldName: 'h', strategy: 'totally-unknown' },
        { fieldName: 'i' /* strategy omitted */ },
      ],
    });

    expect(out.map((r) => [r.column_name, r.strategy_code])).toEqual([
      ['a', 'random'],
      ['b', 'keep_sample'],
      ['c', 'keep_sample'],
      ['d', 'static'],
      ['e', 'range'],
      ['f', 'skip'],
      ['g', 'skip'],
      ['h', 'keep_sample'], // unknown falls back safely
      ['i', 'keep_sample'], // missing falls back safely
    ]);
  });

  it('lowercases known UI type tokens and passes unknown ones through lowercased', () => {
    const out = fieldStrategiesFromSchemaTemplate({
      properties: [
        { fieldName: 'a', type: 'String' },
        { fieldName: 'b', type: 'Number' },
        { fieldName: 'c', type: 'Int' },
        { fieldName: 'd', type: 'Boolean' },
        { fieldName: 'e', type: 'Bool' },
        { fieldName: 'f', type: 'Custom' },
        { fieldName: 'g' /* type omitted */ },
      ],
    });

    expect(out.map((r) => [r.column_name, r.column_type])).toEqual([
      ['a', 'string'],
      ['b', 'number'],
      ['c', 'integer'],
      ['d', 'boolean'],
      ['e', 'boolean'],
      ['f', 'custom'],
      ['g', undefined],
    ]);
  });

  it("parses a hyphen-stuffed rangeMin like '100-300' into separate min/max", () => {
    const [row] = fieldStrategiesFromSchemaTemplate({
      properties: [{ fieldName: 'amount', strategy: 'Range', rangeMin: '100-300', rangeMax: '' }],
    });

    expect(row).toMatchObject({ range_min: 100, range_max: 300 });
  });

  it('accepts plain numeric rangeMin / rangeMax (both numbers and numeric strings)', () => {
    const out = fieldStrategiesFromSchemaTemplate({
      properties: [
        { fieldName: 'a', strategy: 'Range', rangeMin: 5, rangeMax: 7 },
        { fieldName: 'b', strategy: 'Range', rangeMin: '10', rangeMax: '20' },
      ],
    });

    expect(out[0]).toMatchObject({ range_min: 5, range_max: 7 });
    expect(out[1]).toMatchObject({ range_min: 10, range_max: 20 });
  });

  it('drops range_min/range_max entirely when no usable numbers are present', () => {
    const [row] = fieldStrategiesFromSchemaTemplate({
      properties: [{ fieldName: 'a', strategy: 'Range', rangeMin: '', rangeMax: '' }],
    });

    expect(row.range_min).toBeUndefined();
    expect(row.range_max).toBeUndefined();
  });

  it('passes semanticId through as generator_type, but ignores blank/whitespace values', () => {
    const out = fieldStrategiesFromSchemaTemplate({
      properties: [
        { fieldName: 'a', strategy: 'Random', semanticId: '7' },
        { fieldName: 'b', strategy: 'Random', semanticId: '   ' },
        { fieldName: 'c', strategy: 'Random' /* semanticId omitted */ },
      ],
    });

    expect(out[0].generator_type).toBe('7');
    expect(out[1].generator_type).toBeUndefined();
    expect(out[2].generator_type).toBeUndefined();
  });

  it('keeps a static_value when present (non-empty), drops it when empty/undefined', () => {
    const out = fieldStrategiesFromSchemaTemplate({
      properties: [
        { fieldName: 'a', strategy: 'Static', staticValue: '5,10,15' },
        { fieldName: 'b', strategy: 'Static', staticValue: '' },
        { fieldName: 'c', strategy: 'Static' /* staticValue omitted */ },
      ],
    });

    expect(out[0].static_value).toBe('5,10,15');
    expect(out[1].static_value).toBeUndefined();
    expect(out[2].static_value).toBeUndefined();
  });

  it('skips entries with no usable field path (no fieldName/id or empty string)', () => {
    const out = fieldStrategiesFromSchemaTemplate({
      properties: [
        { strategy: 'Random' }, // no fieldName/id at all
        { fieldName: '', strategy: 'Random' },
        { fieldName: '   ', strategy: 'Random' },
        { id: 'falls.back.to.id', strategy: 'Random' },
        { fieldName: 'prefer.fieldName', id: 'shadowed', strategy: 'Random' },
      ],
    });

    expect(out.map((r) => r.column_name)).toEqual(['falls.back.to.id', 'prefer.fieldName']);
  });

  it("handles the user's reference example end-to-end", () => {
    const blob = {
      properties: [
        { id: 'name', fieldName: 'name', type: 'String', strategy: 'Random', semanticId: '1' },
        { id: 'email', fieldName: 'email', type: 'String', strategy: 'Sample Value' },
        { id: 'accounts[0].number', fieldName: 'accounts[0].number', type: 'Number', strategy: 'Random' },
        {
          id: 'accounts[1].balance.amount',
          fieldName: 'accounts[1].balance.amount',
          type: 'Number',
          strategy: 'Range',
          rangeMin: '100-300',
          rangeMax: '',
        },
        {
          id: 'accounts[1].balance.currency',
          fieldName: 'accounts[1].balance.currency',
          type: 'String',
          strategy: 'Random',
          semanticId: '5',
        },
      ],
    };

    const out = fieldStrategiesFromSchemaTemplate(blob);

    expect(out).toEqual([
      { column_name: 'name', column_type: 'string', strategy_code: 'random', generator_type: '1' },
      { column_name: 'email', column_type: 'string', strategy_code: 'keep_sample' },
      { column_name: 'accounts[0].number', column_type: 'number', strategy_code: 'random' },
      {
        column_name: 'accounts[1].balance.amount',
        column_type: 'number',
        strategy_code: 'range',
        range_min: 100,
        range_max: 300,
      },
      { column_name: 'accounts[1].balance.currency', column_type: 'string', strategy_code: 'random', generator_type: '5' },
    ]);
  });
});
