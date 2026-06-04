import { getFakerSymmetricDataFromDb, type FakerSymmetricDataType } from '../repositories/simulation-studio/faker-semantic-data.repository';

import { HttpException, HttpStatus } from '../utils/error';

export const getFakerSymmetricData = async (): Promise<FakerSymmetricDataType[]> => {
  try {
    return await getFakerSymmetricDataFromDb();
  } catch (error) {
    throw new HttpException(
      `Failed to get faker symmetric data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};
