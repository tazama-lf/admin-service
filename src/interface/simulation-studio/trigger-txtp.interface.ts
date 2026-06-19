// ── Trigger TXTP Config ──────────────────────────────────────────────────────

import type { FieldStrategyCode } from './suite-generation.interface';

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
  related_transaction?: string | null;
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
