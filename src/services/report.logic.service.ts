// SPDX-License-Identifier: Apache-2.0
// import { unwrap } from '@tazama-lf/frms-coe-lib/lib/helpers/unwrap';
import type { Evaluation } from '@tazama-lf/frms-coe-lib/lib/interfaces/processor-files/TADPReport';
import { databaseManager, loggerService } from '..';

export const handleGetReportRequestByMsgId = async (msgid: string): Promise<Evaluation | undefined> => {
  let report;
  try {
    loggerService.log(`Started handling get request by message id the message id is ${msgid}`);

    report = (await databaseManager.getReportByMessageId(msgid))!;
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
  return report;
};
