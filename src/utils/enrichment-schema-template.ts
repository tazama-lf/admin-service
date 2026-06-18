// SPDX-License-Identifier: Apache-2.0
/**
 * Translates the UI-facing `schema_template_json.properties[]` shape into the
 * normalised `UpsertEnrichmentFieldStrategyDto` rows the field-strategies table
 * expects. The UI uses display-style values ("Random", "Sample Value", "String",
 * "100-300" stuffed into rangeMin); this module is the single place that maps
 * them onto the resolver's vocabulary.
 */

import type { FieldStrategyCode, UpsertEnrichmentFieldStrategyDto } from '../interface/simulation-studio/suite-generation.interface';

/** Shape of one entry in `schema_template_json.properties[]` from the UI. */
interface UiSchemaProperty {
  id?: string;
  fieldName?: string;
  type?: string;
  strategy?: string;
  staticValue?: unknown;
  rangeMin?: string | number;
  rangeMax?: string | number;
  semanticId?: string;
}

/** UI-vocab → resolver `strategy_code`. Falls back to keep_sample on unknown input. */
const STRATEGY_MAP: Readonly<Record<string, FieldStrategyCode>> = {
  'random': 'random',
  'sample value': 'keep_sample',
  'sample-value': 'keep_sample',
  'sample': 'keep_sample',
  'keep': 'keep_sample',
  'keep_sample': 'keep_sample',
  'static': 'static',
  'range': 'range',
  'skip': 'skip',
  'remove': 'skip',
};

/** UI type strings → JSON-Schema-style lowercase tokens (used as the stored `column_type`). */
const TYPE_MAP: Readonly<Record<string, string>> = {
  string: 'string',
  number: 'number',
  integer: 'integer',
  int: 'integer',
  boolean: 'boolean',
  bool: 'boolean',
  object: 'object',
  array: 'array',
};

const normaliseStrategy = (raw: string | undefined): FieldStrategyCode => {
  if (!raw) return 'keep_sample';
  return STRATEGY_MAP[raw.trim().toLowerCase()] ?? 'keep_sample';
};

const normaliseType = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  return TYPE_MAP[raw.trim().toLowerCase()] ?? raw.trim().toLowerCase();
};

/**
 * Parses a "min-max" hyphen-stuffed range like "100-300" (UI sometimes packs the
 * range into a single rangeMin field). Accepts plain numbers in either field too.
 * Returns `[undefined, undefined]` when no usable numbers can be extracted.
 */
const parseRange = (
  rangeMin: string | number | undefined,
  rangeMax: string | number | undefined,
): [number | undefined, number | undefined] => {
  const tryNumber = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  };

  // First, see if rangeMin carries a "min-max" stuffed form.
  if (typeof rangeMin === 'string' && rangeMin.includes('-')) {
    const [minStr, maxStr] = rangeMin.split('-', 2).map((s) => s.trim());
    const min = tryNumber(minStr);
    const max = tryNumber(maxStr);
    if (min !== undefined || max !== undefined) return [min, max];
  }

  const minOnly = tryNumber(rangeMin);
  const maxOnly = tryNumber(rangeMax);
  return [minOnly, maxOnly];
};

/**
 * Extracts the array of property descriptors from a `schema_template_json` blob.
 * Returns `[]` when the blob is missing or malformed — callers should treat that
 * as "no strategies, just clone the template" rather than as an error.
 */
const extractProperties = (schemaTemplateJson: Record<string, unknown> | undefined): UiSchemaProperty[] => {
  if (!schemaTemplateJson) return [];
  const props = (schemaTemplateJson as { properties?: unknown }).properties;
  if (!Array.isArray(props)) return [];
  return props as UiSchemaProperty[];
};

/**
 * Translates the UI's schema_template_json into the normalised field-strategy
 * rows the resolver consumes. Skips entries without a usable field path.
 */
export const fieldStrategiesFromSchemaTemplate = (
  schemaTemplateJson: Record<string, unknown> | undefined,
): UpsertEnrichmentFieldStrategyDto[] => {
  const rows: UpsertEnrichmentFieldStrategyDto[] = [];

  for (const prop of extractProperties(schemaTemplateJson)) {
    const columnName = prop.fieldName ?? prop.id;
    if (!columnName || typeof columnName !== 'string' || columnName.trim() === '') continue;

    const strategy = normaliseStrategy(prop.strategy);
    const [rangeMin, rangeMax] = parseRange(prop.rangeMin, prop.rangeMax);

    const dto: UpsertEnrichmentFieldStrategyDto = {
      column_name: columnName,
      column_type: normaliseType(prop.type),
      strategy_code: strategy,
    };

    if (prop.staticValue !== undefined && prop.staticValue !== '') {
      dto.static_value = prop.staticValue;
    }
    if (rangeMin !== undefined) dto.range_min = rangeMin;
    if (rangeMax !== undefined) dto.range_max = rangeMax;
    if (prop.semanticId !== undefined && prop.semanticId.trim() !== '') {
      dto.generator_type = prop.semanticId;
    }

    rows.push(dto);
  }

  return rows;
};
