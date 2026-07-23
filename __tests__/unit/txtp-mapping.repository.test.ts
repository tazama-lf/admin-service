// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: jest.fn(),
}));

import * as db from '../../src/services/database.logic.service';
import {
  insertTxtpMappingInDb,
  getTxtpMappingByIdsInDb,
  deleteTxtpMappingByIdsInDb,
} from '../../src/repositories/simulation-studio/txtp-mapping.repository';

const mockDb = db.handlePostExecuteSqlStatement as jest.Mock;

describe('txtp-mapping.repository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('insertTxtpMappingInDb inserts and maps row when mapping is string JSON', async () => {
    mockDb.mockResolvedValue({
      rows: [
        {
          id: 1,
          primary_tx_id: 209,
          related_tx_id: 210,
          mapping: '[{"primary":"a","related":"b"}]',
        },
      ],
    });

    const result = await insertTxtpMappingInDb(209, 210, [{ primary: 'a', related: 'b' }]);

    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('INSERT INTO trs_mapping'),
        values: [209, 210, JSON.stringify([{ primary: 'a', related: 'b' }])],
      }),
      'simulation',
    );
    expect(result).toEqual({
      id: 1,
      primary_tx_id: 209,
      related_tx_id: 210,
      mapping: [{ primary: 'a', related: 'b' }],
    });
  });

  it('getTxtpMappingByIdsInDb returns mapped rows when mapping is object/array', async () => {
    mockDb.mockResolvedValue({
      rows: [
        {
          id: 11,
          primary_tx_id: 209,
          related_tx_id: 210,
          mapping: [{ primary: 'x', related: 'y' }],
        },
        {
          id: 12,
          primary_tx_id: 209,
          related_tx_id: 210,
          mapping: null,
        },
      ],
    });

    const result = await getTxtpMappingByIdsInDb(209, 210);

    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('SELECT id, primary_tx_id, related_tx_id, mapping'),
        values: [209, 210],
      }),
      'simulation',
    );
    expect(result).toEqual([
      { id: 11, primary_tx_id: 209, related_tx_id: 210, mapping: [{ primary: 'x', related: 'y' }] },
      { id: 12, primary_tx_id: 209, related_tx_id: 210, mapping: [] },
    ]);
  });

  it('deleteTxtpMappingByIdsInDb returns true when rows deleted', async () => {
    mockDb.mockResolvedValue({ rows: [{ deleted_count: '2' }] });

    const result = await deleteTxtpMappingByIdsInDb(209, 210);

    expect(result).toBe(true);
    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('DELETE FROM trs_mapping'),
        values: [209, 210],
      }),
      'simulation',
    );
  });

  it('deleteTxtpMappingByIdsInDb returns false when deleted_count is 0 or missing', async () => {
    mockDb.mockResolvedValueOnce({ rows: [{ deleted_count: '0' }] });
    await expect(deleteTxtpMappingByIdsInDb(209, 210)).resolves.toBe(false);

    mockDb.mockResolvedValueOnce({ rows: [] });
    await expect(deleteTxtpMappingByIdsInDb(209, 210)).resolves.toBe(false);
  });
});
