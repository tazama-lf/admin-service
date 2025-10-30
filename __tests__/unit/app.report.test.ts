// SPDX-License-Identifier: Apache-2.0
import { databaseManager, loggerService } from '../../src';
import { handleGetReportRequestByMsgId } from '../../src/services/report.logic.service';

jest.mock('@tazama-lf/frms-coe-lib', () => {
  const original = jest.requireActual('@tazama-lf/frms-coe-lib');

  return {
    ...original,
  };
});
// Mock the module
jest.mock('../../src/', () => ({
  databaseManager: {
    getReportByMessageId: jest.fn(),
  },
  configuration: {
    activeConditionsOnly: true,
  },
  loggerService: {
    trace: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('handleGetReportRequestByMsgId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully retrieve and unwrap the report', async () => {
    const mockReport = {
      transactionID: 'test-tx-id',
      tenantId: 'test-tenant', // Add tenant ID to match the test tenant
      /* mock report data */
    };
    // Ensure getReportByMessageId is typed as a Jest mock function
    (databaseManager.getReportByMessageId as jest.Mock).mockResolvedValue(mockReport);

    const msgid = 'test-msg-id';
    const tenantId = 'test-tenant';
    const result = await handleGetReportRequestByMsgId(msgid, tenantId);

    expect(databaseManager.getReportByMessageId).toHaveBeenCalledWith(msgid, tenantId);
    expect(result).toBe(mockReport);
    expect(loggerService.log).toHaveBeenCalledWith(
      `Started handling get request by message id the message id is ${msgid} for tenant ${tenantId}`,
    );
    expect(loggerService.log).toHaveBeenCalledWith('Completed handling get report by message id');
  });

  it('should log and throw an error if the database query fails', async () => {
    const errorMessage = 'Database error';
    (databaseManager.getReportByMessageId as jest.Mock).mockRejectedValue(new Error(errorMessage));

    const msgid = 'test-msg-id';
    const tenantId = 'test-tenant';
    await expect(handleGetReportRequestByMsgId(msgid, tenantId)).rejects.toThrow(errorMessage);

    expect(databaseManager.getReportByMessageId).toHaveBeenCalledWith(msgid, tenantId);
    expect(loggerService.log).toHaveBeenCalledWith(
      `Failed fetching report from database service with error message: ${errorMessage}`,
      'handleGetReportRequestByMsgId()',
    );
    expect(loggerService.log).toHaveBeenCalledWith('Completed handling get report by message id');
  });

  it('should log "Completed handling get report by message id" when the operation is successful', async () => {
    const mockReport = {
      transactionID: 'test-tx-id',
      tenantId: 'test-tenant', // Add tenant ID to match the test tenant
      /* mock report data */
    };
    (databaseManager.getReportByMessageId as jest.Mock).mockResolvedValue(mockReport);

    const msgid = 'test-msg-id';
    const tenantId = 'test-tenant';
    await handleGetReportRequestByMsgId(msgid, tenantId);

    expect(loggerService.log).toHaveBeenCalledWith('Completed handling get report by message id');
  });

  it('should log "Completed handling get report by message id" even when an error occurs', async () => {
    const errorMessage = 'Database error';
    (databaseManager.getReportByMessageId as jest.Mock).mockRejectedValue(new Error(errorMessage));

    const msgid = 'test-msg-id';
    const tenantId = 'test-tenant';
    try {
      await handleGetReportRequestByMsgId(msgid, tenantId);
    } catch (e) {
      // Expected to throw an error
    }

    expect(loggerService.log).toHaveBeenCalledWith('Completed handling get report by message id');
  });

  it('should allow access to report for correct tenant', async () => {
    const mockReport = {
      transactionID: 'test-tx-id',
      tenantId: 'tenant-a',
      /* other mock report data */
    };
    (databaseManager.getReportByMessageId as jest.Mock).mockResolvedValue(mockReport);

    const msgid = 'test-msg-id';
    const tenantId = 'tenant-a';
    const result = await handleGetReportRequestByMsgId(msgid, tenantId);

    expect(result).toBe(mockReport);
    expect(loggerService.log).toHaveBeenCalledWith(
      `Started handling get request by message id the message id is ${msgid} for tenant ${tenantId}`,
    );
  });

  it('should return undefined for wrong tenant (query filters by tenantId)', async () => {
    const mockReport = {
      transactionID: 'test-tx-id',
      tenantId: 'tenant-a',
      /* other mock report data */
    };
    (databaseManager.getReportByMessageId as jest.Mock).mockResolvedValue(undefined); // Simulate query returns nothing for non-default tenant

    const msgid = 'test-msg-id';
    const tenantId = 'tenant-b';

    const result = await handleGetReportRequestByMsgId(msgid, tenantId);
    expect(result).toBeUndefined();
  });

  it('should return undefined for report without tenant context for non-default tenant', async () => {
    const mockReport = {
      transactionID: 'test-tx-id',
      // No tenantId field
      /* other mock report data */
    };
    (databaseManager.getReportByMessageId as jest.Mock).mockResolvedValue(undefined); // Simulate query returns nothing for non-default tenant

    const msgid = 'test-msg-id';
    const tenantId = 'tenant-a';

    const result = await handleGetReportRequestByMsgId(msgid, tenantId);
    expect(result).toBeUndefined();
  });

  it('should allow access to report without tenant context for default tenant', async () => {
    const mockReport = {
      transactionID: 'test-tx-id',
      // No tenantId field
      /* other mock report data */
    };
    (databaseManager.getReportByMessageId as jest.Mock).mockResolvedValue(mockReport);

    const msgid = 'test-msg-id';
    const tenantId = 'default';
    const result = await handleGetReportRequestByMsgId(msgid, tenantId);

    expect(result).toBe(mockReport);
  });
});
