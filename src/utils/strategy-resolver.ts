// SPDX-License-Identifier: Apache-2.0
/**
 * Simple strategy resolver for admin-service.
 * Given a sample payload and a list of field strategies, returns one generated payload.
 */

import { randomUUID } from 'node:crypto';
import type { ContextFieldStrategy } from '../interface/simulation-studio/suite-generation.interface';

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

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Applies field strategies to a sample payload and returns one generated payload.
 * Does NOT mutate the input sample.
 */
export const applyStrategies = (
  samplePayload: Record<string, unknown> | undefined,
  strategies: ContextFieldStrategy[],
): Record<string, unknown> => {
  const base = JSON.parse(JSON.stringify(samplePayload ?? {})) as Record<string, unknown>;
  const skipPaths = new Set<string>();

  for (const strategy of strategies) {
    switch (strategy.strategy_code) {
      case 'keep_sample':
        break;

      case 'static':
        setNestedValue(base, strategy.field_path, strategy.static_value ?? null);
        break;

      case 'range': {
        const min = strategy.range_min ?? 0;
        const max = strategy.range_max ?? 1;
        setNestedValue(base, strategy.field_path, parseFloat(rand(min, max).toFixed(2)));
        break;
      }

      case 'generated': {
        const generator = SEMANTIC_GENERATORS[strategy.faker_semantic_type?.toLowerCase() ?? ''];
        setNestedValue(base, strategy.field_path, generator?.() ?? randomUUID());
        break;
      }

      case 'null':
        setNestedValue(base, strategy.field_path, null);
        break;

      case 'skip':
        skipPaths.add(strategy.field_path);
        break;
    }
  }

  for (const path of skipPaths) {
    removeNestedValue(base, path);
  }

  return base;
};
