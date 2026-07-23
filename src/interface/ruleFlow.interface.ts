export interface RuleFlowRequest {
  rule_id: string;
  flowData: {
    flow_json_rule_builder: Record<string, unknown>;
    flow_json_test_case: Record<string, unknown>;
  };
  tenantId: string;
}

export interface RuleFlowResponse {
  id: number;
  rule_id: string;
  flow_json_rule_builder?: Record<string, unknown>;
  flow_json_test_case?: Record<string, unknown>;
  flow_json?: Record<string, unknown>;
  ts_file_base64_rule_builder?: string;
  ts_file_base64_test_case?: string;
  ts_file_base64?: string;
  status_rule_builder?: string;
  status_test_case?: string;
  status?: string;
  tenant_id: string;
  created_at: Date;
  updated_at: Date;
}
