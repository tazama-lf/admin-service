// SPDX-License-Identifier: Apache-2.0
import { createSimpleConditionsBuffer } from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
import { unwrap } from '@tazama-lf/frms-coe-lib/lib/helpers/unwrap';
import { type AccountCondition, type ConditionEdge, type EntityCondition } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import {
  type AccountConditionResponse,
  type EntityConditionResponse,
} from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/ConditionDetails';
import {
  type Account,
  type Entity,
  type RawConditionResponse,
} from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/EntityConditionEdge';
import { configuration, databaseManager, loggerService } from '..';
import { type ConditionRequest } from '../interface/query';
import { checkConditionValidity, validateAndParseExpirationDate } from '../utils/condition-validation';
import { filterConditions } from '../utils/filter-active-conditions';
import { parseConditionAccount, parseConditionEntity } from '../utils/parse-condition';
import { updateCache } from '../utils/update-cache';

const saveConditionEdges = async (
  perspective: string,
  conditionId: string,
  entityAccntId: string,
  condition: ConditionEdge,
  memberType: 'entity' | 'account',
): Promise<void> => {
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
): Promise<{ message: string; result: EntityConditionResponse }> => {
  try {
    loggerService.log(`Started handling post request of entity condition executed by ${condition.usr}.`);

    const nowDateTime = new Date().toISOString();

    checkConditionValidity(condition);

    let condId = '';
    const condEntityId: string = condition.ntty.id;
    const condSchemeProprietary: string = condition.ntty.schmeNm.prtry;

    const alreadyExistingEntity = (await databaseManager.getEntity(condEntityId, condSchemeProprietary)) as Array<Array<{ _id: string }>>;
    let entityId = unwrap<{ _id: string }>(alreadyExistingEntity)?._id;

    if (!entityId) {
      if (condition.forceCret) {
        const entityIdentifier = `${condition.ntty.id + condition.ntty.schmeNm.prtry}`;
        try {
          condId = ((await databaseManager.saveCondition({ ...condition, creDtTm: nowDateTime })) as { _id: string })?._id;
          entityId = ((await databaseManager.saveEntity(entityIdentifier, nowDateTime)) as { _id: string })?._id;
        } catch (err) {
          throw Error('Error: while trying to save new entity: ' + (err as { message: string }).message);
        }
        loggerService.log('New entity was added after not being found while forceCret was set to true');
      } else {
        throw Error('Error: entity was not found and we could not create one because forceCret is set to false');
      }
    } else {
      condId = ((await databaseManager.saveCondition({ ...condition, creDtTm: nowDateTime })) as { _id: string })?._id;
    }

    await saveConditionEdges(condition.prsptv, condId, entityId, condition, 'entity');

    const report = (await databaseManager.getEntityConditionsByGraph(condEntityId, condSchemeProprietary)) as RawConditionResponse[][];

    const retVal = parseConditionEntity(report[0]);

    const activeConditionsOnly = { ...retVal, conditions: filterConditions(retVal.conditions) };

    await updateCache(entityId, activeConditionsOnly);

    if (retVal.conditions && retVal.conditions.length > 1) {
      const message = `${retVal.conditions.length - 1} conditions already exist for the entity`;
      loggerService.warn(message);
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
): Promise<{ code: number; result?: string | EntityConditionResponse }> => {
  const fnName = 'getConditionsForEntity';

  loggerService.trace('successfully parsed parameters', fnName, params.id);
  const accountExist = (await databaseManager.getEntity(params.id, params.schmenm)) as Entity[][];

  if (!accountExist[0] || !accountExist[0][0] || !accountExist[0][0]._id) {
    return { result: 'Entity does not exist in the database', code: 404 };
  }

  const cacheKey = `entities/${params.id}${params.schmenm}`;

  const report = (await databaseManager.getEntityConditionsByGraph(
    params.id,
    params.schmenm,
    !params.retrieveactiveonly,
  )) as RawConditionResponse[][];

  loggerService.log('called database', fnName, params.id);
  if (!report.length || !report[0].length) {
    return { code: 404 };
  }

  const retVal = parseConditionEntity(report[0]);

  if (!retVal.conditions.length) {
    return { code: 204 };
  }

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

  return { code: 200, result: retVal };
};

export const handleUpdateExpiryDateForConditionsOfEntity = async (
  params: ConditionRequest,
  xprtnDtTm?: string,
): Promise<{ code: number; message: string }> => {
  const expireDateResult = validateAndParseExpirationDate(xprtnDtTm);

  if (!expireDateResult.isValid) {
    loggerService.error(expireDateResult.message);
    return { code: 400, message: expireDateResult.message };
  }

  const report = (await databaseManager.getEntityConditionsByGraph(params.id, params.schmenm)) as RawConditionResponse[][];

  if (!report.length || !report[0].length || !report[0][0]) {
    return { code: 404, message: 'No records were found in the database using the provided data.' };
  }

  const resultByEdge = report[0][0];

  if (!resultByEdge.governed_as_creditor_by.length && !resultByEdge.governed_as_debtor_by.length) {
    return { code: 404, message: 'Active conditions do not exist for this particular entity in the database.' };
  }

  const creditorByEdge = resultByEdge.governed_as_creditor_by.filter((eachResult) => eachResult.condition._key === params.condid);
  const debtorByEdge = resultByEdge.governed_as_debtor_by.filter((eachResult) => eachResult.condition._key === params.condid);

  if (
    !creditorByEdge.some((eachDocument) => eachDocument.condition._id) &&
    !debtorByEdge.some((eachDocument) => eachDocument.condition._id)
  ) {
    return { code: 404, message: 'Condition does not exist in the database.' };
  }

  if (!creditorByEdge.some((eachDocument) => eachDocument.result._id) && !debtorByEdge.some((eachDocument) => eachDocument.result._id)) {
    return { code: 404, message: 'Entity does not exist in the database.' };
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

  await databaseManager.updateExpiryDateOfEntityEdges(creditorByEdge[0]?.edge._key, debtorByEdge[0]?.edge._key, expireDateResult.dateStr);

  if (params.condid) await databaseManager.updateCondition(params.condid, expireDateResult.dateStr);

  const updatedReport = (await databaseManager.getEntityConditionsByGraph(params.id, params.schmenm)) as RawConditionResponse[][];

  const retVal = parseConditionEntity(updatedReport[0]);

  const activeConditionsOnly = { ...retVal, conditions: filterConditions(retVal.conditions) };
  const cacheKey = `entities/${params.id}${params.schmenm}`;

  await updateCache(cacheKey, activeConditionsOnly);

  return { code: 200, message: '' };
};

export const handlePostConditionAccount = async (
  condition: AccountCondition,
): Promise<{ message: string; result: AccountConditionResponse }> => {
  try {
    loggerService.log(`Started handling post request of account condition executed by ${condition.usr}.`);

    const nowDateTime = new Date().toISOString();

    checkConditionValidity(condition);

    let condId = '';
    const condAccounntId: string = condition.acct.id;
    const condSchemeProprietary: string = condition.acct.schmeNm.prtry;
    const condMemberid: string = condition.acct.agt.finInstnId.clrSysMmbId.mmbId;

    const alreadyExistingAccount = (await databaseManager.getAccount(condAccounntId, condSchemeProprietary, condMemberid)) as Array<
      Array<{ _id: string }>
    >;
    let accountId = unwrap<{ _id: string }>(alreadyExistingAccount)?._id;

    if (!accountId) {
      if (condition.forceCret) {
        const accountIdentifier = `${condAccounntId}${condSchemeProprietary}${condMemberid}`;
        try {
          condId = ((await databaseManager.saveCondition({ ...condition, creDtTm: nowDateTime })) as { _id: string })?._id;
          accountId = ((await databaseManager.saveAccount(accountIdentifier)) as { _id: string })?._id;
        } catch (err) {
          throw Error('Error: while trying to save new account: ' + (err as { message: string }).message);
        }
        loggerService.log('New account was added after not being found while forceCret was set to true');
      } else {
        throw Error('Error: account was not found and we could not create one because forceCret is set to false');
      }
    } else {
      condId = ((await databaseManager.saveCondition({ ...condition, creDtTm: nowDateTime })) as { _id: string })?._id;
    }

    await saveConditionEdges(condition.prsptv, condId, accountId, condition as ConditionEdge, 'account');

    const report = (await databaseManager.getAccountConditionsByGraph(
      condAccounntId,
      condSchemeProprietary,
      condMemberid,
    )) as RawConditionResponse[][];

    const retVal = parseConditionAccount(report[0]);

    const activeConditionsOnly = { ...retVal, conditions: filterConditions(retVal.conditions) };

    await updateCache(accountId, activeConditionsOnly);

    if (retVal && retVal.conditions.length > 1) {
      const message = `${retVal.conditions.length - 1} conditions already exist for the account`;
      loggerService.warn(message);
      loggerService.trace('using env to update active conditions only', 'cache update', accountId);

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

export const handleRefreshCache = async (activeOnly: boolean, ttl: number): Promise<void> => {
  try {
    const data = (await databaseManager.getConditions(activeOnly)) as Array<Array<EntityCondition | AccountCondition>>;
    if (!data.length || !data[0].length) {
      return; // no conditions
    }

    const buf = createSimpleConditionsBuffer(data[0]);

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
): Promise<{ code: number; result?: string | AccountConditionResponse }> => {
  const fnName = 'getConditionsForAccount';

  loggerService.trace('successfully parsed parameters', fnName, params.id);
  const cacheKey = `accounts/${params.id}${params.schmenm}${params.agt}`;

  let report: RawConditionResponse[][] = [[]];
  if (params.agt) {
    const accountExist = (await databaseManager.getAccount(params.id, params.schmenm, params.agt)) as Account[][];

    if (!accountExist[0] || !accountExist[0][0] || !accountExist[0][0]._id) {
      return { result: 'Account does not exist in the database', code: 404 };
    }

    report = (await databaseManager.getAccountConditionsByGraph(
      params.id,
      params.schmenm,
      params.agt,
      !params.retrieveactiveonly,
    )) as RawConditionResponse[][];
  }

  loggerService.log('called database', fnName, params.id);
  if (!report.length || !report[0].length) {
    return { code: 404 };
  }

  const retVal = parseConditionAccount(report[0]);

  if (!retVal.conditions.length) {
    return { code: 204 };
  }

  // Updating cache based on the synccache parameter
  // all - update all conditions
  // active - update only active conditions
  // default - use env variable ACTIVE_CONDITIONS_ONLY
  // no - do not update cache
  // default - use env variable ACTIVE_CONDITIONS_ONLY
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
  xprtnDtTm?: string,
): Promise<{ code: number; message: string }> => {
  const expireDateResult = validateAndParseExpirationDate(xprtnDtTm);

  if (!expireDateResult.isValid) {
    loggerService.error(expireDateResult.message);
    return { code: 400, message: expireDateResult.message };
  }

  let report: RawConditionResponse[][] = [[]];
  if (params.agt) {
    report = (await databaseManager.getAccountConditionsByGraph(params.id, params.schmenm, params.agt)) as RawConditionResponse[][];
  }

  if (!report.length || !report[0].length || !report[0][0]) {
    return { code: 404, message: 'No records were found in the database using the provided data.' };
  }

  const resultByEdge = report[0][0];

  if (!resultByEdge.governed_as_creditor_account_by.length && !resultByEdge.governed_as_debtor_account_by.length) {
    return { code: 404, message: 'Active conditions do not exist for this particular account in the database.' };
  }

  const creditorByEdge = resultByEdge.governed_as_creditor_account_by.filter((eachResult) => eachResult.condition._key === params.condid);
  const debtorByEdge = resultByEdge.governed_as_debtor_account_by.filter((eachResult) => eachResult.condition._key === params.condid);

  if (
    !creditorByEdge.some((eachDocument) => eachDocument.condition._id) &&
    !debtorByEdge.some((eachDocument) => eachDocument.condition._id)
  ) {
    return { code: 404, message: 'Condition does not exist in the database.' };
  }

  if (!creditorByEdge.some((eachDocument) => eachDocument.result._id) && !debtorByEdge.some((eachDocument) => eachDocument.result._id)) {
    return { code: 404, message: 'Account does not exist in the database.' };
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

  await databaseManager.updateExpiryDateOfAccountEdges(creditorByEdge[0]?.edge._key, debtorByEdge[0]?.edge._key, expireDateResult.dateStr);

  if (params.condid) await databaseManager.updateCondition(params.condid, expireDateResult.dateStr);

  let updatedReport: RawConditionResponse[][] = [[]];
  if (params.agt) {
    updatedReport = (await databaseManager.getAccountConditionsByGraph(params.id, params.schmenm, params.agt)) as RawConditionResponse[][];
  }
  const retVal = parseConditionAccount(updatedReport[0]);

  const activeConditionsOnly = { ...retVal, conditions: filterConditions(retVal.conditions) };
  const cacheKey = `accounts/${params.id}${params.schmenm}${params.agt}`;

  await updateCache(cacheKey, activeConditionsOnly);

  return { code: 200, message: '' };
};
