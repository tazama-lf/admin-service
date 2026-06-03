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

export interface AddContextTxtpConfigDto {
  txtp: string;
  txtp_version: string;
  message_count?: number;
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

export interface ContextTxtpConfigWithStrategies {
  context_txtp_config_id: number;
  txtp: string;
  txtp_version: string;
  message_count: number;
  display_order: number;
  schema_snapshot: Record<string, unknown>;
  sample_payload_snapshot?: Record<string, unknown>;
  field_strategies: ContextFieldStrategy[];
}

export interface BulkConfigItemDto {
  context_txtp_config_id: number;
  message_count?: number;
  faker_seed?: number;
  generator_profile?: Record<string, unknown>;
  field_strategies?: UpsertFieldStrategyDto[];
}

// ── Trigger TXTP Config ──────────────────────────────────────────────────────

export type TriggerOverrideType = 'static' | 'range' | 'generated' | 'remove' | 'null';
export type TriggerExpectedBand = 'good' | 'neutral' | 'bad' | 'error';

export interface SuiteTriggerTxtpConfig {
  id: number;
  generation_id: number;
  txtp: string;
  txtp_version: string;
  display_order: number;
  message_count: number;
  link_to_context_pairs: boolean;
  payload_template_json: Record<string, unknown>;
  expected_independent_variable?: number;
  expected_result_band?: TriggerExpectedBand;
  notes?: string;
  faker_seed?: number;
  generator_profile: Record<string, unknown>;
  created_at: Date;
}

export interface CreateTriggerTxtpConfigDto {
  generation_id: number;
  txtp: string;
  txtp_version: string;
  display_order: number;
  message_count: number;
  payload_template_json: Record<string, unknown>;
  link_to_context_pairs?: boolean;
  expected_independent_variable?: number;
  expected_result_band?: TriggerExpectedBand;
  notes?: string;
  faker_seed?: number;
  generator_profile?: Record<string, unknown>;
}

export interface UpdateTriggerTxtpConfigDto {
  message_count?: number;
  link_to_context_pairs?: boolean;
  payload_template_json?: Record<string, unknown>;
  expected_independent_variable?: number;
  expected_result_band?: TriggerExpectedBand;
  notes?: string;
  faker_seed?: number;
  generator_profile?: Record<string, unknown>;
}

export interface AddTriggerTxtpConfigDto {
  txtp: string;
  txtp_version: string;
  message_count?: number;
}

export interface TriggerFieldOverride {
  id: number;
  trigger_txtp_config_id: number;
  field_path: string;
  override_type: TriggerOverrideType;
  static_value?: unknown;
  range_min?: number;
  range_max?: number;
  generator_type?: string;
  generator_options: Record<string, unknown>;
  created_at: Date;
}

export interface UpsertTriggerFieldOverrideDto {
  field_path: string;
  override_type: TriggerOverrideType;
  static_value?: unknown;
  range_min?: number;
  range_max?: number;
  generator_type?: string;
  generator_options?: Record<string, unknown>;
}

export interface TriggerTxtpConfigWithOverrides {
  trigger_txtp_config_id: number;
  txtp: string;
  txtp_version: string;
  message_count: number;
  display_order: number;
  payload_template_json: Record<string, unknown>;
  link_to_context_pairs: boolean;
  expected_result_band?: TriggerExpectedBand;
  notes?: string;
  field_overrides: TriggerFieldOverride[];
}

export interface BulkTriggerConfigItemDto {
  trigger_txtp_config_id: number;
  message_count?: number;
  link_to_context_pairs?: boolean;
  payload_template_json?: Record<string, unknown>;
  expected_result_band?: TriggerExpectedBand;
  notes?: string;
  faker_seed?: number;
  generator_profile?: Record<string, unknown>;
  field_overrides?: UpsertTriggerFieldOverrideDto[];
}

// ── Enrichment Tables ────────────────────────────────────────────────────────

export type EnrichmentFieldStrategyCode = 'static' | 'range' | 'generated' | 'null' | 'copy';

export interface SuiteEnrichmentTable {
  id: number;
  generation_id: number;
  table_name: string;
  table_order: number;
  row_count: number;
  payload_template_json?: Record<string, unknown>;
  schema_template_json?: Record<string, unknown>;
  faker_profile: Record<string, unknown>;
  created_at: Date;
}

export interface CreateEnrichmentTableDto {
  generation_id: number;
  table_name: string;
  table_order?: number;
  row_count: number;
  payload_template_json?: Record<string, unknown>;
  schema_template_json?: Record<string, unknown>;
  faker_profile?: Record<string, unknown>;
}

export interface UpdateEnrichmentTableDto {
  row_count?: number;
  payload_template_json?: Record<string, unknown>;
  schema_template_json?: Record<string, unknown>;
  faker_profile?: Record<string, unknown>;
}

export interface EnrichmentFieldStrategy {
  id: number;
  enrichment_table_id: number;
  column_name: string;
  column_type?: string;
  strategy_code: EnrichmentFieldStrategyCode;
  static_value?: unknown;
  range_min?: number;
  range_max?: number;
  generator_type?: string;
  generator_options: Record<string, unknown>;
  created_at: Date;
}

export interface UpsertEnrichmentFieldStrategyDto {
  column_name: string;
  column_type?: string;
  strategy_code: EnrichmentFieldStrategyCode;
  static_value?: unknown;
  range_min?: number;
  range_max?: number;
  generator_type?: string;
  generator_options?: Record<string, unknown>;
}

export interface EnrichmentTableWithStrategies {
  enrichment_table_id: number;
  table_name: string;
  table_order: number;
  row_count: number;
  payload_template_json?: Record<string, unknown>;
  schema_template_json?: Record<string, unknown>;
  field_strategies: EnrichmentFieldStrategy[];
}

export interface BulkEnrichmentUpdateItemDto {
  enrichment_table_id: number;
  row_count?: number;
  payload_template_json?: Record<string, unknown>;
  schema_template_json?: Record<string, unknown>;
  faker_profile?: Record<string, unknown>;
  field_strategies?: UpsertEnrichmentFieldStrategyDto[];
}
