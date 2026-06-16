// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces';

// RED tests (#434): NetworkMapRepo.activate / .deactivate do not exist yet. These
// pin the contract before any production code is written:
//  - activate performs an existence check FIRST and, only if the target exists,
//    swaps inside a single transaction by DEACTIVATING the current active map
//    BEFORE ACTIVATING the target (the proven-safe order that never trips the
//    partial unique index idx_networkmap_active_tenant -> no 23505).
//  - a missing target returns null and performs NO writes (no transaction opened).
//  - updDtTm is bumped on both the demoted and promoted records.
//  - deactivate flips a single map inactive (single atomic statement) and returns
//    null when the target does not exist.

const mockHandlePostExecuteSqlStatement = jest.fn();
const mockWithConfigurationTransaction = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandlePostExecuteSqlStatement(...args),
  withConfigurationTransaction: (...args: unknown[]) => mockWithConfigurationTransaction(...args),
}));

jest.mock('../../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
  databaseManager: {
    _configuration: { query: jest.fn() },
  },
}));

import { NetworkMapRepo } from '../../../src/repositories/configuration/network.map.repository';

// The activate/deactivate methods are not yet part of the CrudRepository contract.
// Access them through a typed view so the spec compiles; at RED they are undefined
// and the calls fail, which is the intended failing state.
type TransactionClient = { query: (text: string, values?: unknown[]) => Promise<unknown> };
type ActivationRepo = {
  activate: (id: { cfg: string; tenantId: string }) => Promise<NetworkMap | null>;
  deactivate: (id: { cfg: string; tenantId: string }) => Promise<NetworkMap | null>;
};
const repo = NetworkMapRepo as unknown as typeof NetworkMapRepo & ActivationRepo;

const TENANT = 'DEFAULT';
const NOW = '2024-06-01T12:00:00.000Z';

const makeMap = (cfg: string, active: boolean): NetworkMap =>
  ({
    active,
    cfg,
    tenantId: TENANT,
    creDtTm: '2024-01-01T00:00:00.000Z',
    updDtTm: '2024-01-01T00:00:00.000Z',
    messages: [],
  }) as unknown as NetworkMap;

const DEACTIVATE_OTHERS_SQL =
  "UPDATE network_map SET configuration = jsonb_set(jsonb_set(configuration, '{active}', 'false'), '{updDtTm}', to_jsonb($1::text)) WHERE tenantId = $2 AND active = true AND cfg <> $3;";
const ACTIVATE_TARGET_SQL =
  "UPDATE network_map SET configuration = jsonb_set(jsonb_set(configuration, '{active}', 'true'), '{updDtTm}', to_jsonb($1::text)) WHERE tenantId = $2 AND cfg = $3 RETURNING configuration;";
const EXISTENCE_SQL = 'SELECT 1 FROM network_map WHERE cfg = $1 AND tenantId = $2;';
const DEACTIVATE_SQL =
  "UPDATE network_map SET configuration = jsonb_set(jsonb_set(configuration, '{active}', 'false'), '{updDtTm}', to_jsonb($1::text)) WHERE cfg = $2 AND tenantId = $3 RETURNING configuration;";

