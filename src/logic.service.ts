// SPDX-License-Identifier: Apache-2.0
import { databaseManager, loggerService } from '.';
import { type Report } from './interfaces/report.interface';
import { aql } from '@frmscoe/frms-coe-lib';
import { unwrap } from '@frmscoe/frms-coe-lib/lib/helpers/unwrap';
import apm from './apm';

export const handleGetReportRequestByMsgId = async (msgid: string): Promise<Report | undefined> => {
  try {
    loggerService.log(`Started handling get request by message id the message id is ${msgid}`);
    const messageid = aql`${msgid}`;

    const queryString = aql`FOR doc IN transactions
    FILTER doc.transactionID == ${messageid}
    RETURN doc`;

    loggerService.log('Requesting report by message id from database service');
    const spanQueryTransactions = apm.startSpan('db.query.transactions');
    const report = (await (await databaseManager._transaction.query(queryString)).batches.all()) as Report[][];
    spanQueryTransactions?.end();

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
