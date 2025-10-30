// SPDX-License-Identifier: Apache-2.0
import { createSimpleConditionsBuffer } from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
import type { AccountCondition, ConditionEdge, EntityCondition } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import type { AccountConditionResponse, EntityConditionResponse } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/ConditionDetails';
import type { Edge, RawConditionResponse } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/EntityConditionEdge';
import { configuration, databaseManager, loggerService } from '..';
import type { ConditionRequest } from '../interface/query';
import { checkConditionValidity, validateAndParseExpirationDate } from '../utils/condition-validation';
import { filterConditions } from '../utils/filter-active-conditions';
import { parseConditionAccount, parseConditionEntity } from '../utils/parse-condition';
import { updateCache } from '../utils/update-cache';
import { v4 } from 'uuid';

const saveConditionEdges = async (
  perspective: string,
  conditionId: string,
  entityAccntId: string,
  condition: ConditionEdge,
  memberType: 'entity' | 'account',
  tenantId: string,
): Promise<void> => {
  condition.tenantId ||= tenantId;
  switch (perspective) {
    case 'both':
      if (memberType === 'entity') {
        await Promise.all([
          databaseManager.saveGovernedAsCreditorByEdge(conditionId, entityAccntId, condition),
          databaseManager.saveGovernedAsDebtorByEdge(conditionId, entityAccntId, condition),
        ]);
      } else {
        await Promise.all([
          databaseManager.saveGovernedAsCreditorAccountByEdge(conditionId, entityAccntId, condition),
          databaseManager.saveGovernedAsDebtorAccountByEdge(conditionId, entityAccntId, condition),
        ]);
      }
      break;
    case 'debtor':
      if (memberType === 'entity') {
        await databaseManager.saveGovernedAsDebtorByEdge(conditionId, entityAccntId, condition);
      } else {
        await databaseManager.saveGovernedAsDebtorAccountByEdge(conditionId, entityAccntId, condition);
      }
      break;
    case 'creditor':
      if (memberType === 'entity') {
        await databaseManager.saveGovernedAsCreditorByEdge(conditionId, entityAccntId, condition);
      } else {
        await databaseManager.saveGovernedAsCreditorAccountByEdge(conditionId, entityAccntId, condition);
      }
      break;
    default:
      throw Error('Error: Please enter a valid perspective. Accepted values are: both, debtor, or creditor.');
  }
};

