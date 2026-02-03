import type { FastifyRequest, FastifyReply } from 'fastify';
import { databaseService } from '../index';
import type { AuthenticatedRequest } from '../interface/AuthenticatedRequest';
import { ErrorHandler } from './errorHandler';

export const getAllRulesHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const body = authReq.body as Record<string, string>;
    const { offset = '0', limit = '10' } = req.params as { offset?: string; limit?: string };
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    const result = await databaseService.findRulesWithFilters(parsedLimit, parsedOffset, body, tenantId);
    reply.code(200).send({
      success: true,
      rules: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      pages: Math.ceil(result.total / result.limit),
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get rules');
  }
};

export const getRulesByIdHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const rulesId = parseInt(id);
    if (isNaN(rulesId)) {
      ErrorHandler.sendError(reply, { status: 400 }, `Invalid rules ID: ${id}. Must be a valid number.`);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- RuleEntity type not exported from tcs-lib
    const rules = await databaseService.findRuleById(rulesId, tenantId);
    if (!rules) {
      ErrorHandler.sendError(reply, { status: 404 }, `Rules with id ${id} not found`);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- RuleEntity type not exported from tcs-lib
    reply.code(200).send({ success: true, rules });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get rules');
  }
};

export const createRuleHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
  const userId = authReq.user?.clientId ?? authReq.user?.sub ?? authReq.user?.preferred_username ?? 'system';
  try {
    const ruleData = req.body as Record<string, unknown>;

    const newRule = {
      // rule_id: ruleData.rule_id as string,
      ruleName: ruleData.ruleName as string,
      description: ruleData.description as string,
      tenant_id: tenantId,
      txtp: ruleData.txtp as string,
      txtp_version: ruleData.txtpVersion as string,
      version: ruleData.version as string,
      status: 'STATUS_01_IN_PROGRESS',
      publishing_status: 'ACTIVE',
      updated_by: userId,
      rule_type: ruleData.rule_type as string,
      rule_config_id: ruleData.rule_config_id as string | undefined,
      updated_at: new Date(),
      created_at: new Date(),
    };

    const createdRule: unknown = await databaseService.createRule(newRule);

    // at this posotion all logs of tcs lib will come
    reply.code(201).send({ success: true, message: 'Rule created successfully', rule: createdRule });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to create rule');
  }
};

export const saveRuleRequestHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const { txTp, ruleRequest } = req.body as { txTp: string; ruleRequest: Record<string, unknown> };

    // this goes to tcs-lib and saves the RR into db table
    await databaseService.saveRuleRequest(txTp, tenantId, ruleRequest);

    reply.code(200).send({
      success: true,
      message: 'Rule request saved successfully',
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to save rule request');
  }
};

export const getTxTpVersionsByTransactionTypeHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { transactionType } = req.params as { transactionType: string };
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

    const versions: string[] = await databaseService.getVersionsOfTransactionType(transactionType, tenantId);

    reply.code(200).send({
      success: true,
      transactionType,
      versions,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get versions');
  }
};

export const getRuleIdsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

    const ruleIds = await databaseService.findAllRuleIds(tenantId);

    reply.code(200).send({
      success: true,
      ruleIds,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get rule IDs');
  }
};

export const getRuleConfigurationHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const { ruleId } = req.params as { ruleId: string };

    const configuration: unknown = await databaseService.findRuleConfiguration(ruleId, tenantId);

    if (!configuration) {
      ErrorHandler.sendError(reply, { status: 404 }, `Configuration not found for rule ${ruleId}`);
      return;
    }

    reply.code(200).send({
      success: true,
      ruleId,
      configuration,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get rule configuration');
  }
};

export const updateRuleHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const userId = authReq.user?.clientId ?? authReq.user?.sub ?? authReq.user?.preferred_username ?? 'system';
    const { ruleId } = req.params as { ruleId: string };
    const updateData = req.body as Record<string, unknown>;

    // Add updated_by and updated_at to the update data
    const enrichedUpdateData = {
      ...updateData,
      updated_by: userId,
    };

    const updatedRule: unknown = await databaseService.updateRule(ruleId, tenantId, enrichedUpdateData);

    if (!updatedRule) {
      ErrorHandler.sendError(reply, { status: 404 }, `Rule with id ${ruleId} not found`);
      return;
    }

    reply.code(200).send({
      success: true,
      message: 'Rule updated successfully',
      rule: updatedRule,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to update rule');
  }
};

