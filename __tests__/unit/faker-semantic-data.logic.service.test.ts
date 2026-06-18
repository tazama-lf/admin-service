// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../src/repositories/simulation-studio/faker-semantic-data.repository', () => ({
  getFakerSemanticDataFromDb: jest.fn(),
  getFakerSemanticNameById: jest.fn(),
}));

jest.mock('../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
  configuration: {},
}));

import * as fakerRepo from '../../src/repositories/simulation-studio/faker-semantic-data.repository';
import { getFakerSemanticData, getFakerSemanticName } from '../../src/services/faker-semantic-data.logic.service';

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

  it('returns faker semantic name from repository', async () => {
    (fakerRepo.getFakerSemanticNameById as jest.Mock).mockResolvedValue('full_name');

    await expect(getFakerSemanticName(1)).resolves.toBe('full_name');
    expect(fakerRepo.getFakerSemanticNameById).toHaveBeenCalledWith(1);
    expect(fakerRepo.getFakerSemanticNameById).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when faker semantic name is not found', async () => {
    (fakerRepo.getFakerSemanticNameById as jest.Mock).mockResolvedValue(undefined);

    await expect(getFakerSemanticName(99)).resolves.toBeUndefined();
    expect(fakerRepo.getFakerSemanticNameById).toHaveBeenCalledWith(99);
  });

  it('wraps faker semantic name repository errors in HttpException 500', async () => {
    (fakerRepo.getFakerSemanticNameById as jest.Mock).mockRejectedValue(new Error('lookup failed'));

    await expect(getFakerSemanticName(1)).rejects.toMatchObject({
      message: 'Failed to get faker semantic name: lookup failed',
      status: 500,
    });
  });

  it('wraps faker semantic name non-Error thrown value in HttpException 500', async () => {
    (fakerRepo.getFakerSemanticNameById as jest.Mock).mockRejectedValue('string error');

    await expect(getFakerSemanticName(1)).rejects.toMatchObject({
      message: 'Failed to get faker semantic name: Unknown error',
      status: 500,
    });
  });
});
