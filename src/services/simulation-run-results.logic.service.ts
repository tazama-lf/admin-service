// SPDX-License-Identifier: Apache-2.0
import { getSuiteResultFromDb, type SuiteResultRow } from '../repositories/simulation-studio/simulation-run-results.repository';
import { HttpException, HttpStatus } from '../utils/error';

export const getSuiteResult = async (suiteId: number): Promise<SuiteResultRow> => {
  try {
    const result = await getSuiteResultFromDb(suiteId);
    if (!result) {
      throw new HttpException(`Suite results not found for suite id: ${suiteId}`, HttpStatus.NOT_FOUND);
    }
    return result;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(`Failed to get suite results: ${(error as Error).message}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }
};
