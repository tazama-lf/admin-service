// SPDX-License-Identifier: Apache-2.0
import type {
  SimulationSuite,
  CreateSimulationSuiteDto,
  UpdateSimulationSuiteDto,
  SimulationSuitesQueryOptions,
  SimulationSuitesListResponse,
  UpdateSuiteDraftDto,
  GenerateSuiteContextDto,
  GenerateSuiteContextResponse,
  GeneratedContextRow,
  RunSuiteResponse,
  RunSuiteStatusResponse,
} from '../interface/simulation-suites.interface';
import { SimulationSuiteStatus } from '../interface/simulation-suites.interface';
import {
  getSimulationSuitesFromDb,
  getSimulationSuiteByIdFromDb,
  createSimulationSuiteInDb,
  updateSimulationSuiteInDb,
} from '../repositories/simulation-studio/suites.repository';
import { HttpException, HttpStatus } from '../utils/error';
import { validateSimulationSuiteLengthConstraints } from '../utils/simulation-suite-validation';

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
export const getSimulationSuiteById = async (id: number, tenantId: string): Promise<SimulationSuite> => {
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

    validateSimulationSuiteLengthConstraints(payload);

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

    validateSimulationSuiteLengthConstraints(payload);

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

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const parseRunCount = (runCount: unknown): number => {
  if (typeof runCount === 'number' && Number.isFinite(runCount)) {
    return runCount;
  }
  if (typeof runCount === 'string') {
    const parsed = parseInt(runCount, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 0;
};

export const saveSimulationSuiteDraft = async (id: number, tenantId: string, payload: UpdateSuiteDraftDto): Promise<SimulationSuite> => {
  if (!Number.isInteger(payload.screen) || payload.screen < 1 || payload.screen > 5) {
    throw new HttpException('screen must be an integer between 1 and 5', HttpStatus.BAD_REQUEST);
  }

  const suite = await getSimulationSuiteById(id, tenantId);
  const currentWizardProgress = asRecord(suite.wizard_progress);
  const currentMetadata = asRecord(suite.metadata);
  const currentWizardDraft = asRecord(currentMetadata.wizardDraft);
  const screenKey = `screen${payload.screen}`;

  const completedStepsRaw = currentWizardProgress.completedSteps;
  const completedSteps = Array.isArray(completedStepsRaw)
    ? completedStepsRaw.filter((step): step is number => typeof step === 'number' && Number.isInteger(step))
    : [];
  const updatedCompletedSteps = Array.from(new Set([...completedSteps, payload.screen])).sort((a, b) => a - b);

  const currentStepRaw = currentWizardProgress.currentStep;
  const currentStep = typeof currentStepRaw === 'number' && Number.isFinite(currentStepRaw) ? currentStepRaw : 1;

  return await updateSimulationSuite(id, tenantId, {
    wizard_progress: {
      ...currentWizardProgress,
      currentStep: Math.max(currentStep, payload.screen),
      completedSteps: updatedCompletedSteps,
      [screenKey]: true,
    },
    metadata: {
      ...currentMetadata,
      wizardDraft: {
        ...currentWizardDraft,
        [screenKey]: payload.data,
      },
    },
  });
};

export const generateSimulationSuiteContext = async (
  id: number,
  tenantId: string,
  payload: GenerateSuiteContextDto,
): Promise<GenerateSuiteContextResponse> => {
  const suite = await getSimulationSuiteById(id, tenantId);
  const safeCount = Math.max(1, Math.min(100, payload.count ?? 5));

  const metadata = asRecord(suite.metadata);
  const wizardDraft = asRecord(metadata.wizardDraft);
  const screen2 = asRecord(wizardDraft.screen2);
  const txtpConfigs = Array.isArray(screen2.txtpConfigs) ? screen2.txtpConfigs : [];
  const txtpFromDraft = txtpConfigs.find((config) => config && typeof config === 'object') as Record<string, unknown> | undefined;

  const suitePrimaryTxtp = typeof suite.primary_txtp === 'string' && suite.primary_txtp.length ? suite.primary_txtp : undefined;
  const draftPrimaryTxtp = txtpFromDraft && typeof txtpFromDraft.txtp === 'string' ? txtpFromDraft.txtp : undefined;
  const baseTxtp = suitePrimaryTxtp ?? draftPrimaryTxtp ?? 'unknown.txtp';

  const rows: GeneratedContextRow[] = Array.from({ length: safeCount }, (_, index) => ({
    row_index: index + 1,
    txtp: baseTxtp,
    payload: {
      suiteId: suite.id,
      txtp: baseTxtp,
      generatedIndex: index + 1,
    },
  }));

  return {
    rows,
    count: rows.length,
  };
};

export const runSimulationSuite = async (id: number, tenantId: string): Promise<RunSuiteResponse> => {
  const suite = await getSimulationSuiteById(id, tenantId);
  const runId = `run-${id}-${Date.now()}`;

  const metadata = asRecord(suite.metadata);
  const simulationRuns = asRecord(metadata.simulationRuns);

  const runState: Record<string, unknown> = {
    runId,
    status: 'ENV_PROVISIONING',
    phase: 'ENV_PROVISIONING',
    started_at: new Date().toISOString(),
    partialResults: [],
  };

  await updateSimulationSuite(id, tenantId, {
    status: SimulationSuiteStatus.RUNNING,
    run_count: parseRunCount(suite.run_count) + 1,
    last_run_at: new Date(),
    metadata: {
      ...metadata,
      lastRunId: runId,
      simulationRuns: {
        ...simulationRuns,
        [runId]: runState,
      },
    },
  });

  return {
    runId,
    status: 'ENV_PROVISIONING',
    phase: 'ENV_PROVISIONING',
  };
};

export const getSimulationSuiteRunStatus = async (id: number, runId: string, tenantId: string): Promise<RunSuiteStatusResponse> => {
  const suite = await getSimulationSuiteById(id, tenantId);
  const metadata = asRecord(suite.metadata);
  const simulationRuns = asRecord(metadata.simulationRuns);
  const runState = asRecord(simulationRuns[runId]);

  if (!Object.keys(runState).length) {
    throw new HttpException(`Run with id ${runId} not found for suite ${id}`, HttpStatus.NOT_FOUND);
  }

  const status = typeof runState.status === 'string' ? runState.status : 'ENV_PROVISIONING';
  const phase = typeof runState.phase === 'string' ? runState.phase : 'ENV_PROVISIONING';
  const errorMessage = typeof runState.error_message === 'string' ? runState.error_message : undefined;
  const partialResults = Array.isArray(runState.partialResults)
    ? runState.partialResults.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    : [];

  return {
    runId,
    status: status as RunSuiteStatusResponse['status'],
    phase,
    error_message: errorMessage,
    partialResults,
  };
};
