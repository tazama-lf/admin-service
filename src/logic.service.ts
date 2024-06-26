// SPDX-License-Identifier: Apache-2.0
import { databaseManager } from '.';
import { unwrap } from '@frmscoe/frms-coe-lib/lib/helpers/unwrap';
import { type Report } from './interface/report.interface';

export const handleGetReportRequestByMsgId = async (msgid: string): Promise<Report | undefined> => {
  try {
    const report = (await databaseManager.getReportByMessageId('transactions', msgid)) as Report[][];
    const unWrappedReport = unwrap<Report>(report);

    return unWrappedReport;
  } catch (error) {
    const errorMessage = error as { message: string };

    throw new Error(errorMessage.message);
  }
};
