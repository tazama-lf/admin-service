// SPDX-License-Identifier: Apache-2.0
import type {
  SimulationSuite,
  CreateSimulationSuiteDto,
  UpdateSimulationSuiteDto,
  SimulationSuitesQueryOptions,
  SimulationSuitesListResponse,
} from '../interface/simulation-suites.interface';
import {
  getSimulationSuitesFromDb,
  getSimulationSuiteByIdFromDb,
  createSimulationSuiteInDb,
  updateSimulationSuiteInDb,
} from '../repositories/simulation-studio/suites.repository';
import { createSuiteGeneration, createContextTxtpConfig } from './trs-suite-generation.logic.service';
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
      await createContextTxtpConfig(generation.id, suite.primary_txtp, suite.primary_txtp_version, tenantId);
    }

    return suite;
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
