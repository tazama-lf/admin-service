import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { RuleFlowRequest, RuleFlowResponse } from '../../interface/ruleFlow.interface';

export const getRuleRequestByRuleId = async (
  ruleId: string,
  tenantId: string,
): Promise<{ rulerequest: unknown; rule_config_id: string } | null> => {
  const ruleRequestResult = await handlePostExecuteSqlStatement<{ rulerequest: unknown; rule_config_id: string }>(
    {
      text: 'SELECT rulerequest, rule_config_id FROM trs_rules WHERE id = $1 AND tenant_id = $2;',
      values: [ruleId, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  if (ruleRequestResult.rows.length === 0) {
    return null;
  }

  const ruleConfigId = ruleRequestResult.rows[0].rule_config_id;

  return { rulerequest: ruleRequestResult.rows[0].rulerequest, rule_config_id: ruleConfigId };
};

export const getRuleConfigById = async (ruleConfigId: string, tenantId: string): Promise<{ configuration: unknown } | null> => {
  const configurationResult = await handlePostExecuteSqlStatement(
    {
      text: 'SELECT configuration FROM rule WHERE "ruleid" = $1 AND "tenantid" = $2;',
      values: [ruleConfigId, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  if (configurationResult.rows.length === 0) {
    return null;
  }

  return { configuration: configurationResult.rows[0].configuration };
};

export const createRuleFlowInDB = async (ruleFlowData: RuleFlowRequest): Promise<RuleFlowResponse> => {
  const query = `
      INSERT INTO trs_rule_flow (
        rule_id,
        flow_json_rule_builder,
        flow_json_test_case,
        tenant_id,
        updated_at,
        created_at
      ) VALUES (
        $1, $2, $3, $4, NOW(), NOW()
      )
      RETURNING id, rule_id, flow_json_rule_builder, flow_json_test_case, tenant_id, created_at, updated_at;
    `;

  const result = await handlePostExecuteSqlStatement(
    {
      text: query,
      values: [
        ruleFlowData.rule_id,
        JSON.stringify(ruleFlowData.flowData.flow_json_rule_builder),
        JSON.stringify(ruleFlowData.flowData.flow_json_test_case),
        ruleFlowData.tenantId,
      ],
    } satisfies PgQueryConfig,
    'configuration',
  );
  return result.rows[0] as RuleFlowResponse;
};

export const findRuleFlowFromDB = async (
  ruleId: string,
  tenantId: string,
  selectClause: string,
): Promise<Record<string, unknown> | null> => {
  const query = `
      SELECT ${selectClause}
      FROM trs_rule_flow
      WHERE rule_id = $1 AND tenant_id = $2
      LIMIT 1
    `;

  const result = await handlePostExecuteSqlStatement(
    {
      text: query,
      values: [ruleId, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

export const updateRuleFlowInDB = async (
  setClause: string,
  returningClause: string,
  ruleId: string,
  flowData: { flowJson: Record<string, unknown>; tsFileBase64: string },
  tenantId: string,
): Promise<RuleFlowResponse | null> => {
  const query = `UPDATE trs_rule_flow SET ${setClause} updated_at = NOW() WHERE rule_id = $1 AND tenant_id = $4 RETURNING ${returningClause};`;
  const result = await handlePostExecuteSqlStatement(
    {
      text: query,
      values: [ruleId, JSON.stringify(flowData.flowJson), flowData.tsFileBase64, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as RuleFlowResponse;
};

export const findRuleFlowStatusFromDB = async (
  ruleId: string,
  tenantId: string,
  selectClause: string,
  fromTable: string,
): Promise<Record<string, unknown> | null> => {
  const query = `
      SELECT ${selectClause}
      FROM ${fromTable}
      WHERE rule_id = $1 AND tenant_id = $2
      LIMIT 1
    `;

  const queryParams = [ruleId, tenantId];
  const result = await handlePostExecuteSqlStatement(
    {
      text: query,
      values: queryParams,
    } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};
