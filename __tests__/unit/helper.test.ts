// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from '@jest/globals';
import { gettxtpAndVersionFromUrl, flattenPayloadPaths } from '../../src/utils/helper';

describe('gettxtpAndVersionFromUrl', () => {
  it('extracts version and txtp from a path-style URL', () => {
    const result = gettxtpAndVersionFromUrl('/default/1.0.0/e2etestfriday/pacs.008.001.10');

    expect(result).toEqual({
      version: '1.0.0',
      txtp: 'pacs.008.001.10',
    });
  });

  it('extracts version and txtp from a full URL', () => {
    const result = gettxtpAndVersionFromUrl('https://example.com/default/1.0.0/e2etestfriday/pacs.008.001.10');

    expect(result).toEqual({
      version: '1.0.0',
      txtp: 'pacs.008.001.10',
    });
  });

  it('throws for invalid paths with less than two segments', () => {
    expect(() => gettxtpAndVersionFromUrl('/default')).toThrow('Invalid URL format. Expected at least version and txtp segments.');
  });
});

describe('flattenPayloadPaths', () => {
  it('returns leaf keys for flat object', () => {
    expect(flattenPayloadPaths({ amount: 100, currency: 'USD' })).toEqual(['amount', 'currency']);
  });

  it('returns dotted paths for nested object', () => {
    expect(flattenPayloadPaths({ transaction: { amount: 100, currency: 'USD' } })).toEqual(['transaction.amount', 'transaction.currency']);
  });

  it('uses bracket notation for array items', () => {
    const obj = { items: [{ id: 1 }, { id: 2 }] };
    expect(flattenPayloadPaths(obj)).toEqual(['items[0].id', 'items[1].id']);
  });

  it('handles deeply nested arrays of objects', () => {
    const obj = {
      FIToFIPmtSts: {
        TxInfAndSts: {
          ChrgsInf: [
            { Agt: { MmbId: 'a' }, Amt: { Amt: 1, Ccy: 'USD' } },
            { Agt: { MmbId: 'b' }, Amt: { Amt: 2, Ccy: 'USD' } },
          ],
        },
      },
    };
    expect(flattenPayloadPaths(obj)).toEqual([
      'FIToFIPmtSts.TxInfAndSts.ChrgsInf[0].Agt.MmbId',
      'FIToFIPmtSts.TxInfAndSts.ChrgsInf[0].Amt.Amt',
      'FIToFIPmtSts.TxInfAndSts.ChrgsInf[0].Amt.Ccy',
      'FIToFIPmtSts.TxInfAndSts.ChrgsInf[1].Agt.MmbId',
      'FIToFIPmtSts.TxInfAndSts.ChrgsInf[1].Amt.Amt',
      'FIToFIPmtSts.TxInfAndSts.ChrgsInf[1].Amt.Ccy',
    ]);
  });

  it('treats empty object as leaf', () => {
    expect(flattenPayloadPaths({ amount: {}, currency: {} })).toEqual(['amount', 'currency']);
  });

  it('returns empty array for empty object', () => {
    expect(flattenPayloadPaths({})).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(flattenPayloadPaths(null)).toEqual([]);
  });

  it('returns empty array for primitive with no prefix', () => {
    expect(flattenPayloadPaths('string')).toEqual([]);
    expect(flattenPayloadPaths(42)).toEqual([]);
  });

  it('returns prefix for primitive with prefix', () => {
    expect(flattenPayloadPaths('value', 'field')).toEqual(['field']);
  });

  it('returns empty array for empty array input', () => {
    expect(flattenPayloadPaths([])).toEqual([]);
  });
});
