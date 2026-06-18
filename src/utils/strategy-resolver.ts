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

// ── Path helpers ──────────────────────────────────────────────────────────────

/**
 * Tokenises a field path with optional bracket-indexed array segments. Returns
 * a sequence of string keys and numeric indices.
 *
 *   "accounts[0].balance.amount" → ["accounts", 0, "balance", "amount"]
 *   "items[3]"                   → ["items", 3]
 *   "plain.field"                → ["plain", "field"]
 *
 * Tokens that look like just digits between dots (e.g. `arr.0.x`) are also
 * promoted to numeric indices so dotted-array shorthand keeps working.
 */
const parsePath = (path: string): Array<string | number> => {
  const tokens: Array<string | number> = [];
  for (const segment of path.split('.')) {
    if (segment === '') continue;
    const bracketRe = /([^[\]]+)|\[(\d+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = bracketRe.exec(segment)) !== null) {
      const [, plain, bracketed] = m;
      if (bracketed) {
        tokens.push(Number(bracketed));
      } else if (plain) {
        tokens.push(/^\d+$/.test(plain) ? Number(plain) : plain);
      }
    }
  }
  return tokens;
};

const setNestedValue = (obj: Record<string, unknown>, path: string, value: unknown): void => {
  const tokens = parsePath(path);
  if (tokens.length === 0) return;

  let cur: Record<string, unknown> | unknown[] = obj;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const key = tokens[i];
    const next = tokens[i + 1];
    const nextIsIndex = typeof next === 'number';

    if (typeof key === 'number') {
      const arr = cur as unknown[];
      if (arr[key] == null || typeof arr[key] !== 'object') {
        arr[key] = nextIsIndex ? [] : {};
      }
      cur = arr[key] as Record<string, unknown> | unknown[];
    } else {
      const rec = cur as Record<string, unknown>;
      if (rec[key] == null || typeof rec[key] !== 'object') {
        rec[key] = nextIsIndex ? [] : {};
      }
      cur = rec[key] as Record<string, unknown> | unknown[];
    }
  }

  const leaf = tokens[tokens.length - 1];
  if (typeof leaf === 'number') {
    (cur as unknown[])[leaf] = value;
  } else {
    (cur as Record<string, unknown>)[leaf] = value;
  }
};

/**
 * Walks a JSON Schema (draft-style: `properties`, `items`) and returns the leaf
 * `type` string at the given path. Honours bracket-indexed segments by stepping
 * through array `items` schemas (object or tuple form).
 */
const getSchemaTypeAtPath = (schema: Record<string, unknown> | undefined, path: string): string | undefined => {
  if (!schema) return undefined;
  let node: Record<string, unknown> | undefined = schema;

  for (const token of parsePath(path)) {
    if (!node) return undefined;
    if (typeof token === 'number') {
      const items = node.items as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
      if (!items) return undefined;
      node = Array.isArray(items) ? items[token] : items;
    } else {
      const props = node.properties as Record<string, unknown> | undefined;
      node = props?.[token] as Record<string, unknown> | undefined;
    }
  }

  const t = node?.type;
  return typeof t === 'string' ? t.toLowerCase() : undefined;
};

/**
 * Type-driven random value when `random` was configured without a usable
 * semantic generator. Keeps the payload schema-valid instead of writing null.
 */
const randomByJsonSchemaType = (type: string | undefined): unknown => {
  switch (type) {
    case 'number':
    case 'integer':
      return randInt(1, 10000);
    case 'boolean':
      return Math.random() > 0.5;
    case 'string':
    default:
      return randomUUID();
  }
};

const removeNestedValue = (obj: Record<string, unknown>, path: string): void => {
  const tokens = parsePath(path);
  if (tokens.length === 0) return;

  let cur: Record<string, unknown> | unknown[] = obj;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const key = tokens[i];
    const child = typeof key === 'number' ? (cur as unknown[])[key] : (cur as Record<string, unknown>)[key];
    if (child == null || typeof child !== 'object') return;
    cur = child as Record<string, unknown> | unknown[];
  }

  const leaf = tokens[tokens.length - 1];
  if (typeof leaf === 'number') {
    (cur as unknown[]).splice(leaf, 1);
  } else {
    Reflect.deleteProperty(cur as Record<string, unknown>, leaf);
  }
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
export const applyStrategy = (
  template: Record<string, unknown> | undefined,
  strategies: FieldStrategyInput[],
  schema?: Record<string, unknown>,
): Record<string, unknown> => {
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
        const value = generator ? generator() : randomByJsonSchemaType(getSchemaTypeAtPath(schema, s.field_path));
        setNestedValue(base, s.field_path, value);
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
