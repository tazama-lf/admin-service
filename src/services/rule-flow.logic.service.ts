import { loggerService } from '..';
import type { RuleFlowRequest, RuleFlowResponse } from '../interface/ruleFlow.interface';
import {
  createRuleFlowInDB,
  findRuleFlowFromDB,
  findRuleFlowStatusFromDB,
  getRuleConfigById,
  getRuleRequestByRuleId,
  updateRuleFlowInDB,
} from '../repositories/configuration/rule-flow.repository';
import { HttpException, HttpStatus } from '../utils/error';

export const getGlobalVariables = async (
  ruleId: string,
  tenantId: string,
): Promise<{
  ruleRequest: unknown;
  configuration: unknown;
} | null> => {
  const ruleRequest = await getRuleRequestByRuleId(ruleId, tenantId);
  if (!ruleRequest) {
    loggerService.log(`No rule request found for ruleId: ${ruleId} and tenantId: ${tenantId}`);
    return null;
  }

  const ruleConfigId = ruleRequest.rule_config_id;
  const configuration = await getRuleConfigById(ruleConfigId, tenantId);
  if (!configuration) {
    loggerService.log(`No rule configuration found for ruleConfigId: ${ruleConfigId} and tenantId: ${tenantId}`);
    return null;
  }
  return {
    ruleRequest: ruleRequest.rulerequest,
    configuration: configuration.configuration,
  };
};

export const createRuleFlow = async (ruleFlowData: RuleFlowRequest): Promise<RuleFlowResponse[]> => {
  const result = await createRuleFlowInDB(ruleFlowData);
  if (!result) {
    throw new Error('Failed to create or update rule flow');
  }
  return [result];
};

export const findRuleFlow = async (ruleId: string, tenantId: string, category?: string): Promise<Record<string, unknown> | null> => {
  let selectClause = '*';
  if (category === 'rule_builder') {
    selectClause =
      'id, rule_id, flow_json_rule_builder as flow_json, ts_file_base64_rule_builder as ts_file_base64, status_rule_builder as status, tenant_id, created_at, updated_at';
  } else if (category === 'test_case_generation') {
    selectClause =
      'id, rule_id, flow_json_test_case as flow_json, ts_file_base64_test_case as ts_file_base64, status_test_case as status, tenant_id, created_at, updated_at';
  } else {
    selectClause =
      'id, rule_id, flow_json_rule_builder, ts_file_base64_rule_builder, flow_json_test_case, ts_file_base64_test_case, tenant_id, status_rule_builder, status_test_case, created_at, updated_at';
  }

  const result = await findRuleFlowFromDB(ruleId, tenantId, selectClause);
  return result;
};

export const updateRuleFlow = async (
  ruleId: string,
  flowData: { flow_json: Record<string, unknown>; ts_file_base64?: string; category: string },
  tenantId: string,
): Promise<RuleFlowResponse | null> => {
  const { category } = flowData;

  let setClause: string;
  let returningClause: string;

  if (category === 'rule_builder') {
    setClause = `
        flow_json_rule_builder = $2,
        ts_file_base64_rule_builder = $3,
      `;
    returningClause = `
        id, rule_id, flow_json_rule_builder as flow_json, ts_file_base64_rule_builder as ts_file_base64, tenant_id, created_at, updated_at
      `;
  } else if (category === 'test_case_generation') {
    setClause = `
        flow_json_test_case = $2,
        ts_file_base64_test_case = $3,
      `;
    returningClause = `
        id, rule_id, flow_json_test_case as flow_json, ts_file_base64_test_case as ts_file_base64, tenant_id, created_at, updated_at
      `;
  } else {
    throw new HttpException(`Invalid category for updating rule flow: ${category}`, HttpStatus.BAD_REQUEST);
  }

  const result = await updateRuleFlowInDB(
    setClause,
    returningClause,
    ruleId,
    {
      flowJson: flowData.flow_json,
      tsFileBase64: flowData.ts_file_base64 ?? '',
    },
    tenantId,
  );

  return result;
};

export const getRuleFlowStatus = async (
  ruleId: string,
  tenantId: string,
  filter?: { category: string },
): Promise<Record<string, unknown> | null> => {
  const category = filter?.category;
  let selectClause = '*';
  let fromTable = 'trs_rule_flow';

  if (!category) {
    selectClause = 'id, rule_id, status_rule_builder as status_rule_builder, status_test_case as status_test_case';
    fromTable = 'trs_rule_flow';
  } else if (category === 'rule_builder') {
    selectClause = 'id, rule_id, status_rule_builder as status';
    fromTable = 'trs_rule_flow';
  } else if (category === 'test_case_generation') {
    selectClause = 'id, rule_id, status_test_case as status';
    fromTable = 'trs_rule_flow';
  }

  return await findRuleFlowStatusFromDB(ruleId, tenantId, selectClause, fromTable);
};
