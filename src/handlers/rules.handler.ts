import type { FastifyRequest, FastifyReply } from 'fastify';
import { databaseService } from '../index';
import type { AuthenticatedRequest } from '../interface/AuthenticatedRequest';
import { ErrorHandler } from './errorHandler';

// Type definitions for rule creation with enhanced validation
interface RuleData {
  ruleName?: string; // Optional - can be generated
  description: string;
  txtp: string;
  version: string;
  txtpVersion?: string; // Optional
  status?: string; // Optional - defaults to STATUS_01_IN_PROGRESS
  publishing_status?: string; // Optional - should default to INACTIVE
  rule_type: string; // Required
  rule_config_id?: string; // Conditional based on rule flow existence
  userID?: string;
}

// Note: Validation is handled by the rule-studio backend service
// This admin-service only provides data access endpoints

interface Transaction {
  CstmrCdtTrfInitn: {
    GrpHdr: Record<string, unknown>;
    PmtInf: Record<string, unknown>;
  };
  TxTp: string;
  TenantId: string;
}

interface NetworkMap {
  cfg: string;
  active: boolean;
  messages: Array<Record<string, unknown>>;
  tenantId: string;
}

interface MetaData {
  correlationId: string;
  timestamp: string;
  tenantId: string;
  transactionType: string;
}

interface RuleRequest {
  transaction: Transaction;
  networkMap: NetworkMap;
  DataCache: Record<string, unknown>;
  metaData: MetaData;
}

interface CreateRuleHandlerReqBody {
  ruleData: RuleData;
  ruleRequest: RuleRequest;
}

interface CloneRuleHandlerReqBody {
  payload: {
    ruleName: string;
    description: string;
    // status: string;
    // publishing_status: string;
    rule_config_id: string;
    txtp: string;
    version: string;
    rule_type: string;
  };
  ruleRequest: RuleRequest;
}

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
    const { ruleData, ruleRequest } = req.body as CreateRuleHandlerReqBody;

    // Note: Validation is handled by rule-studio backend service
    // This admin-service only handles data persistence

    // Apply basic defaults if not provided
    const processedRuleData = {
      ...ruleData,
      status: 'STATUS_01_IN_PROGRESS',
      publishing_status: 'INACTIVE',
    };

    // Ensure rule name is generated if not provided
    const ruleName =
      processedRuleData.ruleName?.trim() ??
      (processedRuleData.rule_config_id ? `${tenantId}-rule-${processedRuleData.rule_config_id.split('@')[0]}` : `${tenantId}-rule`);

    // console.log('Rule data received for creation:', processedRuleData);
    // console.log('Rule request received for creation:', ruleRequest);

    // Step 4: Prepare rule data for database
    const newRule = {
      ruleName,
      description: processedRuleData.description,
      tenant_id: tenantId,
      txtp: processedRuleData.txtp,
      txtp_version: processedRuleData.txtpVersion,
      version: processedRuleData.version,
      status: processedRuleData.status, // Already has default applied
      publishing_status: processedRuleData.publishing_status, // Already has default applied
      updated_by: userId,
      rule_type: processedRuleData.rule_type,
      rule_config_id: processedRuleData.rule_config_id,
      updated_at: new Date(),
      created_at: new Date(),
    };

    // Step 5: Create rule in database
    const createdRule: unknown = await databaseService.createRule(newRule, ruleRequest);

    reply.code(201).send({
      success: true,
      message: 'Rule created successfully',
      rule: createdRule,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to create rule');
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

    const ruleFlow = await databaseService.findRuleFlow(
      ruleId,
      tenantId ?? '',
      query.category && query.category !== 'undefined' ? { category: query.category } : undefined,
    );

    if (!ruleFlow) {
      ErrorHandler.sendError(reply, { status: 404 }, `Rule flow not found for rule ${ruleId}`);
      return;
    }

    reply.code(200).send({
      success: true,
      result: ruleFlow,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get rule configuration');
  }
};

export const createRuleFlowHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const tenantId = (req as AuthenticatedRequest).user?.tenantId ?? 'DEFAULT';
    const flowData = req.body as { flow_json_rule_builder: Record<string, unknown>; flow_json_test_case: Record<string, unknown> };
    const result: unknown = await databaseService.createRuleFlow({
      rule_id: id,
      flowData,
      tenantId,
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
    const payload = req.body as { flow_json: Record<string, unknown>; ts_file_base64?: string; category: string; status: string };
    const result: unknown = await databaseService.updateRuleFlow(
      id,
      {
        flowJson: payload.flow_json,
        tsFileBase64: payload.ts_file_base64,
        category: payload.category,
        status: payload.status,
      },
      tenantId ?? '',
    );

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

export const getRuleFlowStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId;
    const { ruleId } = req.params as { ruleId: string };
    const query = req.query as { category?: string };

    const ruleFlow = await databaseService.getRuleFlowStatus(
      ruleId,
      tenantId ?? '',
      query.category && query.category !== 'undefined' ? { category: query.category } : undefined,
    );

    if (!ruleFlow) {
      ErrorHandler.sendError(reply, { status: 404 }, `Rule flow not found for rule ${ruleId}`);
      return;
    }

    reply.code(200).send({
      success: true,
      result: ruleFlow,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get rule configuration');
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
    // console.log('Received request to clone rule with ID:', req.body);
    const { payload, ruleRequest } = req.body as CloneRuleHandlerReqBody;

    // console.log('Cloning rule with ID:', ruleId);
    // console.log('Rule data for cloning:', payload);
    // console.log('Rule request for cloning:', ruleRequest);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Database service returns dynamic data
    const clonedRule = await databaseService.cloneRule(ruleId, payload, authReq.user?.clientId ?? 'default', token, ruleRequest);
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

export const fetchRuleRequestHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { RuleId, TenantId } = req.query as { RuleId?: string; TenantId?: string };

    // console.log(`Fetching rule request for rule ID: ${RuleId} and tenant ID: ${TenantId}`);

    if (!RuleId) {
      reply.code(400).send({
        success: false,
        message: 'RuleId query parameter is required',
      });
      return;
    }

    if (!TenantId) {
      reply.code(400).send({
        success: false,
        message: 'TenantId query parameter is required',
      });
      return;
    }

    // Fetch rule request data from database
    const ruleRequest = await databaseService.getRuleRequestByRuleId(RuleId, TenantId);

    if (!ruleRequest) {
      reply.code(404).send({
        success: false,
        message: 'Rule request not found',
      });
      return;
    }

    reply.code(200).send({
      success: true,
      message: 'Rule request fetched successfully',
      ruleRequest,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to fetch rule request');
  }
};
