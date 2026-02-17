export interface SimulationLog {
  id: number;
  created_by: string;
  tenant_id: string;
  rule_id: string;
  old_data: Record<string, unknown>;
  new_data: Record<string, unknown>;
  description: string;
  category: string;
  created_by_email?: string;
  created_at: Date;
  updated_at: Date;
}

export interface SimulationLogRequest {
  userId: string;
  tenantId: string;
  ruleId: string;
  oldData: Record<string, unknown>;
  newData: Record<string, unknown>;
  description?: string;
  category: string;
  createdByEmail?: string;
}
