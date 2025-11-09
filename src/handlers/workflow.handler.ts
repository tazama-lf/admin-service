// SPDX-License-Identifier: Apache-2.0
import type { FastifyRequest, FastifyReply } from 'fastify';
import { databaseService, loggerService } from '../index';
import type { ITenantRequest } from '../interface/ITenantRequest';
import type { AuthenticatedRequest } from '../interface/AuthenticatedRequest';
import { keycloakService } from '../services/keycloak.service.js';
import { userEmailCache } from '../index.js';
import type {
  ConfigStatus,
  WorkflowAction,
  SubmitForApprovalDto,
  ApprovalDto,
  RejectionDto,
  DeploymentDto,
  StatusTransitionDto,
} from '@tazama-lf/tcs-lib';
import { ConfigStatus as CS } from '@tazama-lf/tcs-lib';
import jwt from 'jsonwebtoken';

const VALID_TRANSITIONS: Record<ConfigStatus, ConfigStatus[]> = {
  [CS.IN_PROGRESS]: [CS.UNDER_REVIEW],
  [CS.ON_HOLD]: [CS.IN_PROGRESS],
  [CS.UNDER_REVIEW]: [CS.APPROVED, CS.REJECTED],
  [CS.APPROVED]: [CS.EXPORTED, CS.DEPLOYED],
  [CS.EXPORTED]: [CS.READY_FOR_DEPLOYMENT, CS.DEPLOYED],
  [CS.READY_FOR_DEPLOYMENT]: [CS.DEPLOYED],
  [CS.DEPLOYED]: [],
  [CS.REJECTED]: [CS.IN_PROGRESS],
};

const EDITABLE_STATUSES: ConfigStatus[] = [CS.IN_PROGRESS, CS.REJECTED];

function getUserEmailFromRequest(req: FastifyRequest): string | null {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      loggerService.warn('No Bearer token found in Authorization header');
      return null;
    }
    const [, token] = authHeader.split(' ');

    const decoded = jwt.decode(token) as { tokenString?: string; preferred_username?: string; email?: string } | null;
    if (!decoded) {
      return null;
    }

    let actualToken: { preferred_username?: string; email?: string; name?: string; given_name?: string } = decoded;
    if (decoded.tokenString) {
      const nestedToken = jwt.decode(decoded.tokenString) as { preferred_username?: string; email?: string } | null;
      if (nestedToken) {
        actualToken = nestedToken;
      }
    }

    const email = actualToken.preferred_username ?? actualToken.email ?? null;

    loggerService.log('[Workflow] User authenticated successfully');

    return email;
  } catch (error) {
    loggerService.error(`Failed to extract user from JWT: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

function getUserNameFromRequest(req: FastifyRequest): string | null {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }
    const [, token] = authHeader.split(' ');

    const decoded = jwt.decode(token) as { tokenString?: string; name?: string; given_name?: string; preferred_username?: string } | null;
    if (!decoded) {
      return null;
    }

    let actualToken: { name?: string; given_name?: string; preferred_username?: string } = decoded;
    if (decoded.tokenString) {
      const nestedToken = jwt.decode(decoded.tokenString) as { name?: string; given_name?: string; preferred_username?: string } | null;
      if (nestedToken) {
        actualToken = nestedToken;
      }
    }

    return actualToken.name ?? actualToken.given_name ?? actualToken.preferred_username ?? null;
  } catch {
    return null;
  }
}

function getTenantGroupName(tenantId: string): string | null {
  const mapping = process.env.TENANT_GROUP_MAPPING;
  if (mapping) {
    const pairs = mapping.split(',');
    for (const pair of pairs) {
      const [id, groupName] = pair.split(':');
      if (id === tenantId) {
        return groupName;
      }
    }
  }

  const match = /tenant-(\d+)/i.exec(tenantId);
  if (match) {
    const [, num] = match;
    return `Tenant_${num}`;
  }

  return null;
}

async function getApproverGroupForTenant(tenantId: string): Promise<string | null> {
  try {
    const { autoDiscoveryCache } = await import('../services/auto-discovery-cache.service.js');

    const cachedGroup = autoDiscoveryCache.getCachedGroup(tenantId);
    if (cachedGroup) {
      return cachedGroup;
    }

    loggerService.log(` Auto-discovering approver group for tenant '${tenantId}'...`);

    const conventionGroupName = getTenantGroupName(tenantId);
    if (conventionGroupName) {
      loggerService.log(`   Using convention-based mapping: '${tenantId}' → '${conventionGroupName}'`);

      const approverGroups = await keycloakService.getApproverGroups();

      if (approverGroups.includes(conventionGroupName)) {
        loggerService.log(`  Confirmed: Group '${conventionGroupName}' has approvers`);
        autoDiscoveryCache.cacheGroup(tenantId, conventionGroupName);
        return conventionGroupName;
      } else {
        loggerService.warn(`  Group '${conventionGroupName}' exists but has no approvers`);
      }
    }

    const approverGroup = await keycloakService.getApproverGroupForTenant(tenantId);

    if (approverGroup) {
      loggerService.log(`Auto-discovered approver group '${approverGroup}' for tenant '${tenantId}'`);

      autoDiscoveryCache.cacheGroup(tenantId, approverGroup);

      return approverGroup;
    } else {
      loggerService.log(`ℹNo specific approver group found for tenant '${tenantId}', using default approver role`);

      autoDiscoveryCache.cacheGroup(tenantId, '__none__', 5 * 60 * 1000);

      return null;
    }
  } catch (error) {
    loggerService.error(
      `Failed to auto-discover approver group for tenant '${tenantId}': ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    loggerService.log(`Falling back to default approver role for tenant '${tenantId}'`);
    return null;
  }
}

