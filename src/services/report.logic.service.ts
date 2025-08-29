// SPDX-License-Identifier: Apache-2.0
import { unwrap } from '@tazama-lf/frms-coe-lib/lib/helpers/unwrap';
import { databaseManager, loggerService } from '..';
import type { Report } from '../interface/report.interface';

export const handleGetReportRequestByMsgId = async (msgid: string, tenantId: string): Promise<Report | undefined> => {
  let unWrappedReport;
  try {
    loggerService.log(`Started handling get request by message id the message id is ${msgid} for tenant ${tenantId}`);

    // ...existing code...
    const report = (await databaseManager.getReportByMessageId(msgid, tenantId)) as Report[][];

    unWrappedReport = unwrap<Report>(report);

    // ...existing code...
    if (unWrappedReport) {
      const reportTenantId = 'tenantId' in unWrappedReport ? (unWrappedReport as Report & { tenantId?: string }).tenantId : undefined;

      // ...existing code...
      if (reportTenantId === undefined) {
        // ...existing code...
        if (tenantId !== 'default') {
          loggerService.log(`Access denied: Report ${msgid} has no tenant context, requested by tenant ${tenantId}`);
          throw new Error('Access denied: Report not found or access forbidden');
        }
      } else {
        // ...existing code...
        if (reportTenantId !== tenantId) {
          loggerService.log(`Access denied: Report ${msgid} belongs to tenant ${reportTenantId}, requested by tenant ${tenantId}`);
          throw new Error('Access denied: Report not found or access forbidden');
        }
      }
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
