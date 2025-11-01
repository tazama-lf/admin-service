export interface DecodedToken {
  claims?: string[];
  realm_access?: {
    roles?: string[];
  };
  clientId?: string;
  sub?: string;
  tenantId?: string;
  tenant_id?: string;
  preferred_username?: string;
  email?: string;
}

export interface AuthenticatedUserInfo {
  claims: string[];
  clientId?: string;
  tenantId?: string;
}
