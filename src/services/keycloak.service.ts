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
      loggerService.log(`Searching for group '${groupName}' in realm '${this.config.realm}'`);

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

  /**
   * Get users from a subgroup within a parent group
   * @param parentGroupName - The name of the parent group (e.g., "rahim group")
   * @param subgroupName - The name of the subgroup (e.g., "approvers")
   * @returns Array of Keycloak users from the subgroup
   */
  async getUsersBySubgroup(parentGroupName: string, subgroupName: string): Promise<KeycloakUser[]> {
    try {
      const token = await this.getAdminToken();

      // First, find the parent group
      const groupsUrl = `${this.config.authUrl}/admin/realms/${this.config.realm}/groups?search=${encodeURIComponent(parentGroupName)}`;
      loggerService.log(`Searching for parent group '${parentGroupName}' in realm '${this.config.realm}'`);

      const groupsResponse = await axios.get(groupsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const groups = groupsResponse.data as Array<{
        id: string;
        name: string;
        subGroups?: Array<{ id: string; name: string; path: string }>;
      }>;

      if (groups.length === 0) {
        loggerService.warn(`Parent group '${parentGroupName}' not found in Keycloak realm '${this.config.realm}'`);
        return [];
      }

      const parentGroup = groups.find((g) => g.name.toLowerCase() === parentGroupName.toLowerCase());

      if (!parentGroup) {
        loggerService.warn(
          `Exact match for parent group '${parentGroupName}' not found. Available groups: ${groups.map((g) => g.name).join(', ')}`,
        );
        return [];
      }

      loggerService.log(`Found parent group '${parentGroup.name}' (ID: ${parentGroup.id})`);

      const childrenUrl = `${this.config.authUrl}/admin/realms/${this.config.realm}/groups/${parentGroup.id}/children`;
      const childrenResponse = await axios.get(childrenUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const children = childrenResponse.data as Array<{ id: string; name: string; path: string }>;

      if (children.length === 0) {
        loggerService.warn(` No child groups found in parent group '${parentGroupName}'`);
        return [];
      }

      loggerService.log(`Found ${children.length} child group(s) in '${parentGroupName}': ${children.map((sg) => sg.name).join(', ')}`);

      const normalizedSubgroupName = subgroupName.startsWith('/') ? subgroupName.substring(1) : subgroupName;
      const subgroup = children.find(
        (sg) =>
          sg.name.toLowerCase() === normalizedSubgroupName.toLowerCase() ||
          sg.path.toLowerCase().endsWith(`/${normalizedSubgroupName.toLowerCase()}`),
      );

      if (!subgroup) {
        loggerService.warn(
          `Subgroup '${subgroupName}' not found in parent group '${parentGroupName}'. Available subgroups: ${children.map((sg) => sg.name).join(', ')}`,
        );
        return [];
      }

      loggerService.log(`Found subgroup '${subgroup.name}' (ID: ${subgroup.id}, Path: ${subgroup.path})`);

      // Get members of the subgroup
      const membersUrl = `${this.config.authUrl}/admin/realms/${this.config.realm}/groups/${subgroup.id}/members`;
      const membersResponse = await axios.get(membersUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const members = membersResponse.data as KeycloakUser[];
      loggerService.log(`Found ${members.length} member(s) in subgroup '${parentGroupName}/${subgroupName}'`);

      members.forEach((member) => {
        loggerService.log(`  User: ${member.username} (Email: ${member.email || member.username}, Enabled: ${member.enabled})`);
      });

      return members;
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number; data?: unknown }; message?: string };
      if (axiosError.response?.status === 404) {
        loggerService.warn(` Group or subgroup not found: '${parentGroupName}/${subgroupName}' in Keycloak realm '${this.config.realm}'`);
        return [];
      }
      loggerService.error(`Failed to get users by subgroup '${parentGroupName}/${subgroupName}':`, {
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
      await this.getAdminToken();

      loggerService.log(`Finding approvers in subgroup: ${groupName}/approver`);

      const approverUsers = await this.getUsersBySubgroup(groupName, 'approver');

      if (approverUsers.length === 0) {
        loggerService.warn(` No users found in ${groupName}/approver subgroup`);
        return [];
      }

      loggerService.log(` Found ${approverUsers.length} approver(s) in ${groupName}/approver subgroup`);

      const enabledApprovers = approverUsers.filter((user) => user.enabled);

      if (enabledApprovers.length < approverUsers.length) {
        loggerService.log(` Filtered out ${approverUsers.length - enabledApprovers.length} disabled user(s)`);
      }

      enabledApprovers.forEach((user) => {
        loggerService.log(`  ${user.username} (enabled: ${user.enabled})`);
      });

      return enabledApprovers;
    } catch (error: unknown) {
      const err = error as Error;
      loggerService.error(' Failed to get approvers by tenant and group:', {
        tenantId,
        groupName,
        error: err.message,
      });
      throw error;
    }
  }

  async getApproverEmailsByTenantAndGroup(tenantId: string, groupName: string): Promise<string[]> {
    const approvers = await this.getApproversByTenantAndGroup(tenantId, groupName);

    const emails = approvers
      .filter((user) => user.enabled)
      .map((user) => {
        const email = user.email || user.username;
        loggerService.log(` Approver email: ${email} (from ${user.email ? 'email field' : 'username'})`);
        return email;
      })
      .filter((email) => email);

    loggerService.log(` Extracted ${emails.length} approver email(s) for tenant '${tenantId}' in group '${groupName}'`);
    return emails;
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

      const topLevelGroups = groupsResponse.data as Array<{ name: string; id: string }>;

      const approverGroups: string[] = [];

      loggerService.log(` Auto-discovering approver groups from ${topLevelGroups.length} top-level groups...`);
      loggerService.log('   Strategy: Check each group for /approver subgroup by fetching children');

      for (const group of topLevelGroups) {
        try {
          const groupDetailsUrl = `${this.config.authUrl}/admin/realms/${this.config.realm}/groups/${group.id}/children`;
          const childrenResponse = await axios.get(groupDetailsUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          const children = childrenResponse.data as Array<{ id: string; name: string; path: string }>;

          loggerService.log(`   Group '${group.name}': has ${children.length} child group(s)`);

          if (children.length > 0) {
            loggerService.log(`     Children: ${children.map((c) => c.name).join(', ')}`);
          }

          const approverChild = children.find((child) => child.name.toLowerCase() === 'approver');

          if (approverChild) {
            loggerService.log(`  Found approver subgroup in: ${group.name} (path: ${approverChild.path})`);

            const membersUrl = `${this.config.authUrl}/admin/realms/${this.config.realm}/groups/${approverChild.id}/members`;
            const membersResponse = await axios.get(membersUrl, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const members = membersResponse.data as KeycloakUser[];

            loggerService.log(`     └─ Contains ${members.length} approver(s)`);

            if (members.length > 0) {
              members.forEach((member) => {
                loggerService.log(`        ${member.username} (enabled: ${member.enabled})`);
              });

              approverGroups.push(group.name);
            } else {
              loggerService.warn(`   Approver subgroup ${approverChild.path} has no members`);
            }
          } else {
            loggerService.log(`  Skipping ${group.name} (no 'approver' child group)`);
          }
        } catch (error: unknown) {
          const err = error as Error;
          loggerService.warn(`   Failed to check group '${group.name}': ${err.message}`);
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
        loggerService.log(`No specific approver group found for tenant '${tenantId}', will use default approver role`);
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
