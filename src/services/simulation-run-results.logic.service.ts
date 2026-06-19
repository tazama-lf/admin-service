// SPDX-License-Identifier: Apache-2.0
import {
  getSuiteResultFromDb,
  saveRunResultInDb,
  type SaveRunResultDto,
  type SuiteResultRow,
} from '../repositories/simulation-studio/simulation-run-results.repository';
import { updateGenerationStatus } from './trs-suite-generation.logic.service';
import { HttpException, HttpStatus } from '../utils/error';

export const saveRunResult = async (dto: SaveRunResultDto): Promise<{ run_id: number; result_id: number }> => {
  try {
    const result = await saveRunResultInDb(dto);

    // Update generation status based on result outcome
    // If the result outcome is SUCCESS, mark generation as COMPLETED
    // If the result outcome is FAILED, mark generation as FAILED
    const newStatus = result.outcome === 'SUCCESS' ? 'COMPLETED' : 'FAILED';
    await updateGenerationStatus(dto.gen_id, newStatus);

    return { run_id: result.run_id, result_id: result.result_id };
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to save run result: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

export const getSuiteResult = async (suiteId: number): Promise<SuiteResultRow> => {
  try {
    const result = await getSuiteResultFromDb(suiteId);
    if (!result) {
      throw new HttpException(`Suite results not found for suite id: ${suiteId}`, HttpStatus.NOT_FOUND);
    }
    return result;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to get suite results: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};
