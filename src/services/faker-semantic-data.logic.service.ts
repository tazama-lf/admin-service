import {
  getFakerSemanticDataFromDb,
  getFakerSemanticNameById,
  type FakerSemanticDataType,
} from '../repositories/simulation-studio/faker-semantic-data.repository';

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

export const getFakerSemanticName = async (id: number): Promise<string | undefined> => {
  try {
    return await getFakerSemanticNameById(id);
  } catch (error) {
    throw new HttpException(
      `Failed to get faker semantic name: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};
