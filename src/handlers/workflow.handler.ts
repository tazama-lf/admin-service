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

const VALID_TRANSITIONS: Record<ConfigStatus, ConfigStatus[]> = {
  [CS.IN_PROGRESS]: [CS.UNDER_REVIEW],
  [CS.UNDER_REVIEW]: [CS.APPROVED, CS.REJECTED, CS.CHANGES_REQUESTED],
  [CS.APPROVED]: [CS.DEPLOYED],
  [CS.DEPLOYED]: [],
  [CS.REJECTED]: [CS.IN_PROGRESS],
  [CS.CHANGES_REQUESTED]: [CS.IN_PROGRESS],
};

const EDITABLE_STATUSES: ConfigStatus[] = [CS.IN_PROGRESS, CS.CHANGES_REQUESTED];

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
    });

    const updatedConfig = await databaseService.findConfigById(Number(id), tenantId);

    loggerService.log(
      `Changes requested for config ${id}. Status: ${currentStatus} → ${newStatus} - Requested changes: ${dto.requestedChanges}`,
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