interface ConfigData {
  transactionType?: string;
  version?: string;
}

interface SendNotificationParams {
  type: 'submit' | 'approve' | 'reject';
  configId: number;
  config: ConfigData;
  tenantId: string;
  requesterEmail: string;
  requesterName: string | null;
  comment?: string;
}

async function getApproverEmails(tenantId: string, approverGroup: string | null): Promise<string[]> {
  if (!approverGroup || approverGroup === '__none__') {
    loggerService.log("No group configured - querying all approvers using default 'approver' role...");
    return await keycloakService.getApproverEmails();
  }

  loggerService.log(`Looking up approvers for tenant '${tenantId}' from auto-discovered group '${approverGroup}'...`);

  const cachedApprovers = userEmailCache.getGroupApprovers(tenantId, approverGroup);
  if (cachedApprovers && cachedApprovers.length > 0) {
    loggerService.log(`Using cached approvers (${cachedApprovers.length}) for tenant '${tenantId}' group '${approverGroup}'`);
    return cachedApprovers;
  }

  loggerService.log(`Cache miss - querying Keycloak for tenant '${tenantId}' group '${approverGroup}'...`);
  const approverEmails = await keycloakService.getApproverEmailsByTenantAndGroup(tenantId, approverGroup);

  if (approverEmails.length > 0) {
    loggerService.log(`Found ${approverEmails.length} approver(s) in group '${approverGroup}' for tenant '${tenantId}'`);
    userEmailCache.cacheGroupApprovers(tenantId, approverGroup, approverEmails);
    loggerService.log('Approver emails:');
    for (const email of approverEmails) {
      loggerService.log(`   - ${email}`);
    }
    return approverEmails;
  }

  loggerService.warn(`No approvers found in auto-discovered group '${approverGroup}' for tenant '${tenantId}'`);
  loggerService.warn('   Falling back to cached role-based approvers or default query');

  const cachedRoleApprovers = userEmailCache.getEmailsByRole(tenantId, 'approver');
  if (cachedRoleApprovers.length > 0) {
    return cachedRoleApprovers;
  }

  loggerService.log('   Trying default approver role query...');
  return await keycloakService.getApproverEmails();
}

interface ApprovalNotificationData {
  approverEmails: string[];
  configId: number;
  config: ConfigData;
  requesterName: string | null;
  requesterEmail: string;
  comment: string | undefined;
  tenantId: string;
}

