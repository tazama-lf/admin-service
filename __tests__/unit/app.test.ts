// SPDX-License-Identifier: Apache-2.0
import { databaseManager, loggerService } from '../../src/';
import { unwrap } from '@frmscoe/frms-coe-lib/lib/helpers/unwrap';
import { handleGetConditionsForEntity, handleGetReportRequestByMsgId, handlePostConditionEntity } from '../../src/logic.service';
import { EntityCondition } from '@frmscoe/frms-coe-lib/lib/interfaces';
import { BatchedArrayCursor } from 'arangojs/cursor';

jest.mock('@frmscoe/frms-coe-lib', () => {
  const original = jest.requireActual('@frmscoe/frms-coe-lib');

  return {
    ...original,
    aql: jest.fn().mockImplementation((templateLiteral) => {
      // Return a mock query object or a string representation of the query
      return {
        query: templateLiteral,
      };
    }),
  };
});
// Mock the module
jest.mock('../../src/', () => ({
  databaseManager: {
    getReportByMessageId: jest.fn(), // Ensure the mock function is typed correctly
    getConditionsByEntity: jest.fn(),
    getConditionsByEntityGraph: jest.fn(),
    getEntity: jest.fn(),
    saveCondition: jest.fn(),
    saveEntity: jest.fn(),
    set: jest.fn(),
    saveGovernedAsCreditorByEdge: jest.fn(),
    saveGovernedAsDebtorByEdge: jest.fn(),
    addOneGetCount: jest.fn(),
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

    jest.spyOn(databaseManager, 'getEntity').mockImplementation(() => {
      return Promise.resolve(
        [[]], // No existing entity
      );
    });

    jest.spyOn(databaseManager, 'getConditionsByEntity').mockImplementation(() => {
      return Promise.resolve([[]]);
    });

    jest.spyOn(databaseManager, 'saveCondition').mockImplementation(() => {
      return Promise.resolve({ _id: 'cond123' });
    });

    jest.spyOn(databaseManager, 'saveEntity').mockImplementation(() => {
      return Promise.resolve({ _id: 'entity456' });
    });

    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(fixedDate);
  });

  it('should handle a successful post request for a new entity', async () => {
    jest.spyOn(databaseManager, 'saveEntity').mockImplementation(() => {
      return Promise.resolve({ _id: 'entity456' });
    });

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
    jest.spyOn(databaseManager, 'getEntity').mockImplementation(() => {
      return Promise.resolve([[{ _id: existingEntityId }]]);
    });

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

    // Act
    const result = await handlePostConditionEntity(conditionCreditor);

    // Assert
    expect(databaseManager.saveCondition).toHaveBeenCalledWith(
      expect.objectContaining({
        ...conditionCreditor,
        creDtTm: nowDateTime,
      }),
    );
    expect(databaseManager.saveGovernedAsCreditorByEdge).toHaveBeenCalledWith('cond123', 'entity456', conditionCreditor);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      condition: conditionCreditor,
    });
  });

  it('should throw an error if entity is not found and forceCret is false', async () => {
    // Arrange
    const conditionWithoutForceCret = { ...sampleCondition, forceCret: false };

    // Act & Assert
    await expect(handlePostConditionEntity(conditionWithoutForceCret)).rejects.toThrow(
      'Error: entity was not found and we could not create one because forceCret is set to false',
    );
  });

  it('should log a warning if conditions already exist for the entity', async () => {
    // Arrange
    const existingConditions = [[{ condition: 'cond1' }, { condition: 'cond2' }]];

    jest.spyOn(databaseManager, 'getConditionsByEntity').mockImplementation(() => {
      return Promise.resolve(existingConditions);
    });
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

    jest.spyOn(databaseManager, 'saveCondition').mockImplementation(() => {
      return Promise.reject(error);
    });

    // Act & Assert
    await expect(handlePostConditionEntity(sampleCondition)).rejects.toThrow('Database error');
    expect(loggerService.log).toHaveBeenCalledWith(
      'Error: posting condition for entity with error message: Error: while trying to save new entity: Database error',
    );
  });
});

