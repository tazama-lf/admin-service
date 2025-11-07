// SPDX-License-Identifier: Apache-2.0
import type { NetworkMap, Pacs002 } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import type { Alert } from '@tazama-lf/frms-coe-lib/lib/interfaces/processor-files/Alert';

export interface Report {
  transactionID: string;
  transaction: Pacs002;
  networkMap: NetworkMap;
  alert: Alert;
  tenantId: string;
}
