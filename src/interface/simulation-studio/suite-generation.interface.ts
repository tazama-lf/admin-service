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

export type FieldStrategyCode = 'keep_sample' | 'static' | 'range' | 'skip' | 'random';
/** @deprecated Use FieldStrategyCode instead */
export type ContextFieldStrategyCode = FieldStrategyCode;

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
  related_txtp_config_id?: number | null;
  related_transaction?: string | null;
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
  related_txtp_config_id?: number | null;
  related_transaction?: string | null;
}

export interface UpdateContextTxtpConfigDto {
  message_count?: number;
  faker_seed?: number;
  generator_profile?: Record<string, unknown>;
  related_txtp_config_id?: number | null;
}

export interface AddContextTxtpConfigDto {
  txtp: string;
  txtp_version: string;
  message_count?: number;
  related_context_txtp_id?: number;
}

// ── Context Field Strategies ─────────────────────────────────────────────────

export interface ContextFieldStrategy {
  id: number;
  context_txtp_config_id: number;
  field_path: string;
  strategy_code: FieldStrategyCode;
  static_value?: unknown;
  range_min?: number;
  range_max?: number;
  faker_semantic_type?: string;
  generator_options: Record<string, unknown>;
  is_required_override?: boolean;
  created_at: Date;
}

export interface UpsertFieldStrategyDto {
  field_path: string;
  strategy_code: FieldStrategyCode;
  static_value?: unknown;
  range_min?: number;
  range_max?: number;
  faker_semantic_type?: string;
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
  related_txtp_config_id?: number | null;
  related_transaction?: string | null;
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
  related_txtp_config_id?: number | null;
  related_transaction?: string | null;
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
  related_txtp_config_id?: number | null;
  related_transaction?: string | null;
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
  related_txtp_config_id?: number | null;
}

export interface AddTriggerTxtpConfigDto {
  txtp: string;
  txtp_version: string;
  message_count?: number;
  related_trigger_txtp_id?: number;
}

export interface TriggerFieldStrategy {
  id: number;
  trigger_txtp_config_id: number;
  field_path: string;
  strategy_code: FieldStrategyCode;
  static_value?: unknown;
  range_min?: number;
  range_max?: number;
  faker_semantic_type?: string;
  generator_options: Record<string, unknown>;
  created_at: Date;
}

export interface UpsertTriggerFieldStrategyDto {
  field_path: string;
  strategy_code: FieldStrategyCode;
  static_value?: unknown;
  range_min?: number;
  range_max?: number;
  faker_semantic_type?: string;
  generator_options?: Record<string, unknown>;
}

export interface TriggerTxtpConfigWithStrategies {
  trigger_txtp_config_id: number;
  txtp: string;
  txtp_version: string;
  message_count: number;
  display_order: number;
  payload_template_json: Record<string, unknown>;
  link_to_context_pairs: boolean;
  expected_result_band?: TriggerExpectedBand;
  notes?: string;
  related_txtp_config_id?: number | null;
  field_strategies: TriggerFieldStrategy[];
  related_transaction?: string;
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
  field_strategies?: UpsertTriggerFieldStrategyDto[];
}

// ── Context/Trigger Mapping ──────────────────────────────────────────────────

export interface MappingPair {
  primary: string;
  related: string;
}

export interface TxtpMapping {
  id: number;
  primary_tx_id: number;
  related_tx_id: number;
  mapping: MappingPair[];
}

export interface UpsertTxtpMappingDto {
  primary_txtp_id: number;
  related_txtp_id: number;
  mapping: MappingPair[];
}

export interface TxtpMappingParamsDto {
  primaryTxtpId: string;
  relatedTxtpId: string;
}

// ── Enrichment Tables ───────────────────────────────────────────────────────
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

export interface BulkEnrichmentUpdateItemDto {
  id: number;
  row_count?: number;
  payload_template_json?: Record<string, unknown>;
  schema_template_json?: Record<string, unknown>;
  faker_profile?: Record<string, unknown>;
}

export interface EnrichmentFieldStrategy {
  id: number;
  enrichment_table_id: number;
  column_name: string;
  column_type: string;
  strategy_code: FieldStrategyCode;
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
  strategy_code: FieldStrategyCode;
  static_value?: unknown;
  range_min?: number;
  range_max?: number;
  generator_type?: string;
  generator_options?: Record<string, unknown>;
}

export interface SuiteEnrichmentTableWithStrategies extends SuiteEnrichmentTable {
  field_strategies: EnrichmentFieldStrategy[];
}
