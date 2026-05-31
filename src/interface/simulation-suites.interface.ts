// SPDX-License-Identifier: Apache-2.0

export enum SimulationSuiteStatus {
  DRAFT = 'DRAFT',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  ARCHIVED = 'ARCHIVED',
}

export enum SimulationType {
  SINGLE_RULE = 'SINGLE_RULE',
  INTEGRATION_TESTING = 'INTEGRATION_TESTING',
}

export const SIMULATION_SUITE_NAME_MAX_LENGTH = 120;
export const SIMULATION_SUITE_DESCRIPTION_MAX_LENGTH = 500;

/**
 * Wizard step tracking for multi-step simulation suite creation
 * Steps: 1=Rule & Details, 2=TXTP Selection, 3=Trigger Data, 4=Enrichment Data, 5=Preview & Save, 6=Simulation Results
 */
export interface WizardProgress {
  currentStep?: number;
  completedSteps?: number[];
  [key: string]: unknown;
}

export interface SimulationSuite {
  id: number;
  tenant_id: string;
  name: string;
  description?: string;
  simulation_type: SimulationType;
  status: SimulationSuiteStatus;
  rule_repo?: string;
  rule_name?: string;
  rule_version?: string;
  primary_txtp?: string;
  primary_txtp_version?: string;
  clone_source_suite_id?: number;
  iteration_count: number;
  run_count: number;
  last_run_at?: Date;
  wizard_progress: WizardProgress;
  metadata: Record<string, unknown>;
  created_by: string;
  created_by_email?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * POST /v1/admin/simulation-studio/suites
 * Creates a new simulation suite with Step 1 (Rule & Details) data
 * Subsequent steps use PATCH API to update wizard_progress
 */
export interface CreateSimulationSuiteDto {
  name: string; // Required: Simulation Suite Name
  description?: string; // Optional: Suite description (max 500 chars)
  simulation_type?: SimulationType; // Optional: SINGLE_RULE (default) or INTEGRATION_TESTING
  rule_repo?: string; // Optional: Rule repository
  rule_name?: string; // Optional: Associated rule name
  rule_version?: string; // Optional: Rule version
  primary_txtp?: string; // Optional: Primary transaction type (e.g., pacs.008)
  primary_txtp_version?: string; // Optional: TXTP version
  clone_source_suite_id?: number; // Optional: Source suite ID if cloning
  wizard_progress?: WizardProgress; // Optional: Initialize wizard progress
  metadata?: Record<string, unknown>; // Optional: Custom metadata
}

/**
 * PATCH /v1/admin/simulation-studio/suites/:id
 * Updates simulation suite with data from next wizard steps
 * Use wizard_progress to track completion of steps 2-7
 */
export interface UpdateSimulationSuiteDto {
  name?: string;
  description?: string;
  simulation_type?: SimulationType;
  status?: SimulationSuiteStatus;
  rule_repo?: string;
  rule_name?: string;
  rule_version?: string;
  primary_txtp?: string;
  primary_txtp_version?: string;
  iteration_count?: number;
  run_count?: number;
  last_run_at?: Date;
  wizard_progress?: WizardProgress; // Update with step completion data
  metadata?: Record<string, unknown>;
}

export interface SimulationSuitesQueryDto {
  search?: string; // Search by suite name (case-insensitive contains)
  status?: SimulationSuiteStatus; // Filter by status
  rule_name?: string; // Filter by associated rule name
  rule?: string; // Alias for rule_name
  txtp?: string; // Filter by transaction type (TXTP)
  updated_from?: string; // Filter by updated date from (inclusive) - ISO format
  updated_to?: string; // Filter by updated date to (inclusive) - ISO format
  offset?: number; // Offset (0-based)
  limit?: number; // Limit
  page?: number; // Page number (1-based); converted to offset when offset is not supplied
}

export interface SimulationSuiteIdParamsDto {
  id: string;
}

export interface SimulationSuitesQueryOptions {
  tenantId: string;
  search?: string;
  status?: SimulationSuiteStatus;
  ruleName?: string;
  txtp?: string;
  updatedFrom?: Date;
  updatedTo?: Date;
  offset?: number;
  limit?: number;
}

export interface SimulationSuitesListResponse {
  data: SimulationSuite[];
  total: number;
  limit?: number;
  offset?: number;
}

export interface UpdateSuiteDraftDto {
  screen: number;
  data: Record<string, unknown>;
}

export interface GenerateSuiteContextDto {
  count?: number;
}

export interface GeneratedContextRow {
  row_index: number;
  txtp: string;
  payload: Record<string, unknown>;
}

export interface GenerateSuiteContextResponse {
  rows: GeneratedContextRow[];
  count: number;
}

export type SimulationRunStatus = 'ENV_PROVISIONING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface RunSuiteResponse {
  runId: string;
  status: SimulationRunStatus;
  phase: string;
}

export interface RunSuiteStatusResponse extends RunSuiteResponse {
  error_message?: string;
  partialResults?: Array<Record<string, unknown>>;
}