export const getRuleFlowHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId;
    const { ruleId } = req.params as { ruleId: string };
    const query = req.query as { category?: string };

    const ruleFlow = await databaseService.findRuleFlow(ruleId, tenantId ?? '', query);

    if (!ruleFlow) {
      ErrorHandler.sendError(reply, { status: 404 }, `Rule flow not found for rule ${ruleId}`);
      return;
    }

    reply.code(200).send({
      success: true,

      rule_id: ruleFlow.rule_id,

      flow: ruleFlow.flow_json,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get rule configuration');
  }
};

export const createRuleFlowHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const tenantId = (req as AuthenticatedRequest).user?.tenantId ?? 'DEFAULT';
    const flowData = req.body as Record<string, unknown>;
    const result: unknown = await databaseService.createRuleFlow({
      rule_id: id,
      flow_json: flowData.flow_json as Record<string, unknown>,
      tenantId,
      category: (flowData.category as string) || 'rule_builder',
    });
    reply.code(201).send({
      success: true,
      message: 'Rule flow created successfully',
      flow: result,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to create rule flow');
  }
};

export const updateRuleFlowHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const request = req as AuthenticatedRequest;
    const tenantId = request.user?.tenantId;
    const { id } = req.params as { id: string };
    const payload = req.body as { flow_json: Record<string, unknown>; ts_file_base64?: string; category: string };
    const result: unknown = await databaseService.updateRuleFlow(id, payload, tenantId ?? '');

    if (!result) {
      ErrorHandler.sendError(reply, { status: 404 }, `Rule flow not found for rule ${id}`);
      return;
    }

    reply.code(200).send({
      success: true,
      message: 'Rule flow updated successfully',
      flow: result,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to update rule flow');
  }
};

export const getGlobalVariablesHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { ruleId, tenantId } = req.params as { ruleId: string; tenantId: string };

    const globalVariables = await databaseService.getGlobalVariables(ruleId, tenantId);

    if (!globalVariables?.ruleRequest || !globalVariables.configuration) {
      ErrorHandler.sendError(reply, { status: 404 }, `Global variables not found for rule ${ruleId} and tenant ${tenantId}`);
      return;
    }

    const RuleRequest: unknown = globalVariables.ruleRequest;
    const RuleConfig: unknown = globalVariables.configuration;

    const RuleResult = {
      id: ruleId,
      tenantId,
      cfg: '',
      subRuleRef: '.err',
      reason: 'Unhandled rule result outcome',
      prcgTm: -1,
      indpdntVarbl: 0,
    };

    reply.code(200).send({
      success: true,
      RuleRequest,
      RuleConfig,
      RuleResult,
    });
  } catch (error) {
    ErrorHandler.sendError(reply, error, 'Failed to get global variables');
  }
};

export const cloneRuleHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { ruleId } = req.params as { ruleId: number };
    const authReq = req as AuthenticatedRequest;
    const token = authReq.user?.tenantId ?? 'DEFAULT';

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Database service returns dynamic data
    const clonedRule = await databaseService.cloneRule(ruleId, 'need to fix', authReq.user?.clientId ?? 'default', token);

    reply.code(201).send({
      success: true,
      message: 'Rule cloned successfully',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Database service returns dynamic data
      rule: clonedRule,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to clone rule');
  }
};

export const updateRuleStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { ruleId } = req.params as { ruleId: string };
    const { status, reason } = req.body as { status: string; reason: string };
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

    const updatedRule = await databaseService.updateRuleStatus(ruleId, tenantId, status, reason);

    reply.code(200).send({
      success: true,
      message: 'Rule status updated successfully',
      rule: updatedRule,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to update rule status');
  }
};
