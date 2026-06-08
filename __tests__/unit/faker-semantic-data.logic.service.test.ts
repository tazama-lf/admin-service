// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/faker-semantic-data.repository', () => ({
  getFakerSemanticDataFromDb: jest.fn(),
}));

jest.mock('../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
  configuration: {},
}));

import * as fakerRepo from '../../src/repositories/simulation-studio/faker-semantic-data.repository';
import { getFakerSemanticData } from '../../src/services/faker-semantic-data.logic.service';

describe('faker-semantic-data.logic.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns rows from repository', async () => {
    (fakerRepo.getFakerSemanticDataFromDb as jest.Mock).mockResolvedValue([{ id: 1, name: 'full_name' }]);

    await expect(getFakerSemanticData()).resolves.toEqual([{ id: 1, name: 'full_name' }]);
    expect(fakerRepo.getFakerSemanticDataFromDb).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no data', async () => {
    (fakerRepo.getFakerSemanticDataFromDb as jest.Mock).mockResolvedValue([]);
    await expect(getFakerSemanticData()).resolves.toEqual([]);
  });

  it('wraps repository errors in HttpException 500', async () => {
    (fakerRepo.getFakerSemanticDataFromDb as jest.Mock).mockRejectedValue(new Error('db failed'));
    await expect(getFakerSemanticData()).rejects.toMatchObject({ status: 500 });
  });

  it('wraps non-Error thrown value in HttpException 500', async () => {
    (fakerRepo.getFakerSemanticDataFromDb as jest.Mock).mockRejectedValue('string error');
    await expect(getFakerSemanticData()).rejects.toMatchObject({ status: 500 });
  });
});
