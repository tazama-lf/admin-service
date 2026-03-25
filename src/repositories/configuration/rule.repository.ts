import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { CloneRuleHandlerReqBody, RuleEntity, RuleRequest, UpdateRuleRequest } from '../../interface/rule.interface';
import type { RuleFlowResponse } from '../../interface/ruleFlow.interface';

export const updateRuleStatusInDB = async (
  ruleId: string,
  tenantId: string,
  status: string,
  reason: string,
): Promise<{ rowCount: number }> => {
  const query = `
      UPDATE trs_rules
      SET status = $1, comments = $2, updated_at = NOW()
      WHERE id = $3 AND tenant_id = $4
    `;

  const result = await handlePostExecuteSqlStatement(
    {
      text: query,
      values: [status, reason, ruleId, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  return { rowCount: result.rowCount ?? 0 };
};

export const createRuleInDB = async (
  ruleData: {
    ruleName: string;
    description: string;
    tenant_id: string;
    txtp: string;
    txtp_version?: string;
    version: string;
    status?: string;
    publishing_status?: string;
    updated_by: string;
    rule_type: string;
    rule_config_id?: string;
    updated_at: Date;
    created_at: Date;
  },
  ruleRequest: RuleRequest,
): Promise<RuleEntity> => {
  const query = `
    INSERT INTO trs_rules (
      rule_name,
      description,
      tenant_id,
      txtp,
      txtp_version,
      version,
      status,
      publishing_status,
      updated_by,
      rule_type,
      rulerequest,
      rule_config_id,
      updated_at,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'STATUS_01_IN_PROGRESS'),COALESCE($8, 'ACTIVE'), $9, $10, $11, $12, $13, $14)
    RETURNING id, rule_name, description, tenant_id, txtp, txtp_version, version, status, publishing_status, updated_by, rule_type, rule_config_id, created_at, updated_at
  `;

  const values = [
    ruleData.ruleName,
    ruleData.description,
    ruleData.tenant_id,
    ruleData.txtp,
    ruleData.txtp_version,
    ruleData.version,
    ruleData.status,
    ruleData.publishing_status,
    ruleData.updated_by,
    ruleData.rule_type,
    ruleRequest,
    ruleData.rule_config_id ?? null,
    ruleData.updated_at,
    ruleData.created_at,
  ];

  const result = await handlePostExecuteSqlStatement<RuleEntity>(
    {
      text: query,
      values,
    } satisfies PgQueryConfig,
    'configuration',
  );

  // if (ruleRequest) {
  //   await saveRuleRequestInDB(ruleData.txtp, ruleData.tenant_id, ruleData.id, ruleRequest);
  // }

  return result.rows[0];
};

export const updateRuleInDB = async (ruleId: string, tenantId: string, updateData: UpdateRuleRequest): Promise<RuleEntity | null> => {
  // Build dynamic SET clause based on provided fields
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  // Always update updated_at
  setClauses.push('updated_at = NOW()');

  // Dynamically add fields from updateData
  Object.entries(updateData).forEach(([key, value]) => {
    setClauses.push(`${key} = $${paramIndex}`);
    values.push(value);
    paramIndex += 1;
  });

  // Add WHERE clause parameters (rule_id and tenant_id)
  const ruleIdParam = paramIndex;
  const tenantIdParam = paramIndex + 1;

  const query = `
      UPDATE trs_rules
      SET ${setClauses.join(', ')}
      WHERE id = $${ruleIdParam}
        AND tenant_id = $${tenantIdParam}
      RETURNING id, rule_name, description, tenant_id, txtp, version, status, publishing_status, updated_by, rule_type, rule_config_id, metadata, created_at, updated_at
    `;

  values.push(ruleId, tenantId);

  const result = await handlePostExecuteSqlStatement<RuleEntity>(
    {
      text: query,
      values,
    } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows.length > 0 ? result.rows[0] : null;
};

export const findRuleConfigurationFromDB = async (ruleId: string, tenantId: string): Promise<{ configuration: unknown } | null> => {
  const query = `
      SELECT configuration
      FROM rule
      WHERE "ruleid" = $1 AND "tenantid" = $2`;

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

  return { configuration: result.rows[0].configuration };
};

export const updateRuleMetaData = async (
  ruleId: string,
  metadata: {
    sync?: boolean;
    deploy?: boolean;
    test?: boolean;
    simulation?: boolean;
  },
  tenantId: string,
): Promise<{
  sync?: boolean;
  deploy?: boolean;
  test?: boolean;
  simulation?: boolean;
}> => {
  const query = `
      UPDATE trs_rules
      SET metadata = $2
      WHERE id = $1 AND tenant_id = $3
    `;
  const result = await handlePostExecuteSqlStatement<{
    metadata: {
      sync?: boolean;
      deploy?: boolean;
      test?: boolean;
      simulation?: boolean;
    };
  }>(
    {
      text: query,
      values: [ruleId, JSON.stringify(metadata), tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );
  return result.rows[0].metadata;
};

export const findAllRuleIdsFromDb = async (tenantId: string): Promise<Array<{ ruleId: string; ruleCfg: unknown; tenantId: string }>> => {
  const query = `
      SELECT "ruleid", "rulecfg", "tenantid"
      FROM rule
      WHERE "tenantid" = $1
      ORDER BY "ruleid"
    `;

  const result = await handlePostExecuteSqlStatement<{ ruleId: string; ruleCfg: unknown; tenantId: string }>(
    {
      text: query,
      values: [tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows;
};

export const findRuleByIdFromDB = async (id: number, tenantId: string): Promise<RuleEntity | null> => {
  const query = `
      SELECT id, rule_name, description, tenant_id, txtp, version,txtp_version, status, publishing_status, updated_by, rule_type, rule_config_id, metadata, created_at, updated_at, comments
      FROM trs_rules
      WHERE id = $1 AND tenant_id = $2
    `;

  const result = await handlePostExecuteSqlStatement<RuleEntity>(
    {
      text: query,
      values: [id, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

export const countRulesWithFiltersInDB = async (whereClauses: string, queryParams: unknown[]): Promise<number> => {
  const query = `
      SELECT COUNT(*)
      FROM trs_rules
      ${whereClauses}
    `;

  const countResult = await handlePostExecuteSqlStatement<{ count: string }>(
    {
      text: query,
      values: queryParams,
    } satisfies PgQueryConfig,
    'configuration',
  );

  return parseInt(countResult.rows[0].count, 10) || 0;
};

export const findRulesWithFiltersInDB = async (
  whereClause: string,
  paramIndex: number,
  dataParams: unknown[],
): Promise<{ result: unknown }> => {
  const dataQuery = `
    SELECT
      id,
      rule_name,
      description,
      tenant_id,
      txtp,
      version,
      status,
      publishing_status,
      updated_by,
      created_at,
      updated_at,
      rule_type,
      rule_config_id,
      txtp_version
    FROM trs_rules
    ${whereClause}
    ORDER BY updated_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const result = await handlePostExecuteSqlStatement<{ result: unknown }>(
    {
      text: dataQuery,
      values: dataParams,
    } satisfies PgQueryConfig,
    'configuration',
  );
  return { result: result.rows };
};

export const getVersionsOfTransactionTypeFromDB = async (transactionType: string, tenantId: string): Promise<string[]> => {
  const query = 'SELECT DISTINCT version FROM tcs_config WHERE transaction_type = $1 and tenant_id = $2;';

  const result = await handlePostExecuteSqlStatement<{ version: string }>(
    {
      text: query,
      values: [transactionType, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length > 0) {
    return result.rows.map((row) => row.version);
  } else {
    return [];
  }
};

export const saveRuleRequestInDB = async (txTp: string, tenantId: string, ruleRequest: RuleRequest): Promise<void> => {
  const query = `
      UPDATE trs_rules
      SET rulerequest = $1
      WHERE tenant_id = $2
      AND txtp = $3;

    `;

  await handlePostExecuteSqlStatement(
    {
      text: query,
      values: [ruleRequest, tenantId, txTp],
    } satisfies PgQueryConfig,
    'configuration',
  );
};

export const cloneRuleInDB = async (
  clonePayload: CloneRuleHandlerReqBody['payload'],
  createdBy: string,
  ruleId: number,
  tenantId: string,
): Promise<RuleEntity> => {
  const cloneRuleQuery = `
  INSERT INTO trs_rules (
    rule_name,
    description,
    rule_config_id,
    txtp,
    version,
    rule_type,
    tenant_id,
    created_at,
    updated_at,
    status,
    publishing_status,
    updated_by,
    rulerequest,
    txtp_version,
    comments,
    metadata
  )
  SELECT
    COALESCE($3, t.rule_name),
    COALESCE($4, t.description),
    COALESCE($5, t.rule_config_id),
    COALESCE($6, t.txtp),
    COALESCE($7, t.version),
    COALESCE($8, t.rule_type),
    t.tenant_id,
    NOW(),
    NOW(),
    'STATUS_01_IN_PROGRESS', -- override status
    'INACTIVE', -- override publishing_status
    t.updated_by,
    t.rulerequest,
    t.txtp_version,
    t.comments,
    '{"sync":false,"test":false,"deploy":false,"simulation":false}'::jsonb
  FROM trs_rules t
  WHERE t.id = $1 AND t.tenant_id = $2
  RETURNING *;
`;

  const ruleValues = [
    ruleId, // $1
    tenantId, // $2
    clonePayload.ruleName, // $3
    clonePayload.description, // $4
    clonePayload.rule_config_id, // $5
    clonePayload.txtp, // $6
    clonePayload.version, // $7
    clonePayload.rule_type, // $8
  ];

  const cloneRuleResult = await handlePostExecuteSqlStatement<RuleEntity>(
    {
      text: cloneRuleQuery,
      values: ruleValues,
    } satisfies PgQueryConfig,
    'configuration',
  );

  return cloneRuleResult.rows[0];
};

export const cloneRuleFlowInDB = async (newRuleId: string, oldRuleId: number): Promise<RuleFlowResponse> => {
  const cloneFlowQuery = `
        INSERT INTO trs_rule_flow (
          rule_id, flow_json_rule_builder, flow_json_test_case, ts_file_base64_rule_builder, ts_file_base64_test_case, created_at, updated_at
        )
        SELECT 
          $1 AS rule_id,
          flow_json_rule_builder,
          flow_json_test_case,
          ts_file_base64_rule_builder,
          ts_file_base64_test_case,
          NOW() AS created_at,
          NOW() AS updated_at
        FROM trs_rule_flow
        WHERE rule_id = $2
        RETURNING id, rule_id, flow_json_rule_builder, flow_json_test_case, ts_file_base64_rule_builder, ts_file_base64_test_case, tenant_id, created_at, updated_at
      `;

  const flowValues = [newRuleId, oldRuleId];

  const result = await handlePostExecuteSqlStatement<RuleFlowResponse>(
    {
      text: cloneFlowQuery,
      values: flowValues,
    } satisfies PgQueryConfig,
    'configuration',
  );
  return result.rows[0];
};
