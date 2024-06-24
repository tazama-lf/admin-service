// SPDX-License-Identifier: Apache-2.0

import { type NetworkMap,type Pacs002 } from '@frmscoe/frms-coe-lib/lib/interfaces';
import { type Alert } from '@frmscoe/frms-coe-lib/lib/interfaces/processor-files/Alert';

interface Report {
  transactionID: string,
  transaction: Pacs002,
  networkMap: NetworkMap,
  alert: Alert
}

export const handleGetReportRequestByMsgId = async (msgid: string): Promise<Report> => {

  throw new Error();
};
