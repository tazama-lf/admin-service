import { databaseManager, loggerService } from '../../src/';
import { unwrap } from '@frmscoe/frms-coe-lib/lib/helpers/unwrap';
import { handleGetReportRequestByMsgId } from '../../src/logic.service';

// Mock the module
jest.mock('../../src/', () => ({
  databaseManager: {
    getReportByMessageId: jest.fn(), // Ensure the mock function is typed correctly
  },
  loggerService: {
    log: jest.fn(),
  },
}));

jest.mock('@frmscoe/frms-coe-lib/lib/helpers/unwrap', () => ({
  unwrap: jest.fn(),
}));

describe('handleGetReportRequestByMsgId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully retrieve and unwrap the report', async () => {
    const mockReport = [
      {
        /* mock report data */
      },
    ];
    // Ensure getReportByMessageId is typed as a Jest mock function
    (databaseManager.getReportByMessageId as jest.Mock).mockResolvedValue(mockReport);
    (unwrap as jest.Mock).mockReturnValue(mockReport);

    const msgid = 'test-msg-id';
    const result = await handleGetReportRequestByMsgId(msgid);

    expect(databaseManager.getReportByMessageId).toHaveBeenCalledWith('transactions', msgid);
    expect(unwrap).toHaveBeenCalledWith(mockReport);
    expect(result).toBe(mockReport);
    expect(loggerService.log).toHaveBeenCalledWith(`Started handling get request by message id the message id is ${msgid}`);
    expect(loggerService.log).toHaveBeenCalledWith('Completed handling get report by message id');
  });

  it('should log and throw an error if the database query fails', async () => {
    const errorMessage = 'Database error';
    (databaseManager.getReportByMessageId as jest.Mock).mockRejectedValue(new Error(errorMessage));

    const msgid = 'test-msg-id';
    await expect(handleGetReportRequestByMsgId(msgid)).rejects.toThrow(errorMessage);

    expect(databaseManager.getReportByMessageId).toHaveBeenCalledWith('transactions', msgid);
    expect(loggerService.log).toHaveBeenCalledWith(
      `Failed fetching report from database service with error message: ${errorMessage}`,
      'handleGetReportRequestByMsgId()',
    );
    expect(loggerService.log).toHaveBeenCalledWith('Completed handling get report by message id');
  });

  it('should log "Completed handling get report by message id" when the operation is successful', async () => {
    const mockReport = [
      {
        /* mock report data */
      },
    ];
    (databaseManager.getReportByMessageId as jest.Mock).mockResolvedValue(mockReport);
    (unwrap as jest.Mock).mockReturnValue(mockReport);

    const msgid = 'test-msg-id';
    await handleGetReportRequestByMsgId(msgid);

    expect(loggerService.log).toHaveBeenCalledWith('Completed handling get report by message id');
  });

  it('should log "Completed handling get report by message id" even when an error occurs', async () => {
    const errorMessage = 'Database error';
    (databaseManager.getReportByMessageId as jest.Mock).mockRejectedValue(new Error(errorMessage));

    const msgid = 'test-msg-id';
    try {
      await handleGetReportRequestByMsgId(msgid);
    } catch (e) {
      // Expected to throw an error
    }

    expect(loggerService.log).toHaveBeenCalledWith('Completed handling get report by message id');
  });
});
