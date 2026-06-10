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
