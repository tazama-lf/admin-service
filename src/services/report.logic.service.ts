// SPDX-License-Identifier: Apache-2.0
import { unwrap } from '@tazama-lf/frms-coe-lib/lib/helpers/unwrap';
import { databaseManager, loggerService } from '..';
import type { Report } from '../interface/report.interface';

export const handleGetReportRequestByMsgId = async (msgid: string, tenantId: string): Promise<Report | undefined> => {
  let unWrappedReport;
  try {
    loggerService.log(`Started handling get request by message id the message id is ${msgid} for tenant ${tenantId}`);

    // Use the updated frms-coe-lib getReportByMessageId method with tenantId support
    const report = (await databaseManager.getReportByMessageId(msgid, tenantId)) as Report[][];

    unWrappedReport = unwrap<Report>(report);

    // Additional tenant access control validation
    if (unWrappedReport) {
      const reportTenantId = 'tenantId' in unWrappedReport ? (unWrappedReport as Report & { tenantId?: string }).tenantId : undefined;

      // Check if report has tenant context
      if (reportTenantId === undefined) {
        // Allow access only for default tenant when no tenant context exists
        if (tenantId !== 'default') {
          loggerService.log(`Access denied: Report ${msgid} has no tenant context, requested by tenant ${tenantId}`);
          throw new Error('Access denied: Report not found or access forbidden');
        }
      } else {
        // Check if requesting tenant matches report tenant
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
