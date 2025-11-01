// SPDX-License-Identifier: Apache-2.0
import type { FastifyRequest, FastifyReply } from 'fastify';
import { databaseService, loggerService } from '../index';
import type { ITenantRequest } from '../interface/ITenantRequest';
import type { AuthenticatedRequest } from '../interface/AuthenticatedRequest';
import type {
  ConfigStatus,
  WorkflowAction,
  SubmitForApprovalDto,
  ApprovalDto,
  RejectionDto,
  ChangeRequestDto,
  DeploymentDto,
  StatusTransitionDto,
} from '@tazama-lf/tcs-lib';
import { ConfigStatus as CS } from '@tazama-lf/tcs-lib';
import jwt from 'jsonwebtoken';

const VALID_TRANSITIONS: Record<ConfigStatus, ConfigStatus[]> = {
  [CS.IN_PROGRESS]: [CS.UNDER_REVIEW],
  [CS.UNDER_REVIEW]: [CS.APPROVED, CS.REJECTED, CS.CHANGES_REQUESTED],
  [CS.APPROVED]: [CS.DEPLOYED],
  [CS.DEPLOYED]: [],
  [CS.REJECTED]: [CS.IN_PROGRESS],
  [CS.CHANGES_REQUESTED]: [CS.IN_PROGRESS],
};

const EDITABLE_STATUSES: ConfigStatus[] = [CS.IN_PROGRESS, CS.CHANGES_REQUESTED];

