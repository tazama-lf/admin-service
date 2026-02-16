export interface RuleEntity {
  rule_id: string;
  rule_name: string;
  description: string;
  tenant_id: string;
  txtp: string;
  version: string;
  status: string;
  publishing_status: string;
  updated_by: string;
  rule_type?: string;
  rule_config_id?: string;
  created_at: Date;
  updated_at: Date;
  id?: string;
}

export interface RuleData {
  ruleName: string;
  description: string;
  txtp: string;
  version: string;
  txtpVersion: string;
  status: string;
  publishing_status: string;
  rule_type: string;
  rule_config_id: string;
  userID: string;
}

export interface Transaction {
  CstmrCdtTrfInitn: {
    GrpHdr: Record<string, unknown>;
    PmtInf: Record<string, unknown>;
  };
  TxTp: string;
  TenantId: string;
}

export interface NetworkMap {
  cfg: string;
  active: boolean;
  messages: Array<Record<string, unknown>>;
  tenantId: string;
}

export interface MetaData {
  correlationId: string;
  timestamp: string;
  tenantId: string;
  transactionType: string;
}

export interface RuleRequest {
  transaction: Transaction;
  networkMap: NetworkMap;
  DataCache: Record<string, unknown>;
  metaData: MetaData;
}

export interface UpdateRuleRequest {
  ruleName?: string;
  description?: string;
  txtp?: string;
  txtp_version?: string;
  version?: string;
  status?: string;
  publishing_status?: string;
  updated_by?: string;
  rule_type?: string;
  rule_config_id?: string;
  flow_id?: string;
  metadata: {
    sync: boolean;
    deploy: boolean;
    test: boolean;
    simulation: boolean;
  };
}

export interface CreateRuleHandlerReqBody {
  ruleData: RuleData;
  ruleRequest: RuleRequest;
}

export interface ActiveNetworkMap {
  configuration: unknown;
}
export interface CloneRuleHandlerReqBody {
  payload: {
    rule_name: string;
    description: string;
    status: string;
    publishing_status: string;
    rule_config_id: string;
    txtp: string;
    version: string;
  };
  ruleRequest: RuleRequest;
}
