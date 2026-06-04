// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/faker-semantic-data.repository', () => ({
  getFakerSymmetricDataFromDb: jest.fn(),
}));

import * as fakerRepo from '../../src/repositories/simulation-studio/faker-semantic-data.repository';
import { getFakerSymmetricData } from '../../src/services/faker-semantic-data.logic.service';

describe('faker-semantic-data.logic.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns rows from repository', async () => {
    (fakerRepo.getFakerSymmetricDataFromDb as jest.Mock).mockResolvedValue([{ id: 1, name: 'full_name' }]);

    await expect(getFakerSymmetricData()).resolves.toEqual([{ id: 1, name: 'full_name' }]);
  });

  it('wraps repository errors in HttpException 500', async () => {
    (fakerRepo.getFakerSymmetricDataFromDb as jest.Mock).mockRejectedValue(new Error('db failed'));

    await expect(getFakerSymmetricData()).rejects.toMatchObject({ status: 500 });
  });
});
