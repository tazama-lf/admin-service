import type { FieldStrategyCode } from '../simulation-studio/suite-generation.interface';

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
