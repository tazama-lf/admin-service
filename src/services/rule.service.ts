import { updateRuleStatusInDB } from '../repositories/configuration/rule.repository';
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
