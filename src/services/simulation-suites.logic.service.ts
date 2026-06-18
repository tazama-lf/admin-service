// SPDX-License-Identifier: Apache-2.0
import type {
  SimulationSuite,
  CreateSimulationSuiteDto,
  UpdateSimulationSuiteDto,
  SimulationSuitesQueryOptions,
  SimulationSuitesListResponse,
  SimulationSuitesCountsResponse,
} from '../interface/simulation-studio/simulation-suites.interface';
import {
  getSimulationSuitesCountsFromDb,
  getSimulationSuitesFromDb,
  getSimulationSuiteByIdFromDb,
  createSimulationSuiteInDb,
  updateSimulationSuiteInDb,
  incrementSuiteIterationCountInDb,
} from '../repositories/simulation-studio/suites.repository';
import { createSuiteGeneration, createContextTxtpConfig, recalculateGenerationCounts } from './trs-suite-generation.logic.service';
import { createTriggerTxtpConfig } from './trigger-txtp-config.logic.service';
import {
  getNextGenerationNumber,
  getGenerationsBySuiteId,
  cloneGenerationDataInDb,
} from '../repositories/simulation-studio/suite-generations.repository';
import { HttpException, HttpStatus } from '../utils/error';
import { validateSimulationSuiteLengthConstraints } from '../utils/simulation-suite-validation';

export const getSimulationSuites = async (options: SimulationSuitesQueryOptions): Promise<SimulationSuitesListResponse> => {
  try {
    return await getSimulationSuitesFromDb(options);
  } catch (error) {
    throw new HttpException(
      `Failed to retrieve simulation suites: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

export const getSimulationSuitesCounts = async (tenantId: string): Promise<SimulationSuitesCountsResponse> => {
  try {
    return await getSimulationSuitesCountsFromDb(tenantId);
  } catch (error) {
    throw new HttpException(
      `Failed to retrieve simulation suites counts: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

export const getSimulationSuiteById = async (id: number, tenantId: string): Promise<SimulationSuite | null> => {
  try {
    const suite = await getSimulationSuiteByIdFromDb(id, tenantId);
    if (!suite) throw new HttpException(`Simulation suite with id ${id} not found`, HttpStatus.NOT_FOUND);
    return suite;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to retrieve simulation suite: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

/**
 * POST /suites — Step 1 (Rule & Details).
 *
 * Flow per plan:
 *   1. INSERT trs_simulation_suites (status=DRAFT)
 *   2. INSERT trs_suite_generations (generation_number=1)
 *   3. Fetch schema + sample_payload from tcs_config by primary_txtp + version
 *   4. INSERT trs_suite_context_txtp_configs with schema_snapshot + sample_payload_snapshot
 */
export const createSimulationSuite = async (
  payload: CreateSimulationSuiteDto,
  tenantId: string,
  userId: string,
  userEmail?: string,
): Promise<SimulationSuite> => {
  try {
    if (!payload.name || payload.name.trim().length === 0) {
      throw new HttpException('Simulation suite name is required', HttpStatus.BAD_REQUEST);
    }

    validateSimulationSuiteLengthConstraints(payload);

    const suite = await createSimulationSuiteInDb(payload, tenantId, userId, userEmail);

    const generation = await createSuiteGeneration(suite, userId, userEmail);

    if (suite.primary_txtp && suite.primary_txtp_version) {
      await Promise.all([
        createContextTxtpConfig(generation.id, suite.primary_txtp, suite.primary_txtp_version, tenantId),
        createTriggerTxtpConfig(generation.id, suite.primary_txtp, suite.primary_txtp_version, tenantId),
      ]);
      // Recalculate and save generation counts after creating initial configs
      await recalculateGenerationCounts(generation.id);
    }

    return { ...suite, generation_id: generation.id };
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to create simulation suite: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

export const updateSimulationSuite = async (id: number, tenantId: string, payload: UpdateSimulationSuiteDto): Promise<SimulationSuite> => {
  try {
    if (payload.name?.trim().length === 0) {
      throw new HttpException('Simulation suite name cannot be empty', HttpStatus.BAD_REQUEST);
    }

    validateSimulationSuiteLengthConstraints(payload);

    const updatedSuite = await updateSimulationSuiteInDb(id, tenantId, payload);

    if (updatedSuite == null) throw new HttpException(`Simulation suite with id ${id} not found`, HttpStatus.NOT_FOUND);

    return updatedSuite;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to update simulation suite: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

// ── Clone suite ───────────────────────────────────────────────────────────────

export interface ClonedSuite {
  suite: SimulationSuite;
  generation_id: number | null;
}

const HISTORICAL_STATUSES = new Set(['FAILED', 'COMPLETED', 'RUNNING']);

/**
 * Clones a suite: creates a new suite, then copies all generations from the source.
 * - Latest generation (by generation_number) → always cloned as DRAFT (no runs copied).
 * - Other generations → only FAILED/COMPLETED/RUNNING are copied; status + runs preserved.
 */
export const cloneSuite = async (sourceSuiteId: number, tenantId: string, userId: string, userEmail?: string): Promise<ClonedSuite> => {
  try {
    const source = await getSimulationSuiteByIdFromDb(sourceSuiteId, tenantId);
    if (!source) throw new HttpException(`Suite ${sourceSuiteId} not found`, HttpStatus.NOT_FOUND);

    const newSuite = await createSimulationSuiteInDb(
      {
        name: source.name,
        description: source.description,
        simulation_type: source.simulation_type,
        rule_repo: source.rule_repo ?? '',
        rule_name: source.rule_name ?? '',
        rule_version: source.rule_version ?? '',
        rule_config: source.rule_config,
        primary_txtp: source.primary_txtp ?? '',
        primary_txtp_version: source.primary_txtp_version ?? '',
        clone_source_suite_id: sourceSuiteId,
        metadata: source.metadata,
        wizard_progress: { currentStep: 1, completedSteps: [1] },
      },
      tenantId,
      userId,
      userEmail,
    );

    const allGenerations = await getGenerationsBySuiteId(sourceSuiteId);
    if (allGenerations.length === 0) {
      return { suite: newSuite, generation_id: null };
    }

    const maxGenNum = Math.max(...allGenerations.map((g) => g.generation_number));
    const latestGen = allGenerations.find((g) => g.generation_number === maxGenNum)!;

    // All generations except DRAFT are copied with their original status + runs (includes latest if not DRAFT)
    const gensToPreserve = allGenerations
      .filter((g) => HISTORICAL_STATUSES.has(g.status))
      .sort((a, b) => a.generation_number - b.generation_number);

    for (const srcGen of gensToPreserve) {
      const nextNum = await getNextGenerationNumber(newSuite.id);
      await cloneGenerationDataInDb(srcGen.id, newSuite.id, nextNum, userId, userEmail, true);
      await incrementSuiteIterationCountInDb(newSuite.id);
    }

    // Always add a new DRAFT cloned from the latest generation (the working copy)
    const nextNum = await getNextGenerationNumber(newSuite.id);
    const newLatestGen = await cloneGenerationDataInDb(latestGen.id, newSuite.id, nextNum, userId, userEmail, false);
    await incrementSuiteIterationCountInDb(newSuite.id);

    return { suite: { ...newSuite, generation_id: newLatestGen.id }, generation_id: newLatestGen.id };
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(
      `Failed to clone suite: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};