async function sendApprovalNotification(data: ApprovalNotificationData): Promise<void> {
  const { approverEmails, configId, config, requesterName, requesterEmail, comment, tenantId } = data;
  try {
    const axios = (await import('axios')).default;
    const connectionStudioUrl = process.env.CONNECTION_STUDIO_URL ?? 'http://localhost:3000';
    const notificationEndpoint = `${connectionStudioUrl}/notifications/submit-for-approval`;

    const emailContext = {
      configId,
      configName: config.transactionType ?? 'Configuration',
      version: config.version ?? '1.0',
      transactionType: config.transactionType,
      requesterName,
      requesterEmail,
      comment,
      tenantId,
    };

    loggerService.log('Calling connection-studio notification service...');
    loggerService.log(`   Endpoint: ${notificationEndpoint}`);
    loggerService.log(`   Recipients count: ${approverEmails.length}`); // Don't log email addresses (PII)

    const response = await axios.post(
      notificationEndpoint,
      { approverEmails, context: emailContext },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      },
    );

    const responseData = response.data as { success: boolean; recipients?: number; message?: string };
    if (responseData.success) {
      loggerService.log(`Email notification sent successfully to ${responseData.recipients ?? 0} approver(s)`);
    } else {
      loggerService.warn(` ${responseData.message ?? 'Unknown error'}`);
    }
  } catch (error) {
    loggerService.error(` Failed to call notification service: ${error instanceof Error ? error.message : 'Unknown error'}`);
    loggerService.warn('   Email notification not sent - check if connection-studio is running');
  }
}

