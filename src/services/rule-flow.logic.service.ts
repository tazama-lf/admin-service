import { loggerService } from '..';
import type { RuleFlowRequest, RuleFlowResponse } from '../interface/ruleFlow.interface';
import {
  createRuleFlowInDB,
  findRuleFlowFromDB,
  getRuleConfigById,
  getRuleRequestByRuleId,
} from '../repositories/configuration/rule-flow.repository';

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

export const findRuleFlow = async (
  ruleId: string,
  tenantId: string,
  filter?: { category: string },
): Promise<Record<string, unknown> | null> => {
  const category = filter?.category;
  let selectClause = '*';

  if (category === 'rule_builder') {
    selectClause =
      'id, rule_id, flow_json_rule_builder as flow_json, ts_file_base64_rule_builder as ts_file_base64, tenant_id, created_at, updated_at';
  } else if (category === 'test_case_generation') {
    selectClause =
      'id, rule_id, flow_json_test_case as flow_json, ts_file_base64_test_case as ts_file_base64, tenant_id, created_at, updated_at';
  }

  const result = await findRuleFlowFromDB(ruleId, tenantId, selectClause);
  return result;
};

// export const updateRuleFlow = async (
//     ruleId: string,
//     flowData: { flowJson: Record<string, unknown>; tsFileBase64?: string; category: string },
//     tenantId: string,
// ): Promise<
//     | Array<{
//         id: number;
//         rule_id: string;
//         flow_json: Record<string, unknown>;
//         ts_file_base64?: string;
//         tenant_id: string;
//         created_at: Date;
//         updated_at: Date;
//     }>
//     | []
// > => {
//     const { category, flowJson, tsFileBase64 } = flowData;

//     let setClause: string;
//     let returningClause: string;

//     if (category === 'rule_builder') {
//         setClause = `
//         flow_json_rule_builder = $2,
//         ts_file_base64_rule_builder = $3,
//       `;
//         returningClause = `
//         id, rule_id, flow_json_rule_builder as flow_json, ts_file_base64_rule_builder as ts_file_base64, tenant_id, created_at, updated_at
//       `;
//     } else if (category === 'test_case_generation') {
//         setClause = `
//         flow_json_test_case = $2,
//         ts_file_base64_test_case = $3,
//       `;
//         returningClause = `
//         id, rule_id, flow_json_test_case as flow_json, ts_file_base64_test_case as ts_file_base64, tenant_id, created_at, updated_at
//       `;
//     } else {
//         throw new HttpException(
//             `Invalid category for updating rule flow: ${category}`,
//             HttpStatus.BAD_REQUEST,
//         );
//     }

//     const query = `
//       UPDATE trs_rule_flow
//       SET
//         ${setClause}
//         updated_at = NOW()
//       WHERE rule_id = $1 AND tenant_id = $4
//       RETURNING ${returningClause};
//     `;

//     const result = await this.dbClient.query(query, [
//         ruleId,
//         JSON.stringify(flowJson),
//         tsFileBase64,
//         tenantId,
//     ]);

//     if (result.rows.length === 0) {
//         return [];
//     }

//     return result.rows;
// }
