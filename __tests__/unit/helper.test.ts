// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from '@jest/globals';
import { gettxtpAndVersionFromUrl } from '../../src/utils/helper';

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