function getUserEmailFromRequest(req: FastifyRequest): string | null {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      loggerService.warn('No Bearer token found in Authorization header');
      return null;
    }
    const [, token] = authHeader.split(' ');
    const decoded = jwt.decode(token) as { preferred_username?: string; email?: string };
    const email = decoded?.preferred_username ?? decoded?.email ?? null;

    loggerService.log('[Workflow] Extracted email from JWT:');
    loggerService.log(`   - preferred_username: ${decoded?.preferred_username ?? 'N/A'}`);
    loggerService.log(`   - email field: ${decoded?.email ?? 'N/A'}`);
    loggerService.log(`   - Final email: ${email ?? 'NOT FOUND'}`);

    return email;
  } catch (error) {
    loggerService.error(`Failed to extract email from JWT: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    const decoded = jwt.decode(token) as { name?: string; given_name?: string };
    return decoded?.name ?? decoded?.given_name ?? null;
  } catch {
    return null;
  }
}

async function getApproverGroupForTenant(tenantId: string): Promise<string | null> {
  try {
    const { autoDiscoveryCache } = await import('../services/auto-discovery-cache.service.js');

    const cachedGroup = autoDiscoveryCache.getCachedGroup(tenantId);
    if (cachedGroup) {
      return cachedGroup;
    }

    loggerService.log(` Auto-discovering approver group for tenant '${tenantId}'...`);

    const { keycloakService } = await import('../services/keycloak.service.js');
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
  type: 'submit' | 'changes_requested';
  configId: number;
  config: ConfigData;
  tenantId: string;
  requesterEmail: string;
  requesterName: string | null;
  comment?: string;
}

async function sendNotificationAsync(params: SendNotificationParams): Promise<void> {
  const { type, configId, config, tenantId, requesterEmail, requesterName, comment } = params;
  try {
    if (type === 'submit') {
      const { keycloakService } = await import('../services/keycloak.service.js');
      const { userEmailCache } = await import('../index.js');

      let approverEmails: string[] = [];
      const approverGroup = await getApproverGroupForTenant(tenantId);

      if (approverGroup && approverGroup !== '__none__') {
        loggerService.log(`📧 Looking up approvers for tenant '${tenantId}' from auto-discovered group '${approverGroup}'...`);

        const cachedApprovers = userEmailCache.getGroupApprovers(tenantId, approverGroup);

        if (cachedApprovers && cachedApprovers.length > 0) {
          approverEmails = cachedApprovers;
          loggerService.log(`Using cached approvers (${approverEmails.length}) for tenant '${tenantId}' group '${approverGroup}'`);
        } else {
          loggerService.log(`Cache miss - querying Keycloak for tenant '${tenantId}' group '${approverGroup}'...`);
          approverEmails = await keycloakService.getApproverEmailsByTenantAndGroup(tenantId, approverGroup);

          if (approverEmails.length > 0) {
            loggerService.log(`Found ${approverEmails.length} approver(s) in group '${approverGroup}' for tenant '${tenantId}'`);

            userEmailCache.cacheGroupApprovers(tenantId, approverGroup, approverEmails);

            loggerService.log('Approver emails:');
            for (const email of approverEmails) {
              loggerService.log(`   - ${email}`);
            }
          } else {
            loggerService.warn(`No approvers found in auto-discovered group '${approverGroup}' for tenant '${tenantId}'`);
            loggerService.warn('   Falling back to cached role-based approvers or default query');

            approverEmails = userEmailCache.getEmailsByRole(tenantId, 'approver');

            if (approverEmails.length === 0) {
              loggerService.log('   Trying default approver role query...');
              approverEmails = await keycloakService.getApproverEmails();
            }
          }
        }
      } else {
        loggerService.log("📧 No group configured - querying all approvers using default 'approver' role...");
        approverEmails = await keycloakService.getApproverEmails();
      }

      if (approverEmails.length === 0) {
        loggerService.warn(`No approver emails found in Keycloak for tenant ${tenantId}`);
        loggerService.warn("   Make sure users with 'approver' role exist in Keycloak realm");
        loggerService.warn('   Or configure TENANT_APPROVER_GROUPS environment variable');
        return;
      }

      loggerService.log(`Sending approval notification to ${approverEmails.length} approver(s): ${approverEmails.join(', ')}`);

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
        loggerService.log(`   Recipients: ${approverEmails.join(', ')}`);

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
    } else if (type === 'changes_requested') {
      const editorEmail = await databaseService.getConfigEditorEmail(configId, tenantId);

      if (!editorEmail) {
        loggerService.warn(`Could not find editor email for config ${configId}`);
        return;
      }

      loggerService.log(`Sending changes requested notification to editor: ${editorEmail}`);

      try {
        const axios = (await import('axios')).default;
        const connectionStudioUrl = process.env.CONNECTION_STUDIO_URL ?? 'http://localhost:3000';
        const notificationEndpoint = `${connectionStudioUrl}/notifications/changes-requested`;

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
          loggerService.log(`Changes requested email sent successfully to ${editorEmail}`);
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

    case 'request_changes':
      if (!hasApproverRole) {
        return {
          canPerform: false,
          message: 'Only approvers can request changes',
        };
      }
      if (currentStatus !== CS.UNDER_REVIEW) {
        return {
          canPerform: false,
          message: 'Can only request changes for configurations in UNDER_REVIEW status',
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
      if (currentStatus !== CS.APPROVED) {
        return {
          canPerform: false,
          message: 'Can only deploy configurations in APPROVED status',
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
      if (![CS.REJECTED, CS.CHANGES_REQUESTED].includes(currentStatus)) {
        return {
          canPerform: false,
          message: 'Can only return rejected or change-requested configurations to progress',
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
      message: `Cannot edit configuration in ${currentStatus} status. Only configurations in IN_PROGRESS or CHANGES_REQUESTED status can be edited.`,
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
    if (userEmail) {
      await databaseService.logAction({
        action: 'submit_for_approval',
        entityType: 'config',
        entityId: id,
        actor: dto.userId,
        actorEmail: userEmail,
        tenantId,
        details: `Configuration submitted for approval${dto.comment ? `: ${dto.comment}` : ''}`,
        newValues: { status: newStatus },
      });
    }

    const userName = getUserNameFromRequest(req);
    if (userEmail) {
      sendNotificationAsync({
        type: 'submit',
        configId: Number(id),
        config: updatedConfig!,
        tenantId,
        requesterEmail: userEmail,
        requesterName: userName,
        comment: dto.comment,
      }).catch((err: unknown) => {
        const error = err as Error;
        loggerService.error(`Notification error: ${error.message}`);
      });
    }

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
    });

    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    loggerService.log(`Config ${id} rejected. Status: ${currentStatus} → ${newStatus} - Reason: ${dto.rejectionReason}`);

    reply.status(200).send({
      success: true,
      message: 'Configuration rejected successfully',
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

export const requestChangesHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle request changes request');

  try {
    const { id } = req.params as { id: string };
    const { tenantId } = req as ITenantRequest;
    const dto = req.body as ChangeRequestDto;

    const authReq = req as AuthenticatedRequest;
    const userClaims = authReq.user?.claims ?? [];

    loggerService.log(`Requesting changes for config ${id} by user ${dto.userId}`);
    loggerService.log(` Changes requested: ${dto.requestedChanges}`);

    if (!dto.requestedChanges?.trim()) {
      reply.status(400).send({
        success: false,
        message: 'Requested changes description is required',
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
    const newStatus: ConfigStatus = CS.CHANGES_REQUESTED;
    const action: WorkflowAction = 'request_changes';

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
      comments: dto.requestedChanges,
    });

    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    const userEmail = getUserEmailFromRequest(req);
    if (userEmail) {
      await databaseService.logAction({
        action: 'request_changes',
        entityType: 'config',
        entityId: id,
        actor: dto.userId,
        actorEmail: userEmail,
        tenantId,
        details: `Changes requested: ${dto.requestedChanges}`,
        newValues: { status: newStatus, comments: dto.requestedChanges },
      });
    }

    const userName = getUserNameFromRequest(req);
    if (userEmail) {
      loggerService.log(' Preparing email notification for changes requested:');
      loggerService.log(`   - From: ${userName ?? userEmail} (approver)`);
      loggerService.log(`   - To: Editor of config ${id}`);
      loggerService.log(`   - Subject: Changes Requested for Config ${id}`);
      loggerService.log(`   - Message: ${dto.requestedChanges}`);
      loggerService.log('   - Connection: admin-service → connection-studio → NotificationService → SMTP');

      sendNotificationAsync({
        type: 'changes_requested',
        configId: Number(id),
        config: updatedConfig!,
        tenantId,
        requesterEmail: userEmail,
        requesterName: userName,
        comment: dto.requestedChanges,
      }).catch((err: unknown) => {
        const error = err as Error;
        loggerService.error(`Notification error: ${error.message}`);
      });
    }

    loggerService.log(
      `Changes requested for config ${id}. Status: ${currentStatus} → ${newStatus} - Comments saved: ${dto.requestedChanges}`,
    );

    reply.status(200).send({
      success: true,
      message: 'Changes requested successfully',
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`Failed to request changes: ${error.message}`, error.stack ?? '');
    reply.status(500).send({
      success: false,
      message: `Failed to request changes: ${error.message}`,
    });
  } finally {
    loggerService.log('End - Handle request changes request');
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
    });

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
    const canRequestChanges = validateUserPermissions(userClaims, currentStatus, 'request_changes').canPerform;
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
        canRequestChanges,
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
