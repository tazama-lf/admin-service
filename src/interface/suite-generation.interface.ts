// SPDX-License-Identifier: Apache-2.0

export enum SuiteGenerationStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum SimulationType {
  SINGLE_RULE = 'SINGLE_RULE',
  INTEGRATION_TESTING = 'INTEGRATION_TESTING',
}

export type ContextFieldStrategyCode = 'keep_sample' | 'static' | 'range' | 'generated' | 'null' | 'skip';

export interface SuiteGeneration {
  id: number;
  suite_id: number;
  generation_number: number;
  status: SuiteGenerationStatus;
  simulation_type: SimulationType;
  rule_repo?: string;
  rule_version?: string;
  context_count: number;
  trigger_count: number;
  enrichment_table_count: number;
  generated_context_count: number;
  generated_trigger_count: number;
  generated_enrichment_row_count: number;
  context_field_config_count: number;
  trigger_field_config_count: number;
  enrichment_field_config_count: number;
  wizard_snapshot: Record<string, unknown>;
  generation_metadata: Record<string, unknown>;
  created_by: string;
  created_by_email?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSuiteGenerationDto {
  suite_id: number;
  simulation_type?: SimulationType;
  rule_repo?: string;
  rule_version?: string;
  wizard_snapshot?: Record<string, unknown>;
  generation_metadata?: Record<string, unknown>;
}

// ── Context TXTP Config ──────────────────────────────────────────────────────

export interface SuiteContextTxtpConfig {
  id: number;
  generation_id: number;
  txtp: string;
  txtp_version: string;
  display_order: number;
  message_count: number;
  schema_snapshot: Record<string, unknown>;
  sample_payload_snapshot?: Record<string, unknown>;
  faker_seed?: number;
  generator_profile: Record<string, unknown>;
  created_at: Date;
}

export interface CreateContextTxtpConfigDto {
  generation_id: number;
  txtp: string;
  txtp_version: string;
  display_order: number;
  message_count: number;
  schema_snapshot: Record<string, unknown>;
  sample_payload_snapshot?: Record<string, unknown>;
  faker_seed?: number;
  generator_profile?: Record<string, unknown>;
}

export interface UpdateContextTxtpConfigDto {
  message_count?: number;
  faker_seed?: number;
  generator_profile?: Record<string, unknown>;
}

// ── Context Field Strategies ─────────────────────────────────────────────────

export interface ContextFieldStrategy {
  id: number;
  context_txtp_config_id: number;
  field_path: string;
  strategy_code: ContextFieldStrategyCode;
  static_value?: unknown;
  range_min?: number;
  range_max?: number;
  generator_type?: string;
  generator_options: Record<string, unknown>;
  is_required_override?: boolean;
  created_at: Date;
}

export interface UpsertFieldStrategyDto {
  field_path: string;
  strategy_code: ContextFieldStrategyCode;
  static_value?: unknown;
  range_min?: number;
  range_max?: number;
  generator_type?: string;
  generator_options?: Record<string, unknown>;
  is_required_override?: boolean;
}
