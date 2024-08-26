// SPDX-License-Identifier: Apache-2.0
import { unwrap } from '@tazama-lf/frms-coe-lib/lib/helpers/unwrap';
import { type AccountCondition, type ConditionEdge, type EntityCondition } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { databaseManager, loggerService } from '.';
import { type Report } from './interface/report.interface';
import checkConditionValidity from './utils/condition-validation';
import { type GetEntityConditions } from './interface/queryEntityCondition';
import { configuration } from './config';
import { filterConditions } from './utils/filter-active-conditions';
import { parseCondition } from './utils/parse-condition';
import { type RawConditionResponse } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/EntityConditionEdge';
import { type ConditionResponse } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/ConditionDetails';
import { type GetAccountConditions } from './interface/queryAccountCondition';
import { updateCache } from './utils/update-cache';

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

export const handleGetReportRequestByMsgId = async (msgid: string): Promise<Report | undefined> => {
  try {
    loggerService.log(`Started handling get request by message id the message id is ${msgid}`);

    const report = (await databaseManager.getReportByMessageId('transactions', msgid)) as Report[][];

    const unWrappedReport = unwrap<Report>(report);

    return unWrappedReport;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.log(
      `Failed fetching report from database service with error message: ${errorMessage.message}`,
      'handleGetReportRequestByMsgId()',
    );
    throw new Error(errorMessage.message);
  } finally {
    loggerService.log('Completed handling get report by message id');
  }
};

export const handlePostConditionEntity = async (condition: EntityCondition): Promise<EntityCondition[] | Record<string, unknown>> => {
  try {
    loggerService.log(`Started handling post request of entity condition executed by ${condition.usr}.`);

    const nowDateTime = new Date().toISOString();

    checkConditionValidity(condition);

    let condId = '';
    const condEntityId: string = condition.ntty.id;
    const condSchemeProprietary: string = condition.ntty.schmeNm.prtry;

    const alreadyExistingCondition = (await databaseManager.getConditionsByEntity(
      condEntityId,
      condSchemeProprietary,
    )) as EntityCondition[][];

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

    await databaseManager.addOneGetCount(entityId, { conditionEdge: condition as ConditionEdge });

    if (
      alreadyExistingCondition &&
      alreadyExistingCondition[0] &&
      alreadyExistingCondition[0][0] &&
      alreadyExistingCondition[0].length > 0
    ) {
      const message = `${alreadyExistingCondition[0].length} conditions already exist for the entity`;
      loggerService.warn(message);
      return {
        message,
        condition: alreadyExistingCondition[0],
      };
    }

    return {
      message: 'New condition was saved successfully.',
      condition,
    };
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.log(`Error: posting condition for entity with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleGetConditionsForEntity = async (params: GetEntityConditions): Promise<ConditionResponse | undefined> => {
  const fnName = 'getConditionsForEntity';
  try {
    loggerService.trace('successfully parsed parameters', fnName, params.id);
    const cacheKey = `entityCond-${params.id}-${params.schmeNm}`;

    const report = (await databaseManager.getEntityConditionsByGraph(params.id, params.schmeNm)) as RawConditionResponse[][];

    loggerService.log('called database', fnName, params.id);
    if (!report.length || !report[0].length) {
      return; // no conditions
    }

    const retVal = parseCondition(report[0]);

    switch (params.syncCache) {
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
        if (configuration.activeConditionsOnly) {
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

    return retVal;
  } catch (error) {
    loggerService.error(error as Error);
  }
};
export const handlePostConditionAccount = async (condition: AccountCondition): Promise<AccountCondition[] | Record<string, unknown>> => {
  try {
    loggerService.log(`Started handling post request of account condition executed by ${condition.usr}.`);

    const nowDateTime = new Date().toISOString();

    checkConditionValidity(condition);

    let condId = '';
    const condAccounntId: string = condition.acct.id;
    const condSchemeProprietary: string = condition.acct.schmeNm.prtry;
    const condMemberid: string = condition.acct.agt.finInstnId.clrSysMmbId.mmbId;

    const alreadyExistingCondition = (await databaseManager.getConditionsByAccount(
      condAccounntId,
      condSchemeProprietary,
      condMemberid,
    )) as AccountCondition[][];

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

    await databaseManager.addOneGetCount(accountId, { conditionEdge: condition as ConditionEdge });

    if (
      alreadyExistingCondition &&
      alreadyExistingCondition[0] &&
      alreadyExistingCondition[0][0] &&
      alreadyExistingCondition[0].length > 0
    ) {
      const message = `${alreadyExistingCondition[0].length} conditions already exist for the account`;
      loggerService.warn(message);
      return {
        message,
        condition: alreadyExistingCondition[0],
      };
    }

    return {
      message: 'New condition was saved successfully.',
      condition,
    };
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error: posting condition for account with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};

export const handleGetConditionsForAccount = async (params: GetAccountConditions): Promise<ConditionResponse | undefined> => {
  const fnName = 'getConditionsForAccount';
  try {
    loggerService.trace('successfully parsed parameters', fnName, params.id);
    const cacheKey = `acctCond-${params.id}-${params.schmeNm}`;

    const report = (await databaseManager.getAccountConditionsByGraph(params.id, params.schmeNm, params.agt)) as RawConditionResponse[][];

    loggerService.log('called database', fnName, params.id);
    if (!report.length || !report[0].length) {
      return; // no conditions
    }

    const retVal = parseCondition(report[0]);

    switch (params.syncCache) {
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
        if (configuration.activeConditionsOnly) {
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

    return retVal;
  } catch (error) {
    loggerService.error(error as Error);
  }
};
