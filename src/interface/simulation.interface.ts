// SPDX-License-Identifier: Apache-2.0

export interface SimulationStats {
  total_no_of_records: number;
  records_evaluated: number;
  alerts_generated: number;
  alerts_not_generated: number;
  run_date_time: string | null;
  replay_duration: string | null;
}

export interface SimulationResultsFilters {
  msg_id?: string;
  msg_type?: string;
  outcome?: string;
}

export interface SimulationResultRow {
  msg_id: string;
  msg_type: string;
  outcome: string;
  time: string | null;
  triggered_rules: unknown[];
  triggered_typologies: unknown[];
}

export interface SimulationResultsResponse {
  data: SimulationResultRow[];
  total: number;
  limit: number;
  offset: number;
}
