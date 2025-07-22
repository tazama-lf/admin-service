// SPDX-License-Identifier: Apache-2.0
import { unwrap } from '@tazama-lf/frms-coe-lib/lib/helpers/unwrap';
import { databaseManager, loggerService } from '..';
import type { Report } from '../interface/report.interface';

export const handleGetReportRequestByMsgId = async (msgid: string): Promise<Report | undefined> => {
  let unWrappedReport;
  try {
    loggerService.log(`Started handling get request by message id the message id is ${msgid}`);

    const report = (await databaseManager.getReportByMessageId(msgid)) as Report[][];

    unWrappedReport = unwrap<Report>(report);
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
  return unWrappedReport;
};
