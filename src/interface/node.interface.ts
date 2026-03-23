export interface Node {
  tenant_id: string;
  node_json: Record<string, unknown>;
  created_by: string;
  id?: number;
  created_at?: Date;
  updated_at?: Date;
  order: number;
}

export interface QueryParams {
  type?: string;
  category?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
