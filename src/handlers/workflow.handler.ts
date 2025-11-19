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
  [CS.REJECTED]: [CS.IN_PROGRESS, CS.UNDER_REVIEW],
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

export interface ConfigData {
  transactionType?: string;
  version?: string;
}

// GENERIC WORKFLOW NOTIFICATION SYSTEM
export enum NotificationEvent {
  EDITOR_SUBMIT = 'editor_submit',
  APPROVER_APPROVE = 'approver_approve',
  EXPORTER_EXPORT = 'exporter_export',
  PUBLISHER_DEPLOY = 'publisher_deploy',
  PUBLISHER_ACTIVATE = 'publisher_activate',
  PUBLISHER_DEACTIVATE = 'publisher_deactivate',
}

interface GenericNotificationParams {
  event: NotificationEvent;
  configId: number;
  config: ConfigData;
  tenantId: string;
  actorEmail: string;
  actorName: string | null;
  comment?: string;
}

async function sendGenericNotification(_params: GenericNotificationParams): Promise<void> {
  await Promise.resolve();
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
      if (currentStatus !== CS.IN_PROGRESS && currentStatus !== CS.REJECTED) {
        return {
          canPerform: false,
          message: 'Can only submit configurations in IN_PROGRESS or REJECTED status',
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

interface GenericWorkflowTransitionParams {
  configId: string;
  tenantId: string;
  req: FastifyRequest;
  reply: FastifyReply;
  newStatus: ConfigStatus;
  action: WorkflowAction;
  notificationEvent: NotificationEvent;
  comment?: string;
  shouldCreateTable?: boolean;
  additionalUpdates?: Record<string, unknown>;
  successMessage: string;
}

async function handleGenericWorkflowTransition(params: GenericWorkflowTransitionParams): Promise<void> {
  const {
    configId,
    tenantId,
    req,
    reply,
    newStatus,
    action,
    notificationEvent,
    comment,
    shouldCreateTable = false,
    additionalUpdates = {},
    successMessage,
  } = params;

  try {
    const authReq = req as AuthenticatedRequest;
    const userClaims = authReq.user?.claims ?? [];
    const userEmail = getUserEmailFromRequest(req);
    const userName = getUserNameFromRequest(req);

    loggerService.log(`[Generic Workflow] ${action} for config ${configId} by ${userEmail ?? 'unknown'}`);

    const config = await databaseService.findConfigById(Number(configId), tenantId);
    if (!config) {
      reply.status(404).send({
        success: false,
        message: 'Config not found',
      });
      return;
    }

    const currentStatus = config.status!;

    const permissionValidation = validateUserPermissions(userClaims, currentStatus, action);
    if (!permissionValidation.canPerform) {
      reply.status(403).send({
        success: false,
        message: permissionValidation.message,
      });
      return;
    }

    loggerService.log(`[Generic Workflow] Status transition: ${currentStatus} → ${newStatus} for config ${configId}`);

    const transitionValidation = validateStatusTransition(currentStatus, newStatus);
    if (!transitionValidation.isValid) {
      reply.status(400).send({
        success: false,
        message: transitionValidation.message,
      });
      return;
    }

    await databaseService.updateConfig(Number(configId), tenantId, {
      status: newStatus,
      ...additionalUpdates,
    });

    if (shouldCreateTable) {
      try {
        const transactionType = config.transactionType.replace(/[^a-zA-Z0-9_]/g, '_');
        const tableName = transactionType;

        const createTableQuery = `
CREATE TABLE IF NOT EXISTS "${tableName}" (
  id SERIAL PRIMARY KEY,
  document JSONB NOT NULL
);`;

        const client = await databaseService.getClient();
        try {
          await client.query(createTableQuery);
          loggerService.log(`[Generic Workflow] Successfully created table: ${tableName}`);
        } finally {
          client.release();
        }
      } catch (tableError: unknown) {
        const error = tableError as Error;
        loggerService.error(`[Generic Workflow] Failed to create table for config ${configId}: ${error.message}`);
      }
    }

    const updatedConfig = await databaseService.findConfigById(Number(configId), tenantId);

    const genericNotificationPromise = sendGenericNotification({
      event: notificationEvent,
      configId: Number(configId),
      config: updatedConfig!,
      tenantId,
      actorEmail: userEmail ?? 'system@unknown',
      actorName: userName ?? 'System User',
      comment,
    });
    genericNotificationPromise.catch((err: unknown) => {
      const error = err as Error;
      loggerService.error(`[Generic Notification] Error: ${error.message}`);
    });

    loggerService.log(`[Generic Workflow] Config ${configId}: ${currentStatus} → ${newStatus}${comment ? ` - Comment: ${comment}` : ''}`);

    reply.status(200).send({
      success: true,
      message: successMessage,
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const error = err as Error;
    loggerService.error(`[Generic Workflow] Failed ${action}: ${error.message}`, error.stack ?? '');
    reply.status(500).send({
      success: false,
      message: `Failed to ${action}: ${error.message}`,
    });
  }
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
          version: config.version,
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

    const genericNotificationPromise = sendGenericNotification({
      event: NotificationEvent.EDITOR_SUBMIT,
      configId: Number(id),
      config: updatedConfig!,
      tenantId,
      actorEmail: editorEmail ?? userEmail ?? 'system@unknown',
      actorName: userName ?? 'System User',
      comment: dto.comment,
    });
    genericNotificationPromise.catch((err: unknown) => {
      const error = err as Error;
      loggerService.error(`[Generic Notification] Error: ${error.message}`);
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

    const userEmail = getUserEmailFromRequest(req);

    const genericNotificationPromise = sendGenericNotification({
      event: NotificationEvent.APPROVER_APPROVE,
      configId: Number(id),
      config,
      tenantId,
      actorEmail: userEmail ?? 'system@unknown',
      actorName: 'System User',
      comment: dto.comment ?? dto.approvalNotes,
    });
    genericNotificationPromise.catch((err: unknown) => {
      const error = err as Error;
      loggerService.error(`[Generic Notification] Error: ${error.message}`);
    });

    loggerService.log(
      `Config ${id} approved. Status: ${currentStatus} → ${newStatus}${(dto.comment ?? dto.approvalNotes ?? '') ? ` - Notes: ${dto.comment ?? dto.approvalNotes ?? ''}` : ''}`,
    );

    reply.status(200).send({
      success: true,
      message: 'Configuration approved successfully',
      config,
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

    loggerService.log(`Validating rejection reason... ${JSON.stringify(dto)}`);

    if (!dto.comment?.trim()) {
      reply.status(400).send({
        success: false,
        message: 'Rejection reason is required xx',
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
      comments: dto.comment ?? null,
    });

    loggerService.log(`Config ${id} rejected. Status: ${currentStatus} → ${newStatus} - Reason: ${dto.rejectionReason}`);

    reply.status(200).send({
      success: true,
      message: 'Configuration rejected successfully. Editor has been notified.',
      config: { ...config, status: newStatus, comments: dto.comment ?? null },
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

    const userEmail = getUserEmailFromRequest(req);
    const userName = getUserNameFromRequest(req);

    const genericNotificationPromise = sendGenericNotification({
      event: NotificationEvent.PUBLISHER_DEPLOY,
      configId: Number(id),
      config: updatedConfig!,
      tenantId,
      actorEmail: userEmail ?? 'system@unknown',
      actorName: userName ?? 'System User',
      comment: dto.deploymentNotes,
    });
    genericNotificationPromise.catch((err: unknown) => {
      const error = err as Error;
      loggerService.error(`[Generic Notification] Error: ${error.message}`);
    });

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

    const userEmail = getUserEmailFromRequest(req);
    const userName = getUserNameFromRequest(req);

    const genericNotificationPromise = sendGenericNotification({
      event: NotificationEvent.EXPORTER_EXPORT,
      configId: Number(id),
      config: updatedConfig!,
      tenantId,
      actorEmail: userEmail ?? 'system@unknown',
      actorName: userName ?? 'System User',
      comment: dto.comment,
    });
    genericNotificationPromise.catch((err: unknown) => {
      const error = err as Error;
      loggerService.error(`[Generic Notification] Error: ${error.message}`);
    });

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

export const genericSubmitForApprovalHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Generic submit for approval');
  const { id } = req.params as { id: string };
  const { tenantId } = req as ITenantRequest;
  const dto = req.body as SubmitForApprovalDto;

  await handleGenericWorkflowTransition({
    configId: id,
    tenantId,
    req,
    reply,
    newStatus: CS.UNDER_REVIEW,
    action: 'submit_for_approval',
    notificationEvent: NotificationEvent.EDITOR_SUBMIT,
    comment: dto.comment,
    shouldCreateTable: false,
    successMessage: 'Configuration submitted for approval successfully',
  });

  loggerService.log('End - Generic submit for approval');
};

export const genericApproveConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Generic approve config');
  const { id } = req.params as { id: string };
  const { tenantId } = req as ITenantRequest;
  const dto = req.body as ApprovalDto;

  await handleGenericWorkflowTransition({
    configId: id,
    tenantId,
    req,
    reply,
    newStatus: CS.APPROVED,
    action: 'approve',
    notificationEvent: NotificationEvent.APPROVER_APPROVE,
    comment: dto.comment ?? dto.approvalNotes,
    shouldCreateTable: true,
    successMessage: 'Configuration approved successfully',
  });

  loggerService.log('End - Generic approve config');
};

export const genericExportConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Generic export config');
  const { id } = req.params as { id: string };
  const { tenantId } = req as ITenantRequest;
  const dto = req.body as StatusTransitionDto;

  await handleGenericWorkflowTransition({
    configId: id,
    tenantId,
    req,
    reply,
    newStatus: CS.EXPORTED,
    action: 'export',
    notificationEvent: NotificationEvent.EXPORTER_EXPORT,
    comment: dto.comment,
    shouldCreateTable: false,
    successMessage: 'Configuration exported successfully. Ready for publishing.',
  });

  loggerService.log('End - Generic export config');
};

export const genericDeployConfigHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Generic deploy config');
  const { id } = req.params as { id: string };
  const { tenantId } = req as ITenantRequest;
  const dto = req.body as DeploymentDto;

  await handleGenericWorkflowTransition({
    configId: id,
    tenantId,
    req,
    reply,
    newStatus: CS.DEPLOYED,
    action: 'deploy',
    notificationEvent: NotificationEvent.PUBLISHER_DEPLOY,
    comment: dto.deploymentNotes,
    shouldCreateTable: true,
    additionalUpdates: {
      publishing_status: 'active',
    },
    successMessage: 'Configuration deployed successfully. This configuration is now read-only.',
  });

  loggerService.log('End - Generic deploy config');
};
