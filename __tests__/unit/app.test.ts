// SPDX-License-Identifier: Apache-2.0
import { databaseManager, loggerService } from '../../src/';
import { unwrap } from '@frmscoe/frms-coe-lib/lib/helpers/unwrap';
import { handleGetReportRequestByMsgId, handlePostConditionEntity, handlePostConditionAccount } from '../../src/logic.service';
import { EntityCondition, AccountCondition } from '@frmscoe/frms-coe-lib/lib/interfaces';


// Mock the module
jest.mock('../../src/', () => ({
  databaseManager: {
    getReportByMessageId: jest.fn(), // Ensure the mock function is typed correctly
    getConditionsByEntity: jest.fn(),
    getConditionsByAccount: jest.fn(),
    getEntity: jest.fn(),
    getAccount: jest.fn(),
    saveCondition: jest.fn(),
    saveEntity: jest.fn(),
    saveAccount: jest.fn(),
    saveGovernedAsCreditorByEdge: jest.fn(),
    saveGovernedAsDebtorByEdge: jest.fn(),
    addOneGetCount: jest.fn(),
  },
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const fixedDate = '2024-08-06T10:00:00.000Z';

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
    (databaseManager.getReportByMessageId as jest.Mock).mockResolvedValue([mockReport]);
    (unwrap as jest.Mock).mockReturnValue(mockReport);

    const msgid = 'test-msg-id';
    const result = await handleGetReportRequestByMsgId(msgid);

    expect(databaseManager.getReportByMessageId).toHaveBeenCalledWith('transactions', msgid);
    expect(unwrap).toHaveBeenCalledWith([mockReport]);
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

describe('handlePostConditionEntity', () => {
  const sampleCondition: EntityCondition = {
    evtTp: ['pacs.008.01.10', 'pacs.002.01.11'],
    condTp: 'overridable-block',
    prsptv: 'both',
    incptnDtTm: '2024-08-07T24:00:00.999Z',
    xprtnDtTm: '2024-08-08T24:00:00.999Z',
    condRsn: 'R001',
    ntty: {
      id: '+27733161225',
      schmeNm: {
        prtry: 'MSISDN',
      },
    },
    forceCret: true,
    usr: 'bob',
    creDtTm: fixedDate,
  };
  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(fixedDate);
  });

  it('should handle a successful post request for a new entity', async () => {
    // Arrange
    databaseManager.getEntity.mockResolvedValue([[]]); // No existing entity
    databaseManager.saveCondition.mockResolvedValue({ _id: 'cond123' });
    databaseManager.saveEntity.mockResolvedValue({ _id: 'entity456' });
    databaseManager.getConditionsByEntity.mockResolvedValue([[]]); // No existing conditions

    // Act
    const result = await handlePostConditionEntity(sampleCondition);

    // Assert
    expect(loggerService.log).toHaveBeenCalledWith(`Started handling post request of entity condition executed by ${sampleCondition.usr}.`);
    expect(databaseManager.saveCondition).toHaveBeenCalledWith({ ...sampleCondition, creDtTm: fixedDate });
    expect(databaseManager.saveEntity).toHaveBeenCalledWith(`${sampleCondition.ntty.id + sampleCondition.ntty.schmeNm.prtry}`, fixedDate);
    expect(databaseManager.saveGovernedAsCreditorByEdge).toHaveBeenCalledWith('cond123', 'entity456', sampleCondition);
    expect(databaseManager.saveGovernedAsDebtorByEdge).toHaveBeenCalledWith('cond123', 'entity456', sampleCondition);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      condition: sampleCondition,
    });
  });

  it('should handle a case where the entity already exists', async () => {
    // Arrange

    const existingEntityId = 'entity456';
    databaseManager.getEntity.mockResolvedValue([[{ _id: existingEntityId }]]);
    databaseManager.saveCondition.mockResolvedValue({ _id: 'cond123' });
    databaseManager.getConditionsByEntity.mockResolvedValue([[]]); // No existing conditions
    (unwrap as jest.Mock).mockReturnValue({ _id: existingEntityId });

    // Act
    const result = await handlePostConditionEntity(sampleCondition);

    // Assert
    expect(databaseManager.saveGovernedAsCreditorByEdge).toHaveBeenCalledWith('cond123', existingEntityId, sampleCondition);
    expect(databaseManager.saveGovernedAsDebtorByEdge).toHaveBeenCalledWith('cond123', existingEntityId, sampleCondition);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      condition: sampleCondition,
    });
  });

  it('should handle a successful post request for a debtor perspective', async () => {
    // Arrange
    const nowDateTime = new Date().toISOString();
    const conditionDebtor = { ...sampleCondition, prsptv: 'debtor' };
    databaseManager.getEntity.mockResolvedValue([[]]); // No existing entity
    databaseManager.saveCondition.mockResolvedValue({ _id: 'cond123' });
    databaseManager.saveEntity.mockResolvedValue({ _id: 'entity456' });
    databaseManager.getConditionsByEntity.mockResolvedValue([[]]); // No existing conditions

    // Act
    const result = await handlePostConditionEntity(conditionDebtor);

    // Assert
    expect(databaseManager.saveCondition).toHaveBeenCalledWith(
      expect.objectContaining({
        ...conditionDebtor,
        creDtTm: nowDateTime,
      }),
    );
    expect(databaseManager.saveGovernedAsDebtorByEdge).toHaveBeenCalledWith('cond123', 'entity456', conditionDebtor);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      condition: conditionDebtor,
    });
  });

  it('should handle error post request for a unknown perspective', async () => {
    // Arrange
    const conditionDebtor = { ...sampleCondition, prsptv: 'unknown' };
    databaseManager.getEntity.mockResolvedValue([[]]); // No existing entity
    databaseManager.saveCondition.mockResolvedValue({ _id: 'cond123' });
    databaseManager.saveEntity.mockResolvedValue({ _id: 'entity456' });
    databaseManager.getConditionsByEntity.mockResolvedValue([[]]); // No existing conditions

    // Act
    try {
      await handlePostConditionEntity(conditionDebtor);
    } catch (error) {
      console.log(error);
      expect(`${error}`).toEqual('Error: Error: Please enter a valid perspective. Accepted values are: both, debtor, or creditor.');
    }
  });

  it('should handle a successful post request for a creditor perspective', async () => {
    // Arrange
    const nowDateTime = new Date().toISOString();
    const conditionCreditor = { ...sampleCondition, prsptv: 'creditor' };
    databaseManager.getEntity.mockResolvedValue([[]]); // No existing entity
    databaseManager.saveCondition.mockResolvedValue({ _id: 'cond123' });
    databaseManager.saveEntity.mockResolvedValue({ _id: 'account456' });
    databaseManager.getConditionsByEntity.mockResolvedValue([[]]); // No existing conditions

    // Act
    const result = await handlePostConditionEntity(conditionCreditor);

    // Assert
    expect(databaseManager.saveCondition).toHaveBeenCalledWith(
      expect.objectContaining({
        ...conditionCreditor,
        creDtTm: nowDateTime,
      }),
    );

    expect(databaseManager.saveGovernedAsCreditorByEdge).toHaveBeenCalledWith('cond123', 'account456', conditionCreditor);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      condition: conditionCreditor,
    });
  });

  it('should throw an error if entity is not found and forceCret is false', async () => {
    // Arrange
    const conditionWithoutForceCret = { ...sampleCondition, forceCret: false };
    databaseManager.getEntity.mockResolvedValue([[]]); // No existing entity

    // Act & Assert
    await expect(handlePostConditionEntity(conditionWithoutForceCret)).rejects.toThrow(
      'Error: entity was not found and we could not create one because forceCret is set to false',
    );
  });

  it('should log a warning if conditions already exist for the entity', async () => {
    // Arrange
    const existingConditions = [[{ condition: 'cond1' }, { condition: 'cond2' }]];
    databaseManager.getEntity.mockResolvedValue([[{ _id: 'entity456' }]]);
    databaseManager.saveCondition.mockResolvedValue({ _id: 'cond123' });
    databaseManager.getConditionsByEntity.mockResolvedValue(existingConditions);

    // Act
    const result = await handlePostConditionEntity(sampleCondition);

    // Assert
    expect(loggerService.warn).toHaveBeenCalledWith('2 conditions already exist for the entity');
    expect(result).toEqual({
      message: '2 conditions already exist for the entity',
      condition: existingConditions[0],
    });
  });

  it('should log and throw an error when database save fails', async () => {
    // Arrange
    const error = new Error('Database error');
    databaseManager.getEntity.mockResolvedValue([[]]); // No existing entity
    databaseManager.saveCondition.mockRejectedValue(error);

    // Act & Assert
    await expect(handlePostConditionEntity(sampleCondition)).rejects.toThrow('Database error');
    expect(loggerService.log).toHaveBeenCalledWith(
      'Error: posting condition for entity with error message: Error: while trying to save new entity: Database error',
    );
  });
});