export const handlePostConditionEntity = async (
  condition: EntityCondition,
  tenantId: string,
): Promise<{ message: string; result: EntityConditionResponse }> => {
  try {
    loggerService.log(`Started handling post request of entity condition executed by ${condition.usr}.`);

    const nowDateTime = new Date().toISOString();

    checkConditionValidity(condition);

    condition.tenantId = tenantId;

    const condId = v4();
    const condEntityId: string = condition.ntty.id;
    const condSchemeProprietary: string = condition.ntty.schmeNm.prtry;
    condition.condId = condId;

    const entityIdentifier = `${condEntityId}${condSchemeProprietary}`;

    const alreadyExistingEntity = await databaseManager.getEntity(condEntityId, condSchemeProprietary, tenantId);

    if (!alreadyExistingEntity?.id) {
      if (condition.forceCret) {
        try {
          await databaseManager.saveCondition({ ...condition, creDtTm: nowDateTime });
          await databaseManager.saveEntity(entityIdentifier, tenantId, nowDateTime);
        } catch (err) {
          throw Error('Error: while trying to save new entity: ' + (err as { message: string }).message);
        }
        loggerService.log('New entity was added after not being found while forceCret was set to true');
      } else {
        throw Error('Error: entity was not found and we could not create one because forceCret is set to false');
      }
    } else {
      await databaseManager.saveCondition({ ...condition, creDtTm: nowDateTime });
    }

    await saveConditionEdges(condition.prsptv, condId, entityIdentifier, condition, 'entity', tenantId);

    const report = await databaseManager.getEntityConditionsByGraph(condEntityId, condSchemeProprietary, tenantId);

    const retVal = parseConditionEntity(report, tenantId);

    const activeConditionsOnly = { ...retVal, conditions: filterConditions(retVal.conditions) };

    await updateCache(`${tenantId}:${entityIdentifier}`, activeConditionsOnly);

    if (retVal.conditions.length > 1) {
      const message = `${retVal.conditions.length - 1} conditions already exist for the entity`;
      loggerService.warn(message);
      loggerService.trace('using env to update active conditions only', 'cache update', `${tenantId}:${entityIdentifier}`);
      return {
        message,
        result: activeConditionsOnly,
      };
    }

    return {
      message: 'New condition was saved successfully.',
      result: activeConditionsOnly,
    };
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: posting condition for entity with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleGetConditionsForEntity = async (
  params: ConditionRequest,
  tenantId: string,
): Promise<{ code: number; result?: string | EntityConditionResponse }> => {
  const fnName = 'getConditionsForEntity';

  loggerService.trace('successfully parsed parameters', fnName, params.id);
  const accountExist = (await databaseManager.getEntity(params.id, params.schmenm, tenantId))!;

  if (!accountExist?.id) {
    return { result: 'Entity does not exist in the database', code: 404 };
  }

  const report = await databaseManager.getEntityConditionsByGraph(params.id, params.schmenm, tenantId, params.activeonly !== 'yes');

  loggerService.log('called database', fnName, params.id);
  if (!report.length) {
    return { code: 404 };
  }

  const retVal = parseConditionEntity(report, tenantId);

  if (!retVal.conditions.length) {
    return { code: 204 };
  }

  const cacheKey = `${tenantId}:${params.id}${params.schmenm}`;

  switch (params.synccache) {
    case 'all':
      loggerService.trace('syncCache=all option specified', 'cache update', cacheKey);
      await updateCache(cacheKey, retVal);
      break;
    case 'active':
      loggerService.trace('syncCache=active option specified', 'cache update', cacheKey);
      await updateCache(cacheKey, { ...retVal, conditions: filterConditions(retVal.conditions) });
      break;
    case 'default':
      loggerService.trace('syncCache=default option specified', 'cache update', cacheKey);
      if (configuration.ACTIVE_CONDITIONS_ONLY) {
        loggerService.trace('using env to update active conditions only', 'cache update', cacheKey);
        await updateCache(cacheKey, { ...retVal, conditions: filterConditions(retVal.conditions) });
      } else {
        loggerService.trace('using env to update all conditions', 'cache update', cacheKey);
        await updateCache(cacheKey, retVal);
      }
      break;
    default:
      loggerService.trace('syncCache=no/default option specified');
      break;
  }

  return { code: 200, result: retVal };
};

export const handleUpdateExpiryDateForConditionsOfEntity = async (
  params: ConditionRequest,
  tenantId: string,
  xprtnDtTm?: string,
): Promise<{ code: number; message: string }> => {
  const expireDateResult = validateAndParseExpirationDate(xprtnDtTm);

  if (!expireDateResult.isValid) {
    loggerService.error(expireDateResult.message);
    return { code: 400, message: expireDateResult.message };
  }

  const report = await databaseManager.getEntityConditionsByGraph(params.id, params.schmenm, tenantId);

  if (!report.length) {
    return { code: 404, message: 'No records were found in the database using the provided data.' };
  }

  const resultByEdge = report[0];

  if (!resultByEdge.governed_as_creditor_by.length && !resultByEdge.governed_as_debtor_by.length) {
    return { code: 404, message: 'Active conditions do not exist for this particular entity in the database.' };
  }

  const creditorByEdge = resultByEdge.governed_as_creditor_by.filter((eachResult) => eachResult.condition.condId === params.condid);
  const debtorByEdge = resultByEdge.governed_as_debtor_by.filter((eachResult) => eachResult.condition.condId === params.condid);

  if (
    !creditorByEdge.some((eachDocument) => eachDocument.condition.condId) &&
    !debtorByEdge.some((eachDocument) => eachDocument.condition.condId)
  ) {
    return { code: 404, message: 'Condition does not exist in the database.' };
  }

  if (
    creditorByEdge.some((eachDocument) => eachDocument.condition.xprtnDtTm) ||
    debtorByEdge.some((eachDocument) => eachDocument.condition.xprtnDtTm)
  ) {
    return {
      code: 405,
      message: `Update failed - condition ${params.condid} already contains an expiration date ${creditorByEdge[0].condition.xprtnDtTm}`,
    };
  }
  const creditorByEdgeE = creditorByEdge as unknown as Edge[];
  const debtorByEdgeE = creditorByEdge as unknown as Edge[];

  if (!creditorByEdgeE.some((eachDocument) => eachDocument.id) && !debtorByEdgeE.some((eachDocument) => eachDocument.id)) {
    return { code: 404, message: 'Entity does not exist in the database.' };
  }

  if (creditorByEdgeE[0]) {
    await databaseManager.updateExpiryDateOfCreditorEntityEdges(
      creditorByEdgeE[0].source,
      creditorByEdgeE[0].destination,
      expireDateResult.dateStr,
      tenantId,
    );
  }

  if (debtorByEdgeE[0]) {
    await databaseManager.updateExpiryDateOfDebtorEntityEdges(
      debtorByEdgeE[0]?.source,
      debtorByEdgeE[0]?.destination,
      expireDateResult.dateStr,
      tenantId,
    );
  }

  if (params.condid) await databaseManager.updateCondition(params.condid, expireDateResult.dateStr, tenantId);

  const updatedReport = await databaseManager.getEntityConditionsByGraph(params.id, params.schmenm, tenantId, true);

  const retVal = parseConditionEntity(updatedReport, tenantId);

  const activeConditionsOnly = { ...retVal, conditions: filterConditions(retVal.conditions) };

  const cacheKey = `${tenantId}:${params.id}${params.schmenm}`;
  await updateCache(cacheKey, activeConditionsOnly);

  return { code: 200, message: '' };
};

export const handlePostConditionAccount = async (
  condition: AccountCondition,
  tenantId: string,
): Promise<{ message: string; result: AccountConditionResponse }> => {
  try {
    loggerService.log(`Started handling post request of account condition executed by ${condition.usr}.`);

    const nowDateTime = new Date().toISOString();

    checkConditionValidity(condition);

    condition.tenantId = tenantId;

    const condId = v4();
    const condAccountId: string = condition.acct.id;
    const condSchemeProprietary: string = condition.acct.schmeNm.prtry;
    const condMemberid: string = condition.acct.agt.finInstnId.clrSysMmbId.mmbId;
    condition.condId = condId;

    const accountIdentifier = `${condAccountId}${condSchemeProprietary}${condMemberid}`;

    const alreadyExistingAccount = await databaseManager.getAccount(condAccountId, condSchemeProprietary, condMemberid, tenantId);

    if (!alreadyExistingAccount?.id) {
      if (condition.forceCret) {
        try {
          await databaseManager.saveCondition({ ...condition, creDtTm: nowDateTime, tenantId });
          await databaseManager.saveAccount(accountIdentifier, tenantId);
        } catch (err) {
          throw Error('Error: while trying to save new account: ' + (err as { message: string }).message);
        }
        loggerService.log('New account was added after not being found while forceCret was set to true');
      } else {
        throw Error('Error: account was not found and we could not create one because forceCret is set to false');
      }
    } else {
      await databaseManager.saveCondition({ ...condition, creDtTm: nowDateTime, tenantId });
    }

    await saveConditionEdges(condition.prsptv, condId, accountIdentifier, condition as ConditionEdge, 'account', tenantId);

    const report = await databaseManager.getAccountConditionsByGraph(condAccountId, condSchemeProprietary, tenantId, condMemberid);

    const retVal = parseConditionAccount(report, tenantId);

    const activeConditionsOnly = { ...retVal, conditions: filterConditions(retVal.conditions) };

    await updateCache(`${tenantId}:${accountIdentifier}`, activeConditionsOnly);

    if (retVal.conditions.length > 1) {
      const message = `${retVal.conditions.length - 1} conditions already exist for the account`;
      loggerService.warn(message);
      loggerService.trace('using env to update active conditions only', 'cache update', `${tenantId}:${accountIdentifier}`);

      return {
        message,
        result: activeConditionsOnly,
      };
    }

    return {
      message: 'New condition was saved successfully.',
      result: activeConditionsOnly,
    };
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error: posting condition for account with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleRefreshCache = async (activeOnly: boolean, tenantId: string, ttl: number): Promise<void> => {
  try {
    const data = (await databaseManager.getConditions(activeOnly, tenantId)) as Array<AccountCondition | EntityCondition>;
    if (data.length > 0) {
      return; // no conditions
    }

    const buf = createSimpleConditionsBuffer(data);

    if (buf) {
      await databaseManager.set(`conditions:expired=${activeOnly}`, buf, ttl);
      loggerService.log('cache updated');
    } else {
      loggerService.error('could not encode data to cache');
    }
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`refreshing cache: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleGetConditionsForAccount = async (
  params: ConditionRequest,
  tenantId: string,
): Promise<{ code: number; result?: string | AccountConditionResponse }> => {
  const fnName = 'getConditionsForAccount';

  loggerService.trace('successfully parsed parameters', fnName, params.id);

  let report: RawConditionResponse[] = [];
  if (params.agt) {
    const accountExist = (await databaseManager.getAccount(params.id, params.schmenm, params.agt, tenantId))!;

    if (!accountExist?.id) {
      return { result: 'Account does not exist in the database', code: 404 };
    }

    report = await databaseManager.getAccountConditionsByGraph(
      params.id,
      params.schmenm,
      tenantId,
      params.agt,
      params.activeonly !== 'yes',
    );
  }

  loggerService.log('called database', fnName, params.id);
  if (!report.length) {
    return { code: 404 };
  }

  const retVal = parseConditionAccount(report, tenantId);

  if (!retVal.conditions.length) {
    return { code: 204 };
  }

  // Updating cache based on the synccache parameter
  // all - update all conditions
  // active - update only active conditions
  // default - use env variable ACTIVE_CONDITIONS_ONLY
  // no - do not update cache
  // default - use env variable ACTIVE_CONDITIONS_ONLY
  const cacheKey = `${tenantId}:${params.id}${params.schmenm}${params.agt}`;
  switch (params.synccache) {
    case 'all':
      loggerService.trace('syncCache=all option specified', 'cache update', cacheKey);
      await updateCache(cacheKey, retVal);
      break;
    case 'active':
      loggerService.trace('syncCache=active option specified', 'cache update', cacheKey);
      await updateCache(cacheKey, { ...retVal, conditions: filterConditions(retVal.conditions) });
      break;
    case 'default':
      // use env
      loggerService.trace('syncCache=default option specified', 'cache update', cacheKey);
      if (configuration.ACTIVE_CONDITIONS_ONLY) {
        loggerService.trace('using env to update active conditions only', 'cache update', cacheKey);
        await updateCache(cacheKey, { ...retVal, conditions: filterConditions(retVal.conditions) });
      } else {
        loggerService.trace('using env to update all conditions', 'cache update', cacheKey);
        await updateCache(cacheKey, retVal);
      }
      break;
    default:
      loggerService.trace('syncCache=no/default option specified');
      break;
  }

  return { result: retVal, code: 200 };
};

export const handleUpdateExpiryDateForConditionsOfAccount = async (
  params: ConditionRequest,
  tenantId: string,
  xprtnDtTm?: string,
): Promise<{ code: number; message: string }> => {
  const expireDateResult = validateAndParseExpirationDate(xprtnDtTm);

  if (!expireDateResult.isValid) {
    loggerService.error(expireDateResult.message);
    return { code: 400, message: expireDateResult.message };
  }

  let report: RawConditionResponse[] = [];
  if (params.agt) {
    report = await databaseManager.getAccountConditionsByGraph(params.id, params.schmenm, tenantId, params.agt);
  }

  if (!report.length) {
    return { code: 404, message: 'No records were found in the database using the provided data.' };
  }

  const resultByEdge = report[0];

  if (!resultByEdge.governed_as_creditor_account_by.length && !resultByEdge.governed_as_debtor_account_by.length) {
    return { code: 404, message: 'Active conditions do not exist for this particular account in the database.' };
  }

  const creditorByEdge = resultByEdge.governed_as_creditor_account_by.filter((eachResult) => eachResult.condition.condId === params.condid);
  const debtorByEdge = resultByEdge.governed_as_debtor_account_by.filter((eachResult) => eachResult.condition.condId === params.condid);

  if (
    !creditorByEdge.some((eachDocument) => eachDocument.condition.condId) &&
    !debtorByEdge.some((eachDocument) => eachDocument.condition.condId)
  ) {
    return { code: 404, message: 'Condition does not exist in the database.' };
  }

  if (
    creditorByEdge.some((eachDocument) => eachDocument.condition.xprtnDtTm) ||
    debtorByEdge.some((eachDocument) => eachDocument.condition.xprtnDtTm)
  ) {
    return {
      code: 405,
      message: `Update failed - condition ${params.condid} already contains an expiration date ${creditorByEdge[0].condition.xprtnDtTm}`,
    };
  }
  const creditorByEdgeE = creditorByEdge as unknown as Edge[];
  const debtorByEdgeE = creditorByEdge as unknown as Edge[];

  if (!creditorByEdgeE.some((eachDocument) => eachDocument.id) && !debtorByEdgeE.some((eachDocument) => eachDocument.id)) {
    return { code: 404, message: 'Account does not exist in the database.' };
  }

  if (creditorByEdgeE[0]) {
    await databaseManager.updateExpiryDateOfCreditorAccountEdges(
      creditorByEdgeE[0]?.source,
      creditorByEdgeE[0]?.destination,
      expireDateResult.dateStr,
      tenantId,
    );
  }

  if (debtorByEdgeE[0]) {
    await databaseManager.updateExpiryDateOfDebtorAccountEdges(
      debtorByEdgeE[0]?.source,
      debtorByEdgeE[0]?.destination,
      expireDateResult.dateStr,
      tenantId,
    );
  }

  if (params.condid) {
    await databaseManager.updateCondition(params.condid, expireDateResult.dateStr, tenantId);
  }

  let updatedReport: RawConditionResponse[] = [];
  if (params.agt) {
    updatedReport = await databaseManager.getAccountConditionsByGraph(params.id, params.schmenm, tenantId, params.agt, true);
  }
  const retVal = parseConditionAccount(updatedReport, tenantId);

  const activeConditionsOnly = { ...retVal, conditions: filterConditions(retVal.conditions) };

  const cacheKey = `${tenantId}:${params.id}${params.schmenm}${params.agt}`;
  await updateCache(cacheKey, activeConditionsOnly);

  return { code: 200, message: '' };
};
