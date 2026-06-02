// SPDX-License-Identifier: Apache-2.0
import type { SuiteGeneration } from '../interface/suite-generation.interface';
import type { SimulationSuite } from '../interface/simulation-suites.interface';
import {
  createSuiteGenerationInDb,
  getNextGenerationNumber,
  getGenerationsBySuiteId,
  getLatestGenerationBySuiteId,
} from '../repositories/simulation-studio/suite-generations.repository';
import { HttpException, HttpStatus } from '../utils/error';

// Re-export context config service for app.controller consumers
export {
  createConfigWithDefaultStrategies,
  createContextTxtpConfig,
  addContextTxtpConfig,
  getContextConfigsWithStrategies,
  bulkUpdateContextConfigs,
  getFieldStrategiesForContextConfig,
} from './context-txtp-config.logic.service';

// ── Suite Generation ─────────────────────────────────────────────────────────

export const createSuiteGeneration = async (suite: SimulationSuite, userId: string, userEmail?: string): Promise<SuiteGeneration> => {
  try {
    const generationNumber = await getNextGenerationNumber(suite.id);
    return await createSuiteGenerationInDb(
      {
        suite_id: suite.id,
        simulation_type: suite.simulation_type,
        rule_repo: suite.rule_repo,
        rule_version: suite.rule_version,
        wizard_snapshot: suite.wizard_progress,
        generation_metadata: {},
      },
      generationNumber,
      userId,
      userEmail,
    );
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to create suite generation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

export const getGenerationsForSuite = async (suiteId: number): Promise<SuiteGeneration[]> => {
  try {
    return await getGenerationsBySuiteId(suiteId);
  } catch (error) {
    throw new HttpException(
      `Failed to retrieve generations: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

export const getLatestGenerationForSuite = async (suiteId: number): Promise<SuiteGeneration | null> => {
  try {
    return await getLatestGenerationBySuiteId(suiteId);
  } catch (error) {
    throw new HttpException(
      `Failed to retrieve latest generation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};