describe('handlePostConditionAccount', () => {
  const sampleCondition: AccountCondition = {
    evtTp: ['pacs.008.01.10', 'pacs.002.01.11'],
    condTp: 'non-overridable-block',
    prsptv: 'both',
    incptnDtTm: '2024-09-01T24:00:00.999Z',
    xprtnDtTm: '2024-09-03T24:00:00.999Z',
    condRsn: 'R001',
    acct: {
      id: '1010101012',
      schmeNm: {
        prtry: 'Mxx',
      },
      agt: {
        finInstnId: {
          clrSysMmbId: {
            mmbId: 'dfsp001',
          },
        },
      },
    },
    forceCret: true,
    usr: 'bob',
    creDtTm: fixedDate,
  };
  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(fixedDate);
  });

  it('should handle a successful post request for a new account', async () => {
    // Arrange
    databaseManager.getAccount.mockResolvedValue([[]]); // No existing entity
    databaseManager.saveCondition.mockResolvedValue({ _id: 'cond123' });
    databaseManager.saveAccount.mockResolvedValue({ _id: 'account456' });
    databaseManager.getConditionsByAccount.mockResolvedValue([[]]); // No existing conditions

    // Act
    const result = await handlePostConditionAccount(sampleCondition);

    // Assert
    expect(loggerService.log).toHaveBeenCalledWith(
      `Started handling post request of account condition executed by ${sampleCondition.usr}.`,
    );
    expect(databaseManager.saveCondition).toHaveBeenCalledWith({ ...sampleCondition, creDtTm: fixedDate });
    expect(databaseManager.saveAccount).toHaveBeenCalledWith(
      `${sampleCondition.acct.id + sampleCondition.acct.schmeNm.prtry + sampleCondition.acct.agt.finInstnId.clrSysMmbId.mmbId}`,
    );
    expect(databaseManager.saveGovernedAsCreditorByEdge).toHaveBeenCalledWith('cond123', 'account456', sampleCondition);
    expect(databaseManager.saveGovernedAsDebtorByEdge).toHaveBeenCalledWith('cond123', 'account456', sampleCondition);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      condition: sampleCondition,
    });
  });

  it('should handle a case where the account already exists', async () => {
    // Arrange

    const existingAccountId = 'account456';
    databaseManager.getAccount.mockResolvedValue([[{ _id: existingAccountId }]]);
    databaseManager.saveCondition.mockResolvedValue({ _id: 'cond123' });
    databaseManager.getConditionsByAccount.mockResolvedValue([[]]); // No existing conditions
    (unwrap as jest.Mock).mockReturnValue({ _id: existingAccountId });

    // Act
    const result = await handlePostConditionAccount(sampleCondition);

    // Assert
    expect(databaseManager.saveGovernedAsCreditorByEdge).toHaveBeenCalledWith('cond123', existingAccountId, sampleCondition);
    expect(databaseManager.saveGovernedAsDebtorByEdge).toHaveBeenCalledWith('cond123', existingAccountId, sampleCondition);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      condition: sampleCondition,
    });
  });

  it('should handle a successful post request for a debtor perspective', async () => {
    // Arrange
    const nowDateTime = new Date().toISOString();
    const conditionDebtor = { ...sampleCondition, prsptv: 'debtor' };
    databaseManager.getAccount.mockResolvedValue([[]]); // No existing entity
    databaseManager.saveCondition.mockResolvedValue({ _id: 'cond123' });
    databaseManager.saveAccount.mockResolvedValue({ _id: 'account456' });
    databaseManager.getConditionsByAccount.mockResolvedValue([[]]); // No existing conditions

    // Act
    const result = await handlePostConditionAccount(conditionDebtor);

    // Assert
    expect(databaseManager.saveCondition).toHaveBeenCalledWith(
      expect.objectContaining({
        ...conditionDebtor,
        creDtTm: nowDateTime,
      }),
    );
    expect(databaseManager.saveGovernedAsDebtorByEdge).toHaveBeenCalledWith('cond123', 'account456', conditionDebtor);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      condition: conditionDebtor,
    });
  });

  it('should handle error post request for a unknown perspective', async () => {
    // Arrange
    const conditionDebtor = { ...sampleCondition, prsptv: 'unknown' };
    databaseManager.getAccount.mockResolvedValue([[]]); // No existing entity
    databaseManager.saveCondition.mockResolvedValue({ _id: 'cond123' });
    databaseManager.saveAccount.mockResolvedValue({ _id: 'account456' });
    databaseManager.getConditionsByAccount.mockResolvedValue([[]]); // No existing conditions

    // Act
    try {
      await handlePostConditionAccount(conditionDebtor);
    } catch (error) {
      console.log(error);
      expect(`${error}`).toEqual('Error: Error: Please enter a valid perspective. Accepted values are: both, debtor, or creditor.');
    }
  });

  it('should handle a successful post request for a creditor perspective', async () => {
    // Arrange
    const nowDateTime = new Date().toISOString();
    const conditionCreditor = { ...sampleCondition, prsptv: 'creditor' };
    databaseManager.getAccount.mockResolvedValue([[]]); // No existing entity
    databaseManager.saveCondition.mockResolvedValue({ _id: 'cond123' });
    databaseManager.saveAccount.mockResolvedValue({ _id: 'account456' });
    databaseManager.getConditionsByAccount.mockResolvedValue([[]]); // No existing conditions

    // Act
    const result = await handlePostConditionAccount(conditionCreditor);

    // Assert
    expect(databaseManager.saveCondition).toHaveBeenCalledWith(
      expect.objectContaining({
        ...conditionCreditor,
        creDtTm: nowDateTime,
      }),
    );
    expect(databaseManager.saveGovernedAsCreditorByEdge).toHaveBeenCalledWith('cond123', 'account456', conditionCreditor);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      condition: conditionCreditor,
    });
  });

  it('should throw an error if account is not found and forceCret is false', async () => {
    // Arrange
    const conditionWithoutForceCret = { ...sampleCondition, forceCret: false };
    databaseManager.getAccount.mockResolvedValue([[]]); // No existing entity

    // Act & Assert
    await expect(handlePostConditionAccount(conditionWithoutForceCret)).rejects.toThrow(
      'Error: account was not found and we could not create one because forceCret is set to false',
    );
  });

  it('should log a warning if conditions already exist for the account', async () => {
    // Arrange
    const existingConditions = [[{ condition: 'cond1' }, { condition: 'cond2' }]];
    databaseManager.getAccount.mockResolvedValue([[{ _id: 'account456' }]]);
    databaseManager.saveCondition.mockResolvedValue({ _id: 'cond123' });
    databaseManager.getConditionsByAccount.mockResolvedValue(existingConditions);

    // Act
    const result = await handlePostConditionAccount(sampleCondition);

    // Assert
    expect(loggerService.warn).toHaveBeenCalledWith('2 conditions already exist for the account');
    expect(result).toEqual({
      message: '2 conditions already exist for the account',
      condition: existingConditions[0],
    });
  });

  it('should log and throw an error when database save fails', async () => {
    // Arrange
    const error = new Error('Database error');
    databaseManager.getAccount.mockResolvedValue([[]]); // No existing entity
    databaseManager.saveCondition.mockRejectedValue(error);

    // Act & Assert
    await expect(handlePostConditionAccount(sampleCondition)).rejects.toThrow('Database error');
    expect(loggerService.log).toHaveBeenCalledWith(
      'Error: posting condition for account with error message: Error: while trying to save new account: Database error',
    );
  });
});
