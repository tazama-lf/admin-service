import type { ConditionResponse, ConditionDetails } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/ConditionDetails';
import { type RawConditionResponse } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/EntityConditionEdge';

export const parseCondition = (input: RawConditionResponse[]): ConditionResponse => {
  // Initialize the result object
  const result: Partial<ConditionResponse> = {
    conditions: [],
  };

  // Track conditions by their ID to avoid duplicates
  const conditionsById: Record<string, ConditionDetails> = {};
  // Process input
  input.forEach((item) => {
    const fields = ['governed_as_creditor_by', 'governed_as_debtor_by'];
    fields.forEach((key) => {
      const fieldName = key as keyof RawConditionResponse;
      item[fieldName].forEach(({ condition }) => {
        const condId = condition._key;

        const conditionDetails: ConditionDetails = {
          condId,
          condTp: condition.condTp,
          incptnDtTm: condition.incptnDtTm,
          xprtnDtTm: condition.xprtnDtTm,
          condRsn: condition.condRsn,
          usr: condition.usr,
          creDtTm: condition.creDtTm,
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

      // Set the ntty or acct field if not already set
      if (!result.ntty) {
        const firstItem = input[0];
        if (firstItem[fieldName].length) {
          const cond = firstItem[fieldName][0].condition;
          if ('ntty' in cond) {
            result.ntty = cond.ntty;
          } else if ('acct' in cond) {
            result.acct = cond.acct;
          }
        }
      }
    });
  });
  // Convert conditionsById to an array
  result.conditions = Object.values(conditionsById);
  return result as ConditionResponse;
};
