// SPDX-License-Identifier: Apache-2.0
import { unwrap } from '@tazama-lf/frms-coe-lib/lib/helpers/unwrap';
import { databaseManager, loggerService } from '..';
import type { Report } from '../interface/report.interface';

export const handleGetReportRequestByMsgId = async (msgid: string, tenantId: string): Promise<Report | undefined> => {
  let unWrappedReport;
  try {
    loggerService.log(`Started handling get request by message id the message id is ${msgid} for tenant ${tenantId}`);

    const report = (await databaseManager.getReportByMessageId(msgid, tenantId)) as Report[][];
    unWrappedReport = unwrap<Report>(report);
    if (!unWrappedReport) {
      loggerService.log(`Report not found for msgid ${msgid} and tenant ${tenantId}`);
      return undefined;
    }
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
