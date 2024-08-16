// SPDX-License-Identifier: Apache-2.0
import { unwrap } from '@frmscoe/frms-coe-lib/lib/helpers/unwrap';
import { type ConditionEdge, type EntityCondition } from '@frmscoe/frms-coe-lib/lib/interfaces';
import { databaseManager, loggerService } from '.';
import { type Report } from './interface/report.interface';
import checkConditionValidity from './utils/condition-validation';
import { type GetEntityConditions } from './interface/query';
import { configuration } from './config';
import { filterConditions } from './utils/filter-active-conditions';
import { type EntityConditionResponse } from './interface/entity-condition/response-parsed';
import { parseEntityCondition } from './utils/parser/parse-entity-condition';
import { type RawEntityConditionResponse } from '@frmscoe/frms-coe-lib/lib/interfaces/event-flow/EntityConditionEdge';

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

    switch (condition.prsptv) {
      case 'both':
        await Promise.all([
          databaseManager.saveGovernedAsCreditorByEdge(condId, entityId, condition),
          databaseManager.saveGovernedAsDebtorByEdge(condId, entityId, condition),
        ]);
        break;
      case 'debtor':
        await databaseManager.saveGovernedAsDebtorByEdge(condId, entityId, condition);
        break;
      case 'creditor':
        await databaseManager.saveGovernedAsCreditorByEdge(condId, entityId, condition);
        break;
      default:
        throw Error('Error: Please enter a valid perspective. Accepted values are: both, debtor, or creditor.');
    }

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

export const handleGetConditionsForEntity = async (params: GetEntityConditions): Promise<EntityConditionResponse | undefined> => {
  const fnName = 'getConditionsForEntity';
  try {
    loggerService.trace('successfully parsed parameters', fnName, params.id);
    const cacheKey = `entityCond-${params.id}-${params.proprietary}`;

    const report = (await databaseManager.getConditionsByEntityGraph(params.id, params.proprietary)) as RawEntityConditionResponse[][];

    loggerService.log('called database', fnName, params.id);
    if (!report.length || !report[0].length) {
      return; // no conditions
    }

    const retVal = parseEntityCondition(report[0]);

    switch (params.syncCache) {
      case 'all':
        loggerService.trace('syncCache=all option specified', 'cache update', cacheKey);
        await databaseManager.set(cacheKey, JSON.stringify(retVal.conditions), 1000);
        break;
      case 'active':
        loggerService.trace('syncCache=active option specified', 'cache update', cacheKey);
        await databaseManager.set(cacheKey, JSON.stringify(filterConditions(retVal.conditions)), 1000);
        break;
      case 'default':
        // use env
        loggerService.trace('syncCache=default option specified', 'cache update', cacheKey);
        if (configuration.activeConditionsOnly) {
          loggerService.trace('using env to update active conditions only', 'cache update', cacheKey);
          await databaseManager.set(cacheKey, JSON.stringify(filterConditions(retVal.conditions)), 1000);
        } else {
          loggerService.trace('using env to update all conditions', 'cache update', cacheKey);
          await databaseManager.set(cacheKey, JSON.stringify(retVal.conditions), 1000);
        }
        break;
      default:
        loggerService.trace('syncCache=no/default option specified');
        break;
    }

    return parseEntityCondition(report[0]);
  } catch (error) {
    loggerService.error(error as Error);
  }
};
