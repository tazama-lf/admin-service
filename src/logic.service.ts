// SPDX-License-Identifier: Apache-2.0
import { databaseManager, loggerService } from '.';
import { unwrap } from '@frmscoe/frms-coe-lib/lib/helpers/unwrap';
import { type Report } from './interface/report.interface';
import { type EntityCondition } from '@frmscoe/frms-coe-lib/lib/interfaces';

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

    const alreadyExistingCondition = (await databaseManager.getConditionsByEntity(condition.ntty)) as EntityCondition[];

    const { _id: condId } = (await databaseManager.saveCondition({ ...condition, creDtTm: new Date().toISOString() })) as { _id: string };

    const alreadyExistingEntity = (await databaseManager.getEntity(condition.ntty)) as Array<{ _id: string }>;

    let entityId = '';

    if (!alreadyExistingEntity) {
      if (condition.forceCret) {
        const entityIdentifier = `${condition.ntty.Id + condition.ntty.SchmeNm.Prtry}`;
        const nowDateTime = new Date().toISOString();
        try {
          entityId = ((await databaseManager.saveEntity(entityIdentifier, nowDateTime)) as { _id: string })._id;
        } catch (err) {
          throw Error((err as { message: string }).message);
        }
        loggerService.log('New entity was added after not being found while forceCret was set to true');
      } else {
        throw Error('Error: entity was not found and we could not create one because forceCret is set to false');
      }
    } else {
      if (alreadyExistingEntity && alreadyExistingEntity.length > 1) {
        const message = `${alreadyExistingEntity.length} entities were found with the matching id`;
        loggerService.error(message);
        throw Error(message);
      }
      entityId = alreadyExistingEntity[0]._id;
    }

    switch (condition.prsptv) {
      case 'both':
        await Promise.all([
          databaseManager.governedAsCreditorBy(condId, entityId, condition),
          databaseManager.governedAsDebtorBy(condId, entityId, condition),
        ]);
        break;
      case 'debtor':
        await databaseManager.governedAsDebtorBy(condId, entityId, condition);
        break;
      case 'creditor':
        await databaseManager.governedAsCreditorBy(condId, entityId, condition);
        break;
    }

    if (alreadyExistingCondition && alreadyExistingCondition.length > -1) {
      const message = `${alreadyExistingCondition.length} conditions already exist for the entity`;
      loggerService.warn(message);
      return {
        message,
        condition: alreadyExistingCondition,
      };
    }

    return {
      message: 'New condtions was saved successfully.',
      condition,
    };
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.log(`Failed posting condition for entity with error message: ${errorMessage.message}`);
    throw new Error(errorMessage.message);
  }
};
