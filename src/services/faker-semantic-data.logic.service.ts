import { getFakerSemanticDataFromDb, type FakerSemanticDataType } from '../repositories/simulation-studio/faker-semantic-data.repository';

import { HttpException, HttpStatus } from '../utils/error';

export const getFakerSemanticData = async (): Promise<FakerSemanticDataType[]> => {
  try {
    return await getFakerSemanticDataFromDb();
  } catch (error) {
    throw new HttpException(
      `Failed to get faker semantic data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};
