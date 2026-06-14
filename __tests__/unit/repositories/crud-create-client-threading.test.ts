// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// RED tests (#436) - atomicity seam.
//
// The route-level batch tests mock repo.create, so they CANNOT catch the real
// atomicity hazard: today every repo.create runs its INSERT via
// handlePostExecuteSqlStatement -> databaseManager._configuration.query, which
// borrows a FRESH pooled connection per call. A batch wrapped in one
// withConfigurationTransaction (on a pinned client) would therefore commit each
// INSERT on a different connection - so a mid-batch failure would NOT roll back.
//
// The locked C1 design fixes this by threading an optional `client` into
// create(payload, tenantId, client) and on through handlePostExecuteSqlStatement,
// so the INSERT runs on the SAME pinned client as BEGIN/COMMIT. These tests pin
// that seam.

const mockHandle = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandle(...args),
}));

jest.mock('../../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
}));

import { RuleConfigRepo } from '../../../src/repositories/configuration/rule.config.repository';
import { TypologyConfigRepo } from '../../../src/repositories/configuration/typology.config.repository';

// create does not accept a 3rd `client` arg yet - cast so the file compiles and the
// RED state is an assertion failure (3rd arg not forwarded), not a type error.
type CreateWithClient = (payload: unknown, tenantId: string, client?: unknown) => Promise<unknown>;
const pinnedClient = { __pinned: true } as const;

describe('config repo create() threads a pinned client to the DB layer (#436)', () => {
  beforeEach(() => {
    mockHandle.mockReset();
    mockHandle.mockResolvedValue({ rows: [{ configuration: {} }], rowCount: 1 } as never);
  });

  it('RuleConfigRepo.create forwards the supplied client as the 3rd arg to handlePostExecuteSqlStatement', async () => {
    await (RuleConfigRepo.create as unknown as CreateWithClient)({ id: 'r1', cfg: '1.0.0', config: {} }, 'DEFAULT', pinnedClient);

    expect(mockHandle).toHaveBeenCalledTimes(1);
    // 3rd arg must be the pinned client so the INSERT runs inside the open transaction.
    expect(mockHandle.mock.calls[0][2]).toBe(pinnedClient);
  });

  it('TypologyConfigRepo.create forwards the supplied client as the 3rd arg to handlePostExecuteSqlStatement', async () => {
    await (TypologyConfigRepo.create as unknown as CreateWithClient)(
      { id: 't1', cfg: '1.0.0', rules: [], expression: [], workflow: { alertThreshold: 1 } },
      'DEFAULT',
      pinnedClient,
    );

    expect(mockHandle).toHaveBeenCalledTimes(1);
    expect(mockHandle.mock.calls[0][2]).toBe(pinnedClient);
  });

  it('omitting the client preserves the existing single-insert behaviour (no 3rd arg)', async () => {
    await RuleConfigRepo.create({ id: 'r1', cfg: '1.0.0', config: {} } as never, 'DEFAULT');

    expect(mockHandle).toHaveBeenCalledTimes(1);
    expect(mockHandle.mock.calls[0][2]).toBeUndefined();
  });
});
