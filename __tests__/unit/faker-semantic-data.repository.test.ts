// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: jest.fn(),
}));

import * as db from '../../src/services/database.logic.service';
import { getFakerSemanticDataFromDb } from '../../src/repositories/simulation-studio/faker-semantic-data.repository';

const mockDb = db.handlePostExecuteSqlStatement as jest.Mock;

describe('faker-semantic-data.repository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns mapped faker semantic data rows', async () => {
    mockDb.mockResolvedValue({ rows: [{ id: 1, name: 'full_name' }] });

    const result = await getFakerSemanticDataFromDb();

    expect(result).toEqual([{ id: 1, name: 'full_name' }]);
    expect(mockDb).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('trs_faker_semantic_data_types') }),
      'simulation',
    );
  });

  it('returns empty array when no rows', async () => {
    mockDb.mockResolvedValue({ rows: [] });
    await expect(getFakerSemanticDataFromDb()).resolves.toEqual([]);
  });
});