describe('getConditionForEntity', () => {
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
  const entityResponse = {
    ntty: {
      id: '+27733161225',
      schmeNm: {
        prtry: 'MSISDN',
      },
    },
    conditions: [
      {
        condId: '13480',
        condTp: 'overridable-block',
        incptnDtTm: '2024-08-16T24:00:00.999Z',
        xprtnDtTm: '2024-08-17T24:00:00.999Z',
        condRsn: 'R001',
        usr: 'bob',
        creDtTm: '2024-08-16T08:04:37.701Z',
        prsptvs: [
          {
            prsptv: 'governed_as_creditor_by',
            evtTp: ['pacs.008.01.10'],
            incptnDtTm: '2024-08-16T24:00:00.999Z',
            xprtnDtTm: '2024-08-17T24:00:00.999Z',
          },
          {
            prsptv: 'governed_as_debtor_by',
            evtTp: ['pacs.008.01.10'],
            incptnDtTm: '2024-08-16T24:00:00.999Z',
            xprtnDtTm: '2024-08-17T24:00:00.999Z',
          },
        ],
      },
    ],
  };
  const rawResponse = {
    governed_as_creditor_by: [
      {
        edge: {
          _key: '13480+27733161225MSISDN',
          _id: 'governed_as_creditor_by/13480+27733161225MSISDN',
          _from: 'entities/+27733161225MSISDN',
          _to: 'conditions/13480',
          _rev: '_iTm1jLS---',
          evtTp: ['pacs.008.01.10'],
          incptnDtTm: '2024-08-16T24:00:00.999Z',
          xprtnDtTm: '2024-08-17T24:00:00.999Z',
        },
        entity: {
          _key: '+27733161225MSISDN',
          _id: 'entities/+27733161225MSISDN',
          _rev: '_iTm1jLG---',
          Id: '+27733161225MSISDN',
          CreDtTm: '2024-08-16T08:04:37.701Z',
        },
        condition: {
          _key: '13480',
          _id: 'conditions/13480',
          _rev: '_iTm1jK6---',
          evtTp: ['pacs.008.01.10'],
          condTp: 'overridable-block',
          prsptv: 'both',
          incptnDtTm: '2024-08-16T24:00:00.999Z',
          xprtnDtTm: '2024-08-17T24:00:00.999Z',
          condRsn: 'R001',
          ntty: {
            id: '+27733161225',
            schmeNm: {
              prtry: 'MSISDN',
            },
          },
          forceCret: true,
          usr: 'bob',
          creDtTm: '2024-08-16T08:04:37.701Z',
        },
      },
    ],
    governed_as_debtor_by: [
      {
        edge: {
          _key: '13480+27733161225MSISDN',
          _id: 'governed_as_debtor_by/13480+27733161225MSISDN',
          _from: 'entities/+27733161225MSISDN',
          _to: 'conditions/13480',
          _rev: '_iTm1jLW---',
          evtTp: ['pacs.008.01.10'],
          incptnDtTm: '2024-08-16T24:00:00.999Z',
          xprtnDtTm: '2024-08-17T24:00:00.999Z',
        },
        entity: {
          _key: '+27733161225MSISDN',
          _id: 'entities/+27733161225MSISDN',
          _rev: '_iTm1jLG---',
          Id: '+27733161225MSISDN',
          CreDtTm: '2024-08-16T08:04:37.701Z',
        },
        condition: {
          _key: '13480',
          _id: 'conditions/13480',
          _rev: '_iTm1jK6---',
          evtTp: ['pacs.008.01.10'],
          condTp: 'overridable-block',
          prsptv: 'both',
          incptnDtTm: '2024-08-16T24:00:00.999Z',
          xprtnDtTm: '2024-08-17T24:00:00.999Z',
          condRsn: 'R001',
          ntty: {
            id: '+27733161225',
            schmeNm: {
              prtry: 'MSISDN',
            },
          },
          forceCret: true,
          usr: 'bob',
          creDtTm: '2024-08-16T08:04:37.701Z',
        },
      },
    ],
  };
  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test

    jest.spyOn(databaseManager, 'getConditionsByEntityGraph').mockImplementation(() => {
      return Promise.resolve([[rawResponse]]);
    });

    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(fixedDate);

    jest.spyOn(databaseManager, 'set').mockImplementation(() => {
      return Promise.resolve(undefined);
    });
  });

  it('should get conditions for entity', async () => {
    const result = await handleGetConditionsForEntity({ id: '', proprietary: '', syncCache: 'no' });
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should get no conditions for entity', async () => {
    jest.spyOn(databaseManager, 'getConditionsByEntityGraph').mockImplementation(() => {
      return Promise.resolve([]);
    });
    const result = await handleGetConditionsForEntity({ id: '', proprietary: '', syncCache: 'no' });
    // Assert
    expect(result).toEqual(undefined);
  });

  it('should get conditions for entity and update cache', async () => {
    const result = await handleGetConditionsForEntity({ id: '', proprietary: '', syncCache: 'active' });
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should prune active conditions for cache', async () => {
    const result = await handleGetConditionsForEntity({ id: '', proprietary: '', syncCache: 'all' });
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should prune active conditions for cache (using env)', async () => {
    const result = await handleGetConditionsForEntity({ id: '', proprietary: '', syncCache: 'default' });
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should skip caching', async () => {
    const result = await handleGetConditionsForEntity({ id: '', proprietary: '' });
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should throw an error', async () => {
    jest.spyOn(databaseManager, 'getConditionsByEntityGraph').mockImplementation(() => {
      return Promise.reject(new Error('something bad happened'));
    });
    const result = await handleGetConditionsForEntity({ id: '', proprietary: '' });

    expect(result).toBe(undefined);
  });
});