describe('NetworkMapRepo.activate (#434)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(NOW);

    // By default the transaction helper invokes its callback with a mock client so
    // the SQL issued inside the transaction can be asserted.
    mockWithConfigurationTransaction.mockImplementation(async (work: (client: TransactionClient) => Promise<unknown>) => {
      const client: TransactionClient = { query: jest.fn() };
      return await work(client);
    });
  });

  it('checks existence first, then swaps by DEACTIVATING the current active map BEFORE ACTIVATING the target, in one transaction', async () => {
    const activated = makeMap('2.0.0', true);
    // existence check passes
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 });

    const clientCalls: Array<{ text: string; values: unknown[] }> = [];
    mockWithConfigurationTransaction.mockImplementation(async (work: (client: TransactionClient) => Promise<unknown>) => {
      const client: TransactionClient = {
        query: jest.fn(async (text: string, values?: unknown[]) => {
          clientCalls.push({ text, values: values ?? [] });
          // The activating UPDATE (...RETURNING configuration) yields the promoted map.
          if (text === ACTIVATE_TARGET_SQL) return { rows: [{ configuration: activated }], rowCount: 1 };
          // The deactivating UPDATE touches the previously-active map.
          return { rows: [], rowCount: 1 };
        }),
      };
      return await work(client);
    });

    const result = await repo.activate({ cfg: '2.0.0', tenantId: TENANT });

    // existence checked before any transaction
    expect(mockHandlePostExecuteSqlStatement).toHaveBeenNthCalledWith(
      1,
      { text: EXISTENCE_SQL, values: ['2.0.0', TENANT] },
      'configuration',
    );
    expect(mockWithConfigurationTransaction).toHaveBeenCalledTimes(1);

    // exact ordering: deactivate-others first, then activate-target
    expect(clientCalls).toHaveLength(2);
    expect(clientCalls[0]).toEqual({ text: DEACTIVATE_OTHERS_SQL, values: [NOW, TENANT, '2.0.0'] });
    expect(clientCalls[1]).toEqual({ text: ACTIVATE_TARGET_SQL, values: [NOW, TENANT, '2.0.0'] });

    expect(result).toEqual(activated);
  });

  it('bumps updDtTm on BOTH the demoted and promoted records with the same timestamp', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 });

    const clientCalls: Array<{ text: string; values: unknown[] }> = [];
    mockWithConfigurationTransaction.mockImplementation(async (work: (client: TransactionClient) => Promise<unknown>) => {
      const client: TransactionClient = {
        query: jest.fn(async (text: string, values?: unknown[]) => {
          clientCalls.push({ text, values: values ?? [] });
          if (text === ACTIVATE_TARGET_SQL) return { rows: [{ configuration: makeMap('2.0.0', true) }], rowCount: 1 };
          return { rows: [], rowCount: 1 };
        }),
      };
      return await work(client);
    });

    await repo.activate({ cfg: '2.0.0', tenantId: TENANT });

    // both statements set updDtTm via to_jsonb($1::text) and share the same NOW value
    expect(clientCalls[0].text).toContain("'{updDtTm}', to_jsonb($1::text)");
    expect(clientCalls[1].text).toContain("'{updDtTm}', to_jsonb($1::text)");
    expect(clientCalls[0].values[0]).toBe(NOW);
    expect(clientCalls[1].values[0]).toBe(NOW);
  });

  it('still promotes the target (and returns it) when no map is currently active', async () => {
    const activated = makeMap('2.0.0', true);
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 });

    mockWithConfigurationTransaction.mockImplementation(async (work: (client: TransactionClient) => Promise<unknown>) => {
      const client: TransactionClient = {
        query: jest.fn(async (text: string) => {
          if (text === ACTIVATE_TARGET_SQL) return { rows: [{ configuration: activated }], rowCount: 1 };
          // no currently-active map: the deactivate-others statement matches nothing
          return { rows: [], rowCount: 0 };
        }),
      };
      return await work(client);
    });

    const result = await repo.activate({ cfg: '2.0.0', tenantId: TENANT });

    expect(result).toEqual(activated);
    expect(mockWithConfigurationTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns null and performs NO writes when the target does not exist (no transaction opened)', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await repo.activate({ cfg: 'missing', tenantId: TENANT });

    expect(result).toBeNull();
    // existence check ran...
    expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith({ text: EXISTENCE_SQL, values: ['missing', TENANT] }, 'configuration');
    // ...but no transaction / no swap was attempted
    expect(mockWithConfigurationTransaction).not.toHaveBeenCalled();
  });

  it('is idempotent: activating an already-active map keeps exactly that map active', async () => {
    const activated = makeMap('1.0.0', true);
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 });

    mockWithConfigurationTransaction.mockImplementation(async (work: (client: TransactionClient) => Promise<unknown>) => {
      const client: TransactionClient = {
        query: jest.fn(async (text: string) => {
          if (text === ACTIVATE_TARGET_SQL) return { rows: [{ configuration: activated }], rowCount: 1 };
          return { rows: [], rowCount: 0 };
        }),
      };
      return await work(client);
    });

    const result = await repo.activate({ cfg: '1.0.0', tenantId: TENANT });

    expect(result).toEqual(activated);
  });
});

describe('NetworkMapRepo.deactivate (#434)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(NOW);
  });

  it('sets the target inactive in a single atomic statement, bumps updDtTm, and returns it', async () => {
    const deactivated = makeMap('1.0.0', false);
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [{ configuration: deactivated }], rowCount: 1 });

    const result = await repo.deactivate({ cfg: '1.0.0', tenantId: TENANT });

    expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
      { text: DEACTIVATE_SQL, values: [NOW, '1.0.0', TENANT] },
      'configuration',
    );
    // deactivate is a single atomic statement - it must NOT open a transaction.
    expect(mockWithConfigurationTransaction).not.toHaveBeenCalled();
    expect(result).toEqual(deactivated);
  });

  it('returns null when the target does not exist', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await repo.deactivate({ cfg: 'missing', tenantId: TENANT });

    expect(result).toBeNull();
  });
});
