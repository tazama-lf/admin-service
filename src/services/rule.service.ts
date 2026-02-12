import type { RuleRequest, RuleEntity } from '../interface/rule.interface';
import {
  countRulesWithFiltersInDB,
  createRuleInDB,
  findAllRuleIdsFromDb,
  findRuleByIdFromDB,
  findRuleConfigurationFromDB,
  findRulesWithFiltersInDB,
  getVersionsOfTransactionTypeFromDB,
  updateRuleInDB,
  updateRuleStatusInDB,
  saveRuleRequestInDB,
  cloneRuleInDB,
  cloneRuleFlowInDB,
} from '../repositories/configuration/rule.repository';
import { HttpException, HttpStatus } from '../utils/error';

export const updateRuleStatus = async (
  ruleId: string,
  tenantId: string,
  status: string,
  reason: string,
): Promise<{ success: boolean; message: string }> => {
  const result = await updateRuleStatusInDB(ruleId, tenantId, status, reason);

  if (result.rowCount === 0) {
    throw new HttpException(`Rule with id "${ruleId}" not found or status not updated`, HttpStatus.NOT_FOUND);
  }

  return {
    success: true,
    message: `Rule with id "${ruleId}" successfully updated to status "${status}" with reason "${reason}"`,
  };
};

export const createRule = async (
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
  },
  ruleRequest: RuleRequest,
): Promise<RuleEntity> => {
  const result: RuleEntity = await createRuleInDB(ruleData);
  const newRuleFlow = await cloneRuleFlowInDB(result.id!, 21);

  await updateRuleInDB(result.id!, ruleData.tenant_id, { flow_id: newRuleFlow.id.toString() });

  await saveRuleRequestInDB(ruleData.txtp, ruleData.tenant_id, ruleRequest);
  return result;
};

export const updateRule = async (
  ruleId: string,
  tenantId: string,
  updateData: Partial<{
    rule_name: string;
    description: string;
    txtp: string;
    version: string;
    status: string;
    publishing_status: string;
    rule_type: string;
    rule_config_id: string;
    updated_by: string;
    flow_id: string;
  }>,
): Promise<RuleEntity | null> => {
  const result = await updateRuleInDB(ruleId, tenantId, updateData);
  return result;
};

export const findAllRuleIds = async (tenantId: string): Promise<Array<{ ruleId: string; ruleCfg: unknown; tenantId: string }>> =>
  await findAllRuleIdsFromDb(tenantId);

export const findRuleConfiguration = async (ruleId: string, tenantId: string): Promise<unknown> =>
  await findRuleConfigurationFromDB(ruleId, tenantId);

export const findRuleById = async (id: number, tenantId: string): Promise<RuleEntity | null> => await findRuleByIdFromDB(id, tenantId);

export const cloneRule = async (
  ruleId: number,
  newRuleName: string,
  createdBy: string,
  tenantId: string,
  ruleRequest: RuleRequest | undefined,
): Promise<RuleEntity> => {
  const cloneRuleResult: RuleEntity = await cloneRuleInDB(newRuleName, createdBy, ruleId, tenantId);

  const newRuleId = cloneRuleResult.id!;

  await cloneRuleFlowInDB(newRuleId, ruleId);

  if (ruleRequest) {
    await saveRuleRequestInDB(cloneRuleResult.txtp, tenantId, ruleRequest);
  }

  return cloneRuleResult;
};

export const findRulesWithFilters = async (
  limit = 10,
  offset = 0,
  payload: Record<string, string>,
  tenantId: string,
): Promise<{ data: unknown; total: number; limit: number; offset: number }> => {
  const { status, publishingStatus, createdAt, startDate, endDate, ruleName, ruleType, updatedBy } = payload;

  const whereClauses: string[] = ['tenant_id = $1'];
  const queryParams: unknown[] = [tenantId];
  let paramIndex = 2;

  if (status) {
    const statusArray = status.split(',').map((s) => s.trim());
    whereClauses.push(`status = ANY($${paramIndex})`);
    queryParams.push(statusArray);
    paramIndex += 1;
  }

  if (publishingStatus) {
    whereClauses.push(`publishing_status = $${paramIndex}`);
    queryParams.push(publishingStatus.toLowerCase());
    paramIndex += 1;
  }

  if (ruleName) {
    whereClauses.push(`rule_name ILIKE $${paramIndex}`);
    queryParams.push(`%${ruleName}%`);
    paramIndex += 1;
  }

  if (ruleType) {
    whereClauses.push(`rule_type = $${paramIndex}`);
    queryParams.push(ruleType);
    paramIndex += 1;
  }

  if (updatedBy) {
    whereClauses.push(`updated_by ILIKE $${paramIndex}`);
    queryParams.push(`%${updatedBy}%`);
    paramIndex += 1;
  }

  if (createdAt) {
    whereClauses.push(`DATE(created_at) = $${paramIndex}`);
    queryParams.push(createdAt);
    paramIndex += 1;
  }

  if (startDate && endDate) {
    whereClauses.push(`DATE(created_at) BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
    queryParams.push(startDate, endDate);
    paramIndex += 2;
  } else if (startDate) {
    whereClauses.push(`DATE(created_at) >= $${paramIndex}`);
    queryParams.push(startDate);
    paramIndex += 1;
  } else if (endDate) {
    whereClauses.push(`DATE(created_at) <= $${paramIndex}`);
    queryParams.push(endDate);
    paramIndex += 1;
  }

  const whereClause = `WHERE ${whereClauses.join(' AND ')}`;

  const total = await countRulesWithFiltersInDB(whereClause, queryParams);
  const dataParams = [...queryParams, limit, offset * limit];
  const response = await findRulesWithFiltersInDB(whereClause, paramIndex, dataParams);

  return {
    data: response.result,
    total,
    limit,
    offset,
  };
};

export const getVersionsOfTransactionType = async (transactionType: string, tenantId: string): Promise<string[]> =>
  await getVersionsOfTransactionTypeFromDB(transactionType, tenantId);
