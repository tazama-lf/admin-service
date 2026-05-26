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
import { HttpException, HttpStatus } from '../utils/error';

/**
 * Get all simulation suites with optional filters and pagination
 */
export const getSimulationSuites = async (options: SimulationSuitesQueryOptions): Promise<SimulationSuitesListResponse> => {
  try {
    const result = await getSimulationSuitesFromDb(options);
    return result;
  } catch (error) {
    throw new HttpException(
      `Failed to retrieve simulation suites: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

/**
 * Get a specific simulation suite by ID
 */
export const getSimulationSuiteById = async (id: number, tenantId: string): Promise<SimulationSuite | null> => {
  try {
    const suite = await getSimulationSuiteByIdFromDb(id, tenantId);
    if (!suite) {
      throw new HttpException(`Simulation suite with id ${id} not found`, HttpStatus.NOT_FOUND);
    }
    return suite;
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }
    throw new HttpException(
      `Failed to retrieve simulation suite: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

/**
 * Create a new simulation suite (Step 1 of wizard: Rule & Details)
 *
 * This creates the suite with initial data from the first wizard screen.
 * Subsequent wizard steps (2-7) use updateSimulationSuite() with wizard_progress updates.
 *
 * @param payload - CreateSimulationSuiteDto with name, description, rule, TXTP info
 * @param tenantId - Tenant ID
 * @param userId - User creating the suite
 * @param userEmail - User email (optional)
 * @returns Created SimulationSuite with id for subsequent PATCH operations
 */
export const createSimulationSuite = async (
  payload: CreateSimulationSuiteDto,
  tenantId: string,
  userId: string,
  userEmail?: string,
): Promise<SimulationSuite> => {
  try {
    // Validate required fields
    if (!payload.name || payload.name.trim().length === 0) {
      throw new HttpException('Simulation suite name is required', HttpStatus.BAD_REQUEST);
    }

    if (payload.name.length > 30) {
      throw new HttpException('Simulation suite name cannot exceed 30 characters', HttpStatus.BAD_REQUEST);
    }

    if (payload.description && payload.description.length > 300) {
      throw new HttpException('Simulation suite description cannot exceed 300 characters', HttpStatus.BAD_REQUEST);
    }

    const suite = await createSimulationSuiteInDb(payload, tenantId, userId, userEmail);
    return suite;
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }
    throw new HttpException(
      `Failed to create simulation suite: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};

/**
 * Update an existing simulation suite (Steps 2-7 of wizard)
 *
 * Use this endpoint to update the suite as user progresses through wizard steps.
 * Pass wizard_progress to track which steps have been completed.
 *
 * Example wizard_progress update:
 * {
 *   currentStep: 2,
 *   completedSteps: [1],
 *   step2Data: { ... TXTP data ... }
 * }
 *
 * @param id - Simulation suite ID
 * @param tenantId - Tenant ID
 * @param payload - UpdateSimulationSuiteDto with fields to update
 * @returns Updated SimulationSuite
 */
export const updateSimulationSuite = async (id: number, tenantId: string, payload: UpdateSimulationSuiteDto): Promise<SimulationSuite> => {
  try {
    // Validate field constraints
    if (payload.name?.trim().length === 0) {
      throw new HttpException('Simulation suite name cannot be empty', HttpStatus.BAD_REQUEST);
    }

    if (payload.name && payload.name.length > 50) {
      throw new HttpException('Simulation suite name cannot exceed 50 characters', HttpStatus.BAD_REQUEST);
    }

    if (payload.description && payload.description.length > 300) {
      throw new HttpException('Simulation suite description cannot exceed 300 characters', HttpStatus.BAD_REQUEST);
    }

    const updatedSuite = await updateSimulationSuiteInDb(id, tenantId, payload);

    if (!updatedSuite) {
      throw new HttpException(`Simulation suite with id ${id} not found`, HttpStatus.NOT_FOUND);
    }

    return updatedSuite;
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }
    throw new HttpException(
      `Failed to update simulation suite: ${error instanceof Error ? error.message : 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};
