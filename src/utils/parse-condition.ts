// SPDX-License-Identifier: Apache-2.0
import type {
  ConditionDetails,
  AccountConditionResponse,
  EntityConditionResponse,
} from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/ConditionDetails';
import type { RawConditionResponse } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/EntityConditionEdge';

export const parseConditionEntity = (input: RawConditionResponse[], tenantId: string): EntityConditionResponse => {
  // Initialize the result object
  const result: Partial<EntityConditionResponse> = {
    conditions: [],
  };

  // Track conditions by their ID to avoid duplicates
  const conditionsById: Record<string, ConditionDetails> = {};
  // Process input
  input.forEach((item) => {
    const fields = ['governed_as_creditor_by', 'governed_as_debtor_by'];
    fields.forEach((key) => {
      const fieldName = key as keyof RawConditionResponse;

      conditionObjectAssign(fieldName, item, conditionsById, tenantId);

      // Set the ntty or acct field if not already set
      if (!result.ntty) {
        const firstItem = input[0];
        if (firstItem[fieldName].length) {
          const cond = firstItem[fieldName][0].condition;
          if ('ntty' in cond) {
            result.ntty = cond.ntty;
          }
        }
      }
    });
  });
  // Convert conditionsById to an array
  result.conditions = Object.values(conditionsById);
  result.conditions.sort((a, b) => new Date(a.creDtTm).getTime() - new Date(b.creDtTm).getTime());
  return result as EntityConditionResponse;
};

export const parseConditionAccount = (input: RawConditionResponse[], tenantId: string): AccountConditionResponse => {
  // Initialize the result object
  const result: Partial<AccountConditionResponse> = {
    conditions: [],
  };

  // Track conditions by their ID to avoid duplicates
  const conditionsById: Record<string, ConditionDetails> = {};
  // Process input
  input.forEach((item) => {
    const fields = ['governed_as_creditor_account_by', 'governed_as_debtor_account_by'];
    fields.forEach((key) => {
      const fieldName = key as keyof RawConditionResponse;

      conditionObjectAssign(fieldName, item, conditionsById, tenantId);

      // Set the ntty or acct field if not already set
      if (!result.acct) {
        const firstItem = input[0];
        if (firstItem[fieldName].length) {
          const cond = firstItem[fieldName][0].condition;
          if ('acct' in cond) {
            result.acct = cond.acct;
          }
        }
      }
    });
  });
  // Convert conditionsById to an array
  result.conditions = Object.values(conditionsById);
  result.conditions.sort((a, b) => new Date(a.creDtTm).getTime() - new Date(b.creDtTm).getTime());
  return result as AccountConditionResponse;
};

const conditionObjectAssign = (
  fieldName: keyof RawConditionResponse,
  item: RawConditionResponse,
  conditionsById: Record<string, ConditionDetails>,
  tenantId: string,
): void => {
  item[fieldName].forEach(({ condition }) => {
    const { condId } = condition;

    const conditionDetails: ConditionDetails = {
      condId,
      condTp: condition.condTp,
      incptnDtTm: condition.incptnDtTm,
      xprtnDtTm: condition.xprtnDtTm,
      condRsn: condition.condRsn,
      usr: condition.usr,
      creDtTm: condition.creDtTm,
      tenantId,
      prsptvs: [],
    };

    // Add prsptv details
    conditionDetails.prsptvs.push({
      prsptv: fieldName,
      evtTp: condition.evtTp,
      incptnDtTm: condition.incptnDtTm,
      xprtnDtTm: condition.xprtnDtTm,
    });

    // Store the condition in the result, avoiding duplicates
    if (!conditionsById[condId]) {
      conditionsById[condId] = conditionDetails;
    } else {
      // Merge prsptvs if the condition is already in the result
      conditionsById[condId].prsptvs.push({
        prsptv: fieldName,
        evtTp: condition.evtTp,
        incptnDtTm: condition.incptnDtTm,
        xprtnDtTm: condition.xprtnDtTm,
      });
    }
  });
};
