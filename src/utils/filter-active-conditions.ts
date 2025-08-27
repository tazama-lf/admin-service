// SPDX-License-Identifier: Apache-2.0
import type { ConditionDetails } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/ConditionDetails';

export const filterConditions = (conditions: ConditionDetails[]): ConditionDetails[] => {
  // Could move this in the filter, but we would then be comparing with different values per iteration
  const now = new Date();
  return conditions.filter((condition) => {
    if (condition.xprtnDtTm) {
      const dt = new Date(condition.xprtnDtTm);
      return now < dt;
    } else {
      return true;
    }
  });
};
