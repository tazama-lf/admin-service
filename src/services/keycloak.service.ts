// SPDX-License-Identifier: Apache-2.0

import axios from 'axios';
import { loggerService } from '../index.js';

interface KeycloakConfig {
  authUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
}

interface KeycloakUser {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
}

class KeycloakService {
  private readonly config: KeycloakConfig;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor() {
    this.config = {
      authUrl: process.env.AUTH_URL ?? 'http://10.10.80.33:8080',
      realm: process.env.KEYCLOAK_REALM ?? 'tcs',
      clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'tcs-client',
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
    };
  }

  private async getAdminToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const tokenUrl = `${this.config.authUrl}/realms/${this.config.realm}/protocol/openid-connect/token`;

    try {
      const response = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const data = response.data as { access_token: string; expires_in: number };
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in - 30) * 1000;

      return this.accessToken;
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: unknown; status?: number }; message?: string };
      loggerService.error('Failed to get Keycloak admin token:', {
        url: tokenUrl,
        realm: this.config.realm,
        clientId: this.config.clientId,
        error: axiosError.response?.data ?? axiosError.message,
        status: axiosError.response?.status,
      });
      const errorData = axiosError.response?.data as { error_description?: string } | undefined;
      throw new Error(`Failed to authenticate with Keycloak: ${errorData?.error_description ?? axiosError.message ?? 'Unknown error'}`);
    }
  }

  async getUsersByRole(roleName: string): Promise<KeycloakUser[]> {
    try {
      const token = await this.getAdminToken();

      const usersUrl = `${this.config.authUrl}/admin/realms/${this.config.realm}/roles/${roleName}/users`;
      const usersResponse = await axios.get(usersUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return usersResponse.data as KeycloakUser[];
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number }; message?: string };
      if (axiosError.response?.status === 404) {
        loggerService.warn(`Role '${roleName}' not found in Keycloak realm '${this.config.realm}'`);
        return [];
      }
      loggerService.error(`Failed to get users by role '${roleName}':`, axiosError.message ?? 'Unknown error');
      throw error;
    }
  }

  async getEmailsByRole(roleName: string): Promise<string[]> {
    const users = await this.getUsersByRole(roleName);
    return users.filter((user) => user.email && user.enabled).map((user) => user.email);
  }

  async getApprovers(): Promise<KeycloakUser[]> {
    return await this.getUsersByRole('approver');
  }

  async getApproverEmails(): Promise<string[]> {
    return await this.getEmailsByRole('approver');
  }

  async getUserByEmail(email: string): Promise<KeycloakUser | null> {
    try {
      const token = await this.getAdminToken();

      const usersUrl = `${this.config.authUrl}/admin/realms/${this.config.realm}/users?email=${encodeURIComponent(email)}&exact=true`;
      const response = await axios.get(usersUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const users = response.data as KeycloakUser[];
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      loggerService.error(`Failed to get user by email '${email}':`, error);
      return null;
    }
  }

  async getUserRoles(userId: string): Promise<string[]> {
    try {
      const token = await this.getAdminToken();

      const rolesUrl = `${this.config.authUrl}/admin/realms/${this.config.realm}/users/${userId}/role-mappings/realm`;
      const response = await axios.get(rolesUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const roles = response.data as Array<{ name: string }>;
      return roles.map((role) => role.name);
    } catch (error) {
      loggerService.error(`Failed to get roles for user '${userId}':`, error);
      return [];
    }
  }

  async getUsersByGroup(groupName: string): Promise<KeycloakUser[]> {
    try {
      const token = await this.getAdminToken();

      const groupsUrl = `${this.config.authUrl}/admin/realms/${this.config.realm}/groups?search=${encodeURIComponent(groupName)}`;
      loggerService.log(`🔍 Searching for group '${groupName}' in realm '${this.config.realm}'`);

      const groupsResponse = await axios.get(groupsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const groups = groupsResponse.data as Array<{ id: string; name: string }>;

      if (groups.length === 0) {
        loggerService.warn(` Group '${groupName}' not found in Keycloak realm '${this.config.realm}'`);
        return [];
      }

      const group = groups.find((g) => g.name.toLowerCase() === groupName.toLowerCase());

      if (!group) {
        loggerService.warn(` Exact match for group '${groupName}' not found. Available groups: ${groups.map((g) => g.name).join(', ')}`);
        return [];
      }

      loggerService.log(`Found group '${group.name}' (ID: ${group.id})`);

      const membersUrl = `${this.config.authUrl}/admin/realms/${this.config.realm}/groups/${group.id}/members`;
      const membersResponse = await axios.get(membersUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const members = membersResponse.data as KeycloakUser[];
      loggerService.log(`Found ${members.length} member(s) in group '${groupName}'`);

      return members;
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number; data?: unknown }; message?: string };
      if (axiosError.response?.status === 404) {
        loggerService.warn(`Group '${groupName}' not found in Keycloak realm '${this.config.realm}'`);
        return [];
      }
      loggerService.error(`Failed to get users by group '${groupName}':`, {
        message: axiosError.message,
        status: axiosError.response?.status,
        data: axiosError.response?.data,
      });
      throw error;
    }
  }

  async getEmailsByGroup(groupName: string): Promise<string[]> {
    const users = await this.getUsersByGroup(groupName);
    return users.filter((user) => user.email && user.enabled).map((user) => user.email);
  }

  async getApproversByGroup(groupName: string): Promise<KeycloakUser[]> {
    return await this.getUsersByGroup(groupName);
  }

  async getApproverEmailsByGroup(groupName: string): Promise<string[]> {
    return await this.getEmailsByGroup(groupName);
  }

  async getApproversByTenantAndGroup(tenantId: string, groupName: string): Promise<KeycloakUser[]> {
    try {
      const token = await this.getAdminToken();

      const groupUsers = await this.getUsersByGroup(groupName);

      if (groupUsers.length === 0) {
        loggerService.log(`ℹ No users found in group '${groupName}'`);
        return [];
      }

      loggerService.log(`Filtering ${groupUsers.length} users from group '${groupName}' by tenantId '${tenantId}'`);

      const tenantApprovers: KeycloakUser[] = [];

      for (const user of groupUsers) {
        try {
          const userUrl = `${this.config.authUrl}/admin/realms/${this.config.realm}/users/${user.id}`;
          const userResponse = await axios.get(userUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          const userData = userResponse.data as { attributes?: { tenant_id?: string[]; tenantId?: string[] } };
          const userAttributes = userData.attributes ?? {};

          const userTenantId = userAttributes.tenant_id?.[0] ?? userAttributes.tenantId?.[0];

          loggerService.log(`   - User ${user.email}: tenant_id=${userTenantId ?? 'N/A'}`);

          if (userTenantId === tenantId && user.enabled) {
            tenantApprovers.push(user);
          }
        } catch (error: unknown) {
          const err = error as Error;
          loggerService.error(`Failed to get attributes for user ${user.id}:`, err.message);
        }
      }

      loggerService.log(`Found ${tenantApprovers.length} approver(s) in group '${groupName}' for tenant '${tenantId}'`);

      return tenantApprovers;
    } catch (error: unknown) {
      const err = error as Error;
      loggerService.error('Failed to get approvers by tenant and group:', {
        tenantId,
        groupName,
        error: err.message,
      });
      throw error;
    }
  }

  async getApproverEmailsByTenantAndGroup(tenantId: string, groupName: string): Promise<string[]> {
    const approvers = await this.getApproversByTenantAndGroup(tenantId, groupName);
    return approvers.filter((user) => user.email && user.enabled).map((user) => user.email);
  }

  async getApproverGroups(): Promise<string[]> {
    try {
      const token = await this.getAdminToken();

      const groupsUrl = `${this.config.authUrl}/admin/realms/${this.config.realm}/groups`;
      const groupsResponse = await axios.get(groupsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const allGroups = groupsResponse.data as Array<{ name: string; id: string }>;
      const approverGroups: string[] = [];

      loggerService.log(`🔍 Auto-discovering approver groups from ${allGroups.length} total groups...`);

      for (const group of allGroups) {
        try {
          const groupUsers = await this.getUsersByGroup(group.name);

          let hasApprovers = false;
          for (const user of groupUsers) {
            const userRoles = await this.getUserRoles(user.id);
            if (userRoles.includes('approver')) {
              hasApprovers = true;
              break;
            }
          }

          if (hasApprovers) {
            approverGroups.push(group.name);
            loggerService.log(`  Found approver group: ${group.name}`);
          }
        } catch (error: unknown) {
          const err = error as Error;
          loggerService.warn(`  Failed to check group '${group.name}': ${err.message}`);
        }
      }

      loggerService.log(`Auto-discovered ${approverGroups.length} approver groups: ${approverGroups.join(', ')}`);
      return approverGroups;
    } catch (error: unknown) {
      const err = error as Error;
      loggerService.error('Failed to auto-discover approver groups:', err.message);
      return [];
    }
  }

  async getApproverGroupsByTenant(): Promise<Map<string, string[]>> {
    try {
      const token = await this.getAdminToken();
      const tenantGroupMap = new Map<string, string[]>();

      const approverGroups = await this.getApproverGroups();

      loggerService.log(` Building tenant-group mapping for ${approverGroups.length} approver groups...`);

      for (const groupName of approverGroups) {
        try {
          const groupUsers = await this.getUsersByGroup(groupName);

          const groupTenants = new Set<string>();

          for (const user of groupUsers) {
            try {
              const userUrl = `${this.config.authUrl}/admin/realms/${this.config.realm}/users/${user.id}`;
              const userResponse = await axios.get(userUrl, {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              const userData = userResponse.data as { attributes?: { tenant_id?: string[]; tenantId?: string[] } };
              const userAttributes = userData.attributes ?? {};

              const userTenantId = userAttributes.tenant_id?.[0] ?? userAttributes.tenantId?.[0];

              if (userTenantId) {
                groupTenants.add(userTenantId);
              }
            } catch (error: unknown) {
              const err = error as Error;
              loggerService.warn(` Failed to get tenant for user ${user.id}: ${err.message}`);
            }
          }

          for (const tenantId of groupTenants) {
            if (!tenantGroupMap.has(tenantId)) {
              tenantGroupMap.set(tenantId, []);
            }
            tenantGroupMap.get(tenantId)!.push(groupName);
          }

          loggerService.log(` Group '${groupName}' serves tenants: ${Array.from(groupTenants).join(', ')}`);
        } catch (error: unknown) {
          const err = error as Error;
          loggerService.warn(`  Failed to analyze group '${groupName}': ${err.message}`);
        }
      }

      loggerService.log(' Auto-discovered tenant-group mapping:');
      for (const [tenantId, groups] of tenantGroupMap.entries()) {
        loggerService.log(`   - ${tenantId}: ${groups.join(', ')}`);
      }

      return tenantGroupMap;
    } catch (error: unknown) {
      const err = error as Error;
      loggerService.error('Failed to build tenant-group mapping:', err.message);
      return new Map();
    }
  }

  async getApproverGroupForTenant(tenantId: string): Promise<string | null> {
    try {
      const tenantGroupMap = await this.getApproverGroupsByTenant();
      const groups = tenantGroupMap.get(tenantId);

      if (!groups || groups.length === 0) {
        loggerService.log(`ℹNo specific approver group found for tenant '${tenantId}', will use default approver role`);
        return null;
      }

      const selectedGroup = groups[0];
      loggerService.log(`Auto-selected group '${selectedGroup}' for tenant '${tenantId}'`);
      return selectedGroup;
    } catch (error: unknown) {
      const err = error as Error;
      loggerService.error(`Failed to get approver group for tenant ${tenantId}: ${err.message}`);
      return null;
    }
  }
}

export const keycloakService = new KeycloakService();
