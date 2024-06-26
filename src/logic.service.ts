// SPDX-License-Identifier: Apache-2.0
import apm from './apm';
import { databaseManager, loggerService } from '.';
import { type Report } from './interfaces/report.interface';
import { unwrap } from '@frmscoe/frms-coe-lib/lib/helpers/unwrap';

export const handleGetReportRequestByMsgId = async (msgid: string): Promise<Report | undefined> => {
  try {
    loggerService.log(`Started handling get request by message id the message id is ${msgid}`);

    loggerService.log('Requesting report by message id from database service');
    const spanQueryTransactions = apm.startSpan('db.query.transactions');
    const report = (await databaseManager.getReportByMessageId('transactions', msgid)) as Report[][];
    const unWrappedReport = unwrap<Report>(report);
    spanQueryTransactions?.end();

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