async function sendNotificationAsync(params: SendNotificationParams): Promise<void> {
  const { type, configId, config, tenantId, requesterEmail, requesterName, comment } = params;
  try {
    if (type === 'submit') {
      const approverGroup = await getApproverGroupForTenant(tenantId);
      const approverEmails = await getApproverEmails(tenantId, approverGroup);

      if (approverEmails.length === 0) {
        loggerService.warn(`No approver emails found in Keycloak for tenant ${tenantId}`);
        // eslint-disable-next-line @stylistic/quotes -- Double quotes needed for nested single quotes in 'approver' role text
        loggerService.warn("   Make sure users with 'approver' role exist in Keycloak realm");
        loggerService.warn('   Or configure TENANT_APPROVER_GROUPS environment variable');
        return;
      }

      loggerService.log(`Sending approval notification to ${approverEmails.length} approver(s): ${approverEmails.join(', ')}`);
      await sendApprovalNotification({
        approverEmails,
        configId,
        config,
        requesterName,
        requesterEmail,
        comment,
        tenantId,
      });
    } else {
      const editorEmail = await databaseService.getConfigEditorEmail(configId, tenantId);

      if (!editorEmail) {
        loggerService.warn(`Could not find editor email for config ${configId}`);
        return;
      }

      const notificationType = type === 'reject' ? 'rejection' : 'approval';
      loggerService.log(`Sending ${notificationType} notification to editor: ${editorEmail}`);

      try {
        const axios = (await import('axios')).default;
        const connectionStudioUrl = process.env.CONNECTION_STUDIO_URL ?? 'http://localhost:3000';
        const notificationEndpoint = `${connectionStudioUrl}/notifications/${notificationType}`;

        const emailContext = {
          configId,
          configName: config.transactionType ?? 'Configuration',
          version: config.version ?? '1.0',
          transactionType: config.transactionType,
          requesterName,
          requesterEmail,
          comment,
          tenantId,
        };

        loggerService.log('Calling connection-studio notification service...');
        loggerService.log(`   Endpoint: ${notificationEndpoint}`);
        loggerService.log(`   Recipient: ${editorEmail}`);

        const response = await axios.post(
          notificationEndpoint,
          { editorEmail, context: emailContext },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
          },
        );

        const responseData = response.data as { success: boolean; message?: string };
        if (responseData.success) {
          loggerService.log(`${notificationType === 'rejection' ? 'Rejection' : 'Approval'} email sent successfully to editor`); // Don't log email (PII)
        } else {
          loggerService.warn(responseData.message ?? 'Unknown error');
        }
      } catch (error) {
        loggerService.error(`Failed to call notification service: ${error instanceof Error ? error.message : 'Unknown error'}`);
        loggerService.warn('   Email notification not sent - check if connection-studio is running');
      }
    }
  } catch (error) {
    loggerService.error(`Failed to send notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function validateStatusTransition(fromStatus: ConfigStatus, toStatus: ConfigStatus): { isValid: boolean; message?: string } {
  const allowedTransitions = VALID_TRANSITIONS[fromStatus];

  if (allowedTransitions.length === 0 || !allowedTransitions.includes(toStatus)) {
    return {
      isValid: false,
      message: `Cannot transition from ${fromStatus} to ${toStatus}. Allowed transitions: ${allowedTransitions.join(', ') || 'none'}`,
    };
  }

  return { isValid: true };
}

function validateUserPermissions(
  userClaims: string[],
  currentStatus: ConfigStatus,
  action: WorkflowAction,
): { canPerform: boolean; message?: string } {
  const hasEditorRole = userClaims.includes('editor');
  const hasApproverRole = userClaims.includes('approver');
  const hasPublisherRole = userClaims.includes('publisher');
  const hasExporterRole = userClaims.includes('exporter');

  switch (action) {
    case 'submit_for_approval':
      if (!hasEditorRole) {
        return {
          canPerform: false,
          message: 'Only editors can submit configurations for approval',
        };
      }
      if (currentStatus !== CS.IN_PROGRESS) {
        return {
          canPerform: false,
          message: 'Can only submit configurations in IN_PROGRESS status',
        };
      }
      break;

    case 'approve':
      if (!hasApproverRole) {
        return {
          canPerform: false,
          message: 'Only approvers can approve configurations',
        };
      }
      if (currentStatus !== CS.UNDER_REVIEW) {
        return {
          canPerform: false,
          message: 'Can only approve configurations in UNDER_REVIEW status',
        };
      }
      break;

    case 'reject':
      if (!hasApproverRole) {
        return {
          canPerform: false,
          message: 'Only approvers can reject configurations',
        };
      }
      if (currentStatus !== CS.UNDER_REVIEW) {
        return {
          canPerform: false,
          message: 'Can only reject configurations in UNDER_REVIEW status',
        };
      }
      break;

    case 'deploy':
      if (!hasPublisherRole) {
        return {
          canPerform: false,
          message: 'Only publishers can deploy configurations',
        };
      }
      if (currentStatus !== CS.APPROVED && currentStatus !== CS.EXPORTED && currentStatus !== CS.READY_FOR_DEPLOYMENT) {
        return {
          canPerform: false,
          message: 'Can only deploy configurations in APPROVED, EXPORTED, or READY_FOR_DEPLOYMENT status',
        };
      }
      break;

    case 'return_to_progress':
      if (!hasEditorRole) {
        return {
          canPerform: false,
          message: 'Only editors can return configurations to progress',
        };
      }
      if (currentStatus !== CS.REJECTED) {
        return {
          canPerform: false,
          message: 'Can only return rejected configurations to progress',
        };
      }
      break;

    case 'export':
      if (!hasExporterRole) {
        return {
          canPerform: false,
          message: 'Only exporters can export configurations',
        };
      }
      if (currentStatus !== CS.APPROVED) {
        return {
          canPerform: false,
          message: 'Can only export configurations in APPROVED status',
        };
      }
      break;
  }

  return { canPerform: true };
}

function canEditConfig(currentStatus: ConfigStatus): { canEdit: boolean; message?: string } {
  if (!EDITABLE_STATUSES.includes(currentStatus)) {
    return {
      canEdit: false,
      message: `Cannot edit configuration in ${currentStatus} status. Only configurations in IN_PROGRESS or REJECTED status can be edited.`,
    };
  }
  return { canEdit: true };
}

export const submitForApprovalHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle submit for approval request');

  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const dto = req.body as SubmitForApprovalDto;

    const authReq = req as AuthenticatedRequest;
    const userClaims = authReq.user?.claims ?? [];

    loggerService.log(`Submitting config ${id} for approval by user ${dto.userId}`);

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      reply.status(404).send({
        success: false,
        message: 'Config not found',
      });
      return;
    }

    const currentStatus = config.status!;
    const newStatus: ConfigStatus = CS.UNDER_REVIEW;
    const action: WorkflowAction = 'submit_for_approval';

    const permissionValidation = validateUserPermissions(userClaims, currentStatus, action);
    if (!permissionValidation.canPerform) {
      reply.status(403).send({
        success: false,
        message: permissionValidation.message,
      });
      return;
    }

    const transitionValidation = validateStatusTransition(currentStatus, newStatus);
    if (!transitionValidation.isValid) {
      reply.status(400).send({
        success: false,
        message: transitionValidation.message,
      });
      return;
    }

    await databaseService.updateConfig(Number(id), tenantId, {
      status: newStatus,
    });

    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    const userEmail = getUserEmailFromRequest(req);
    const userName = getUserNameFromRequest(req);

    loggerService.log('Extracted user details from request:');
    loggerService.log(`   - Email: ${userEmail ?? 'NOT FOUND'}`);
    loggerService.log(`   - Name: ${userName ?? 'NOT FOUND'}`);
    loggerService.log(`   - DTO userId: ${dto.userId ?? 'NOT PROVIDED'}`);

    if (userEmail) {
      try {
        await databaseService.logAction({
          action: 'submit_for_approval',
          entityType: 'config',
          entityId: id,
          actor: dto.userId ?? userEmail,
          actorEmail: userEmail,
          tenantId,
          endpointName: config.endpointPath || undefined,
          version: config.version || undefined,
          details: `Configuration submitted for approval${dto.comment ? `: ${dto.comment}` : ''}`,
          newValues: { status: newStatus },
          severity: 'MEDIUM',
          status: 'SUCCESS',
        });
      } catch (auditError: unknown) {
        const err = auditError as Error;
        loggerService.error(`Failed to log audit entry: ${err.message}`);
      }
    }

    const editorEmail = await databaseService.getConfigEditorEmail(Number(id), tenantId);

    loggerService.log(`Initiating notification send for config ${id}...`);
    loggerService.log(`   - Editor email (config creator): ${editorEmail ?? 'NOT FOUND'}`);
    loggerService.log(`   - Requester email (who clicked submit): ${userEmail ?? 'NOT FOUND'}`);

    const notificationPromise = sendNotificationAsync({
      type: 'submit',
      configId: Number(id),
      config: updatedConfig!,
      tenantId,
      requesterEmail: editorEmail ?? userEmail ?? 'system@unknown',
      requesterName: userName ?? 'System User',
      comment: dto.comment,
    });
    notificationPromise.catch((err: unknown) => {
      const error = err as Error;
      loggerService.error(`Notification error: ${error.message}`);
      loggerService.error(`   Stack: ${error.stack}`);
    });

    loggerService.log(
      `Config ${id} submitted for approval. Status: ${currentStatus} → ${newStatus}${dto.comment ? ` - Comment: ${dto.comment}` : ''}`,
    );

    reply.status(200).send({
      success: true,
      message: 'Configuration submitted for approval successfully',
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`Failed to submit for approval: ${error.message}`, error.stack ?? '');
    reply.status(500).send({
      success: false,
      message: `Failed to submit for approval: ${error.message}`,
    });
  } finally {
    loggerService.log('End - Handle submit for approval request');
  }
};

export const approveConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle approve config request');

  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const dto = req.body as ApprovalDto;

    const authReq = req as AuthenticatedRequest;
    const userClaims = authReq.user?.claims ?? [];

    loggerService.log(`Approving config ${id} by user ${dto.userId}`);

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      reply.status(404).send({
        success: false,
        message: 'Config not found',
      });
      return;
    }

    const currentStatus = config.status!;
    const newStatus: ConfigStatus = CS.APPROVED;
    const action: WorkflowAction = 'approve';

    const permissionValidation = validateUserPermissions(userClaims, currentStatus, action);
    if (!permissionValidation.canPerform) {
      reply.status(403).send({
        success: false,
        message: permissionValidation.message,
      });
      return;
    }

    const transitionValidation = validateStatusTransition(currentStatus, newStatus);
    if (!transitionValidation.isValid) {
      reply.status(400).send({
        success: false,
        message: transitionValidation.message,
      });
      return;
    }

    await databaseService.updateConfig(Number(id), tenantId, {
      status: newStatus,
    });

    try {
      const transactionType = config.transactionType.replace(/[^a-zA-Z0-9_]/g, '_');
      const tableName = transactionType;

      const createTableQuery = `
CREATE TABLE IF NOT EXISTS "${tableName}" (
  id SERIAL PRIMARY KEY,
  document JSONB NOT NULL,
);`;

      loggerService.log(` Executing CREATE TABLE query for config ${id}:`);
      loggerService.log(createTableQuery);

      const client = await databaseService.getClient();
      try {
        await client.query(createTableQuery);
        loggerService.log(` Successfully created table: ${tableName}`);
      } finally {
        client.release();
      }

      loggerService.log(` CREATE TABLE query stored in config ${id}`);
    } catch (tableError: unknown) {
      const error = tableError as Error;
      loggerService.error(` Failed to create table for config ${id}: ${error.message}`);
    }

    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    loggerService.log(
      `Config ${id} approved. Status: ${currentStatus} → ${newStatus}${(dto.comment ?? dto.approvalNotes ?? '') ? ` - Notes: ${dto.comment ?? dto.approvalNotes ?? ''}` : ''}`,
    );

    reply.status(200).send({
      success: true,
      message: 'Configuration approved successfully',
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`Failed to approve config: ${error.message}`, error.stack ?? '');
    reply.status(500).send({
      success: false,
      message: `Failed to approve config: ${error.message}`,
    });
  } finally {
    loggerService.log('End - Handle approve config request');
  }
};

export const rejectConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle reject config request');

  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const dto = req.body as RejectionDto;

    const authReq = req as AuthenticatedRequest;
    const userClaims = authReq.user?.claims ?? [];

    loggerService.log(`Rejecting config ${id} by user ${dto.userId}`);

    if (!dto.rejectionReason?.trim()) {
      reply.status(400).send({
        success: false,
        message: 'Rejection reason is required',
      });
      return;
    }

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      reply.status(404).send({
        success: false,
        message: 'Config not found',
      });
      return;
    }

    const currentStatus = config.status!;
    const newStatus: ConfigStatus = CS.REJECTED;
    const action: WorkflowAction = 'reject';

    const permissionValidation = validateUserPermissions(userClaims, currentStatus, action);
    if (!permissionValidation.canPerform) {
      reply.status(403).send({
        success: false,
        message: permissionValidation.message,
      });
      return;
    }

    const transitionValidation = validateStatusTransition(currentStatus, newStatus);
    if (!transitionValidation.isValid) {
      reply.status(400).send({
        success: false,
        message: transitionValidation.message,
      });
      return;
    }

    await databaseService.updateConfig(Number(id), tenantId, {
      status: newStatus,
      comments: dto.rejectionReason,
    });

    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    const userEmail = getUserEmailFromRequest(req);
    const userName = getUserNameFromRequest(req);

    if (userEmail) {
      try {
        await databaseService.logAction({
          action: 'reject',
          entityType: 'config',
          entityId: id,
          actor: dto.userId,
          actorEmail: userEmail,
          tenantId,
          endpointName: config.endpointPath || undefined,
          version: config.version ? Number(config.version) : undefined,
          details: `Configuration rejected: ${dto.rejectionReason}`,
          oldValues: { status: currentStatus },
          newValues: { status: newStatus, comments: dto.rejectionReason },
          severity: 'HIGH',
          status: 'SUCCESS',
        });
      } catch (auditError: unknown) {
        const err = auditError as Error;
        loggerService.error(`Failed to log audit entry: ${err.message}`);
      }
    }

    if (userEmail) {
      loggerService.log('Preparing email notification for rejection:');
      loggerService.log(`   - From: ${userName ?? userEmail} (approver)`);
      loggerService.log(`   - To: Editor of config ${id}`);
      loggerService.log(`   - Subject: Configuration Rejected - Config ${id}`);
      loggerService.log(`   - Message: ${dto.rejectionReason}`);
      loggerService.log('   - Connection: admin-service → connection-studio → NotificationService → SMTP');

      const notificationPromise = sendNotificationAsync({
        type: 'reject',
        configId: Number(id),
        config: updatedConfig!,
        tenantId,
        requesterEmail: userEmail,
        requesterName: userName,
        comment: dto.rejectionReason,
      });
      notificationPromise.catch((err: unknown) => {
        const error = err as Error;
        loggerService.error(`Notification error: ${error.message}`);
      });
    }

    loggerService.log(`Config ${id} rejected. Status: ${currentStatus} → ${newStatus} - Reason: ${dto.rejectionReason}`);

    reply.status(200).send({
      success: true,
      message: 'Configuration rejected successfully. Editor has been notified.',
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`Failed to reject config: ${error.message}`, error.stack ?? '');
    reply.status(500).send({
      success: false,
      message: `Failed to reject config: ${error.message}`,
    });
  } finally {
    loggerService.log('End - Handle reject config request');
  }
};

export const deployConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle deploy config request');

  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const dto = req.body as DeploymentDto;

    const authReq = req as AuthenticatedRequest;
    const userClaims = authReq.user?.claims ?? [];

    loggerService.log(`Deploying config ${id} by user ${dto.userId}`);

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      reply.status(404).send({
        success: false,
        message: 'Config not found',
      });
      return;
    }

    const currentStatus = config.status!;
    const newStatus: ConfigStatus = CS.DEPLOYED;
    const action: WorkflowAction = 'deploy';

    const permissionValidation = validateUserPermissions(userClaims, currentStatus, action);
    if (!permissionValidation.canPerform) {
      reply.status(403).send({
        success: false,
        message: permissionValidation.message,
      });
      return;
    }

    const transitionValidation = validateStatusTransition(currentStatus, newStatus);
    if (!transitionValidation.isValid) {
      reply.status(400).send({
        success: false,
        message: transitionValidation.message,
      });
      return;
    }

    await databaseService.updateConfig(Number(id), tenantId, {
      status: newStatus,
      publishing_status: 'active',
    });

    try {
      const transactionType = config.transactionType.replace(/[^a-zA-Z0-9_]/g, '_');
      const tableName = transactionType;
      const createTableQuery = `
CREATE TABLE IF NOT EXISTS "${tableName}" (
  id SERIAL PRIMARY KEY,
  document JSONB NOT NULL,
);`;

      loggerService.log(` Executing CREATE TABLE query for config ${id} on publish:`);
      loggerService.log(createTableQuery);

      const client = await databaseService.getClient();
      try {
        await client.query(createTableQuery);
        loggerService.log(`Successfully created table on publish: ${tableName}`);
      } finally {
        client.release();
      }
    } catch (tableError: unknown) {
      const error = tableError as Error;
      loggerService.error(`Failed to create table for config ${id} on publish: ${error.message}`);
    }

    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    loggerService.log(
      `Config ${id} deployed. Status: ${currentStatus} → ${newStatus} (FINAL STATE)${dto.deploymentNotes ? ` - Notes: ${dto.deploymentNotes}` : ''}${dto.deploymentEnvironment ? ` - Environment: ${dto.deploymentEnvironment}` : ''}`,
    );

    reply.status(200).send({
      success: true,
      message: 'Configuration deployed successfully. This configuration is now read-only.',
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`Failed to deploy config: ${error.message}`, error.stack ?? '');
    reply.status(500).send({
      success: false,
      message: `Failed to deploy config: ${error.message}`,
    });
  } finally {
    loggerService.log('End - Handle deploy config request');
  }
};
export const exportConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle export config request');
  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const dto = req.body as StatusTransitionDto;
    const authReq = req as AuthenticatedRequest;
    const userClaims = authReq.user?.claims ?? [];
    loggerService.log(`Exporting config ${id} by user ${dto.userId}`);
    const config = await databaseService.findConfigById(Number(id), tenantId);
    if (!config) {
      reply.status(404).send({
        success: false,
        message: 'Config not found',
      });
      return;
    }
    const currentStatus = config.status!;
    const newStatus: ConfigStatus = CS.EXPORTED;
    const action: WorkflowAction = 'export';
    const permissionValidation = validateUserPermissions(userClaims, currentStatus, action);
    if (!permissionValidation.canPerform) {
      reply.status(403).send({
        success: false,
        message: permissionValidation.message,
      });
      return;
    }
    const transitionValidation = validateStatusTransition(currentStatus, newStatus);
    if (!transitionValidation.isValid) {
      reply.status(400).send({
        success: false,
        message: transitionValidation.message,
      });
      return;
    }
    await databaseService.updateConfig(Number(id), tenantId, {
      status: newStatus,
    });
    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);
    loggerService.log(`Config ${id} exported. Status: ${currentStatus} → ${newStatus}${dto.comment ? ` - Comment: ${dto.comment}` : ''}`);
    reply.status(200).send({
      success: true,
      message: 'Configuration exported successfully. Ready for publishing.',
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`Failed to export config: ${error.message}`, error.stack ?? '');
    reply.status(500).send({
      success: false,
      message: `Failed to export config: ${error.message}`,
    });
  } finally {
    loggerService.log('End - Handle export config request');
  }
};

export const returnToProgressHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle return to progress request');

  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const dto = req.body as StatusTransitionDto;

    const authReq = req as AuthenticatedRequest;
    const userClaims = authReq.user?.claims ?? [];

    loggerService.log(`Returning config ${id} to progress by user ${dto.userId}`);

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      reply.status(404).send({
        success: false,
        message: 'Config not found',
      });
      return;
    }

    const currentStatus = config.status!;
    const newStatus: ConfigStatus = CS.IN_PROGRESS;
    const action: WorkflowAction = 'return_to_progress';

    const permissionValidation = validateUserPermissions(userClaims, currentStatus, action);
    if (!permissionValidation.canPerform) {
      reply.status(403).send({
        success: false,
        message: permissionValidation.message,
      });
      return;
    }

    const transitionValidation = validateStatusTransition(currentStatus, newStatus);
    if (!transitionValidation.isValid) {
      reply.status(400).send({
        success: false,
        message: transitionValidation.message,
      });
      return;
    }

    await databaseService.updateConfig(Number(id), tenantId, {
      status: newStatus,
    });

    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    loggerService.log(
      `Config ${id} returned to progress. Status: ${currentStatus} → ${newStatus}${dto.comment ? ` - Comment: ${dto.comment}` : ''}`,
    );

    reply.status(200).send({
      success: true,
      message: 'Configuration returned to progress successfully',
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`Failed to return to progress: ${error.message}`, error.stack ?? '');
    reply.status(500).send({
      success: false,
      message: `Failed to return to progress: ${error.message}`,
    });
  } finally {
    loggerService.log('End - Handle return to progress request');
  }
};

export const getWorkflowStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle get workflow status request');

  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;

    const authReq = req as AuthenticatedRequest;
    const userClaims = authReq.user?.claims ?? [];

    loggerService.log(`Getting workflow status for config ${id}`);

    const config = await databaseService.findConfigById(Number(id), tenantId);

    if (!config) {
      reply.status(404).send({
        success: false,
        message: 'Config not found',
      });
      return;
    }

    const currentStatus = config.status!;
    const allowedTransitions = VALID_TRANSITIONS[currentStatus] ?? [];
    const editValidation = canEditConfig(currentStatus);

    const canSubmit = validateUserPermissions(userClaims, currentStatus, 'submit_for_approval').canPerform;
    const canApprove = validateUserPermissions(userClaims, currentStatus, 'approve').canPerform;
    const canReject = validateUserPermissions(userClaims, currentStatus, 'reject').canPerform;
    const canDeploy = validateUserPermissions(userClaims, currentStatus, 'deploy').canPerform;
    const canReturnToProgress = validateUserPermissions(userClaims, currentStatus, 'return_to_progress').canPerform;

    reply.status(200).send({
      success: true,
      configId: Number(id),
      currentStatus,
      allowedNextStatuses: allowedTransitions,
      canEdit: editValidation.canEdit,
      editMessage: editValidation.message,
      availableActions: {
        canSubmit,
        canApprove,
        canReject,
        canDeploy,
        canReturnToProgress,
      },
      userRoles: userClaims,
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`Failed to get workflow status: ${error.message}`, error.stack ?? '');
    reply.status(500).send({
      success: false,
      message: `Failed to get workflow status: ${error.message}`,
    });
  } finally {
    loggerService.log('End - Handle get workflow status request');
  }
};
