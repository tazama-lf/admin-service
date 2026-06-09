// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/txtp-mapping.repository', () => ({
  insertTxtpMappingInDb: jest.fn(),
  getTxtpMappingByIdsInDb: jest.fn(),
  deleteTxtpMappingByIdsInDb: jest.fn(),
}));

import { HttpException } from '../../src/utils/error';
import * as mappingRepo from '../../src/repositories/simulation-studio/txtp-mapping.repository';
import { createTxtpMapping, getTxtpMappings, deleteTxtpMapping } from '../../src/services/txtp-mapping.logic.service';

describe('txtp-mapping.logic.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('inserts one row per mapping item for valid ids', async () => {
    (mappingRepo.insertTxtpMappingInDb as jest.Mock)
      .mockResolvedValueOnce({
        id: 1,
        primary_tx_id: 123,
        related_tx_id: 456,
        mapping: [{ primary: 'FITOFI.amount', related: 'msgId' }],
      })
      .mockResolvedValueOnce({
        id: 2,
        primary_tx_id: 123,
        related_tx_id: 456,
        mapping: [{ primary: 'FITOFI.currency', related: 'ccy' }],
      });

    const result = await createTxtpMapping({
      primary_txtp_id: 123,
      related_txtp_id: 456,
      mapping: [
        { primary: 'FITOFI.amount', related: 'msgId' },
        { primary: 'FITOFI.currency', related: 'ccy' },
      ],
    });

    expect(mappingRepo.insertTxtpMappingInDb).toHaveBeenNthCalledWith(1, 123, 456, [{ primary: 'FITOFI.amount', related: 'msgId' }]);
    expect(mappingRepo.insertTxtpMappingInDb).toHaveBeenNthCalledWith(2, 123, 456, [{ primary: 'FITOFI.currency', related: 'ccy' }]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
  });

  it('throws 400 for invalid ids while inserting', async () => {
    await expect(
      createTxtpMapping({
        primary_txtp_id: 0,
        related_txtp_id: 456,
        mapping: [],
      }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('gets all mappings by ids', async () => {
    (mappingRepo.getTxtpMappingByIdsInDb as jest.Mock).mockResolvedValue([
      {
        id: 5,
        primary_tx_id: 111,
        related_tx_id: 222,
        mapping: [{ primary: 'a', related: 'b' }],
      },
      {
        id: 6,
        primary_tx_id: 111,
        related_tx_id: 222,
        mapping: [{ primary: 'c', related: 'd' }],
      },
    ]);

    const result = await getTxtpMappings(111, 222);

    expect(mappingRepo.getTxtpMappingByIdsInDb).toHaveBeenCalledWith(111, 222);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(5);
    expect(result[1].id).toBe(6);
  });

  it('deletes mapping by ids', async () => {
    (mappingRepo.deleteTxtpMappingByIdsInDb as jest.Mock).mockResolvedValue(true);

    const result = await deleteTxtpMapping(111, 222);

    expect(mappingRepo.deleteTxtpMappingByIdsInDb).toHaveBeenCalledWith(111, 222);
    expect(result).toBe(true);
  });
});
