// SPDX-License-Identifier: Apache-2.0
import type { SuiteGeneration } from '../interface/simulation-studio/suite-generation.interface';
import type { SimulationSuite } from '../interface/simulation-studio/simulation-suites.interface';
import {
  createSuiteGenerationInDb,
  getNextGenerationNumber,
  getGenerationsBySuiteId,
  getLatestGenerationBySuiteId,
  updateGenerationCountsInDb,
  getGenerationSummaryFromDb,
  updateWizardProgressInDb,
  getGenerationByIdFromDb,
  cloneGenerationDataInDb,
  type GenerationSummary,
  updateGenerationStatusInDb,
  resumeGenerationInDb,
} from '../repositories/simulation-studio/suite-generations.repository';
import { deleteTriggerTxtpConfigInDb } from '../repositories/simulation-studio/trigger-txtp-configs.repository';
import { incrementSuiteIterationCountInDb } from '../repositories/simulation-studio/suites.repository';
import { handlePostExecuteSqlStatement } from './database.logic.service';
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { HttpException, HttpStatus } from '../utils/error';
// Re-export context config service for app.controller consumers
export {
  createConfigWithDefaultStrategies,
  createContextTxtpConfig,
  addContextTxtpConfig,
  getContextConfigsWithStrategies,
  bulkUpdateContextConfigs,
  getFieldStrategiesForContextConfig,
  deleteContextTxtpConfig,
} from './context-txtp-config.logic.service';

export type { GenerationSummary };

// ── Wizard progress ───────────────────────────────────────────────────────────

export const updateWizardProgress = async (generationId: number, currentStep: number, completedSteps: number[]): Promise<void> => {
  try {
    await updateWizardProgressInDb(generationId, currentStep, completedSteps);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to update wizard progress: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Delete trigger txtp config ────────────────────────────────────────────────

export const deleteTriggerTxtpConfig = async (configId: number): Promise<void> => {
  try {
    const deleted = await deleteTriggerTxtpConfigInDb(configId);
    if (!deleted) throw new HttpException(`Trigger txtp config ${configId} not found`, HttpStatus.NOT_FOUND);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to delete trigger txtp config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Count recalculation ──────────────────────────────────────────────────────

/**
 * Recalculates context_count, trigger_count, enrichment_table_count for a generation
 * by summing message_count from each config table, then saves to trs_suite_generations.
 * Called after each bulk PATCH on context / trigger / enrichment steps.
 */
export const recalculateGenerationCounts = async (generationId: number): Promise<void> => {
  try {
    const [ctxRes, trigRes, enrRes] = await Promise.all([
      handlePostExecuteSqlStatement<{ total: string }>(
        {
          text: 'SELECT COALESCE(SUM(message_count), 0) AS total FROM trs_suite_context_txtp_configs WHERE generation_id = $1',
          values: [generationId],
        } satisfies PgQueryConfig,
        'simulation',
      ),
      handlePostExecuteSqlStatement<{ total: string }>(
        {
          text: 'SELECT COALESCE(SUM(message_count), 0) AS total FROM trs_suite_trigger_txtp_configs WHERE generation_id = $1',
          values: [generationId],
        } satisfies PgQueryConfig,
        'simulation',
      ),
      handlePostExecuteSqlStatement<{ total: string }>(
        {
          text: 'SELECT COALESCE(SUM(row_count), 0) AS total FROM trs_suite_enrichment_tables WHERE generation_id = $1',
          values: [generationId],
        } satisfies PgQueryConfig,
        'simulation',
      ),
    ]);

    await updateGenerationCountsInDb(generationId, {
      context_count: parseInt(ctxRes.rows[0].total, 10),
      trigger_count: parseInt(trigRes.rows[0].total, 10),
      enrichment_table_count: parseInt(enrRes.rows[0].total, 10),
    });
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to recalculate generation counts: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Summary ──────────────────────────────────────────────────────────────────

export const getGenerationSummary = async (generationId: number): Promise<GenerationSummary | null> => {
  try {
    return await getGenerationSummaryFromDb(generationId);
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to retrieve generation summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Suite Generation ─────────────────────────────────────────────────────────

export const createSuiteGeneration = async (suite: SimulationSuite, userId: string, userEmail?: string): Promise<SuiteGeneration> => {
  try {
    const generation = await createSuiteGenerationInDb(
      {
        suite_id: suite.id,
        simulation_type: suite.simulation_type,
        rule_name: suite.rule_name,
        rule_version: suite.rule_version,
        wizard_snapshot: suite.wizard_progress,
        generation_metadata: {},
      },
      userId,
      userEmail,
    );
    await incrementSuiteIterationCountInDb(suite.id);
    return generation;
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

export const resumeGeneration = async (suiteId: number, generationId: number): Promise<SuiteGeneration | null> => {
  try {
    return await resumeGenerationInDb(suiteId, generationId);
  } catch (error) {
    throw new HttpException(
      `Failed to resume generation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

export const updateGenerationStatus = async (generationId: number, status: string): Promise<SuiteGeneration> => {
  try {
    // Validate status against enum values
    const validStatuses = ['DRAFT', 'READY', 'RUNNING', 'COMPLETED', 'FAILED', 'TIME_OUT'];
    if (!validStatuses.includes(status)) {
      throw new HttpException(`Invalid generation status: ${status}. Allowed values: ${validStatuses.join(', ')}`, HttpStatus.BAD_REQUEST);
    }

    const updated = await updateGenerationStatusInDb(generationId, status);
    if (!updated) {
      throw new HttpException(`Generation with id ${generationId} not found`, HttpStatus.NOT_FOUND);
    }
    return updated;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to update generation status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Clone generation ──────────────────────────────────────────────────────────

/**
 * Clones an existing generation (all child data) into a new generation under the
 * same suite. New generation number = current max + 1.
 * Shared by cloneSuite too.
 */
export const cloneGeneration = async (sourceGenerationId: number, userId: string, userEmail?: string): Promise<SuiteGeneration> => {
  try {
    const source = await getGenerationByIdFromDb(sourceGenerationId);
    if (!source) throw new HttpException(`Generation ${sourceGenerationId} not found`, HttpStatus.NOT_FOUND);
    const nextNum = await getNextGenerationNumber(source.suite_id);
    const newGen = await cloneGenerationDataInDb(sourceGenerationId, source.suite_id, nextNum, userId, userEmail);
    await incrementSuiteIterationCountInDb(source.suite_id);
    return newGen;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to clone generation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};
