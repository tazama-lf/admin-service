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
  flow_json_rule_builder: Record<string, unknown>;
  flow_json_test_case: Record<string, unknown>;
  tenant_id: string;
  created_at: Date;
  updated_at: Date;
}
