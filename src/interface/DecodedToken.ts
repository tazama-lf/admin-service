export interface DecodedToken {
  claims?: string[];
  realm_access?: {
    roles?: string[];
  };
  clientId?: string;
  sub?: string;
  tenantId?: string;
  tenant_id?: string;
}

export interface AuthenticatedUserInfo {
  claims: string[];
  clientId?: string;
  tenantId?: string;
}
