// SPDX-License-Identifier: Apache-2.0
/**
 * Unified strategy resolver for admin-service.
 * Applies field strategies (context, trigger, or enrichment) to a payload template.
 */

import { randomUUID } from 'node:crypto';

// ── Shared input type ─────────────────────────────────────────────────────────

/**
 * Normalised field strategy input accepted by applyStrategy.
 * Context, trigger, and enrichment strategies all map to this shape.
 */
export interface FieldStrategyInput {
  /** Dot-path in the payload (field_path for context/trigger, column_name for enrichment). */
  field_path: string;
  strategy_code: string;
  static_value?: unknown;
  range_min?: number;
  range_max?: number;
  /** Semantic generator key (faker_semantic_type for context/trigger, generator_type for enrichment). */
  faker_semantic_type?: string;
}

// ── Dot-path helpers ──────────────────────────────────────────────────────────

const setNestedValue = (obj: Record<string, unknown>, path: string, value: unknown): void => {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];

    if (cur[part] == null || typeof cur[part] !== 'object') {
      cur[part] = {};
    }

    cur = cur[part] as Record<string, unknown>;
  }

  cur[parts[parts.length - 1]] = value;
};

const removeNestedValue = (obj: Record<string, unknown>, path: string): void => {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];

    if (cur[part] == null || typeof cur[part] !== 'object') {
      return;
    }

    cur = cur[part] as Record<string, unknown>;
  }

  Reflect.deleteProperty(cur, parts[parts.length - 1]);
};

// ── Semantic generators ───────────────────────────────────────────────────────

const ISO_CURRENCIES = ['USD', 'EUR', 'GBP', 'ZAR', 'NGN', 'KES', 'GHS', 'TZS', 'UGX', 'XOF'];
const ISO_COUNTRIES = ['US', 'GB', 'DE', 'ZA', 'NG', 'KE', 'GH', 'TZ', 'UG', 'SN', 'MA'];
const FIRST_NAMES = ['Alice', 'Bob', 'Carlos', 'Diana', 'Emmanuel', 'Fatima', 'George', 'Hannah'];
const LAST_NAMES = ['Smith', 'Johnson', 'Diallo', 'Osei', 'Kamara', 'Mensah', 'Ndibe', 'Mwangi'];

const rand = (min: number, max: number): number => Math.random() * (max - min) + min;

const randInt = (min: number, max: number): number => Math.floor(rand(min, max + 1));

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Resolves a static_value to a single concrete value.
 * A comma-separated string (e.g. "50,100,150") is treated as a list of candidates,
 * and one is selected at random. A single value is returned as-is.
 */
const pickStaticValue = (value: unknown): unknown => {
  if (typeof value === 'string' && value.includes(',')) {
    const options = value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v !== '');

    if (options.length > 0) return pick(options);
  }

  return value ?? null;
};

const generateBic = (): string =>
  `${Array.from({ length: 4 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[randInt(0, 25)]).join('')}${pick(
    ISO_COUNTRIES,
  )}${Array.from({ length: 2 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[randInt(0, 25)]).join('')}`;

const generateDateIso = (): string => new Date(rand(Date.now() - 365 * 864e5, Date.now())).toISOString();

const SEMANTIC_GENERATORS: Partial<Record<string, () => unknown>> = {
  uuid: () => randomUUID(),
  id: () => randomUUID(),
  iban: () => `${pick(ISO_COUNTRIES)}${randInt(10, 99)}${Array.from({ length: 16 }, () => randInt(0, 9)).join('')}`,
  bic: generateBic,
  swift: generateBic,
  account_number: () => Array.from({ length: 12 }, () => randInt(0, 9)).join(''),
  amount: () => parseFloat(rand(1, 100000).toFixed(2)),
  amount_small: () => parseFloat(rand(0.01, 999.99).toFixed(2)),
  amount_large: () => parseFloat(rand(10000, 10_000_000).toFixed(2)),
  currency: () => pick(ISO_CURRENCIES),
  exchange_rate: () => parseFloat(rand(0.5, 150).toFixed(6)),
  date_iso: generateDateIso,
  datetime_iso: generateDateIso,
  date_only: () => generateDateIso().split('T')[0],
  timestamp_ms: () => Math.floor(rand(Date.now() - 30 * 864e5, Date.now())),
  full_name: () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
  name: () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
  first_name: () => pick(FIRST_NAMES),
  last_name: () => pick(LAST_NAMES),
  phone_number: () => `+${randInt(1, 999)}${Array.from({ length: 9 }, () => randInt(0, 9)).join('')}`,
  email: () => `user${randInt(1000, 99999)}@${pick(['example.com', 'test.org', 'demo.io'])}`,
  country_code: () => pick(ISO_COUNTRIES),
  message_id: () => `MSG-${randomUUID().replace(/-/g, '').substring(0, 16).toUpperCase()}`,
  transaction_id: () => `TXN-${randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase()}`,
  reference: () => `REF-${randInt(100000, 9999999)}`,
  description: () => `Payment ${randInt(1, 9999)}`,
  narration: () => `Fund transfer ${randInt(1, 9999)}`,
  integer: () => randInt(1, 10000),
  number_of_transactions: () => randInt(1, 100),
  boolean_flag: () => Math.random() > 0.5,
  status: () => pick(['ACCP', 'RJCT', 'PDNG', 'ACSC', 'ACWC']),
};

// ── Unified applyStrategy ─────────────────────────────────────────────────────

/**
 * Applies a list of field strategies to a payload template and returns one generated payload.
 * Works for context, trigger, and enrichment strategies — they all share the same strategy_code values.
 *
 * strategy_code semantics:
 *   keep_sample — leave the template value unchanged
 *   static      — set field to static_value
 *   range       — pick a random number in [range_min, range_max]
 *   generated   — use faker_semantic_type to generate a value
 *   null        — set field to null
 *   skip/remove — remove the field from the payload entirely
 *   copy        — keep the template value unchanged (alias for keep_sample used by enrichment)
 *
 * Does NOT mutate the input template.
 */
export const applyStrategy = (template: Record<string, unknown> | undefined, strategies: FieldStrategyInput[]): Record<string, unknown> => {
  const base = JSON.parse(JSON.stringify(template ?? {})) as Record<string, unknown>;
  const removePaths = new Set<string>();

  for (const s of strategies) {
    switch (s.strategy_code) {
      case 'keep_sample':
        break;

      case 'static':
        setNestedValue(base, s.field_path, pickStaticValue(s.static_value));
        break;

      case 'range': {
        const min = s.range_min ?? 0;
        const max = s.range_max ?? 1;
        setNestedValue(base, s.field_path, parseFloat(rand(min, max).toFixed(2)));
        break;
      }

      case 'random': {
        const generator = SEMANTIC_GENERATORS[s.faker_semantic_type?.toLowerCase() ?? ''];
        setNestedValue(base, s.field_path, generator?.() ?? null);
        break;
      }

      case 'skip':
      case 'remove':
        removePaths.add(s.field_path);
        break;
    }
  }

  for (const path of removePaths) {
    removeNestedValue(base, path);
  }

  return base;
};
