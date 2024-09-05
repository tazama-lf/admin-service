// SPDX-License-Identifier: Apache-2.0
import { unwrap } from '@tazama-lf/frms-coe-lib/lib/helpers/unwrap';
import { databaseManager, loggerService } from '../../src';
import {
  handleGetConditionsForAccount,
  handleGetConditionsForEntity,
  handlePostConditionAccount,
  handlePostConditionEntity,
  handleUpdateExpiryDateForConditionsOfAccount,
  handleUpdateExpiryDateForConditionsOfEntity,
} from '../../src/logic.service';
import {
  accountResponse,
  entityResponse,
  fixedDate,
  rawResponseAccount,
  rawResponseEntity,
  sampleAccountCondition,
  sampleEntityCondition,
} from './test.data';
import { configuration } from '../../src/config';
import { AccountCondition, EntityCondition } from '@tazama-lf/frms-coe-lib/lib/interfaces';

jest.mock('@tazama-lf/frms-coe-lib', () => {
  const original = jest.requireActual('@tazama-lf/frms-coe-lib');
  return {
    ...original,
    aql: jest.fn().mockImplementation((templateLiteral) => {
      return {
        query: templateLiteral,
      };
    }),
  };
});
// Mock the module
jest.mock('../../src/', () => ({
  databaseManager: {
    getEntityConditionsByGraph: jest.fn(),
    getAccountConditionsByGraph: jest.fn(),
    getEntity: jest.fn(),
    getAccount: jest.fn(),
    saveCondition: jest.fn(),
    saveEntity: jest.fn(),
    set: jest.fn(),
    saveAccount: jest.fn(),
    saveGovernedAsCreditorByEdge: jest.fn(),
    saveGovernedAsDebtorByEdge: jest.fn(),
    saveGovernedAsCreditorAccountByEdge: jest.fn(),
    saveGovernedAsDebtorAccountByEdge: jest.fn(),
    addOneGetCount: jest.fn(),
    updateExpiryDateOfAccountEdges: jest.fn(),
    updateExpiryDateOfEntityEdges: jest.fn(),
    updateCondition: jest.fn(),
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

jest.mock('@tazama-lf/frms-coe-lib/lib/helpers/unwrap', () => ({
  unwrap: jest.fn(),
}));

describe('handlePostConditionEntity', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test

    jest.spyOn(databaseManager, 'getEntity').mockImplementation(() => {
      return Promise.resolve(
        [[]], // No existing entity
      );
    });

    jest.spyOn(databaseManager, 'getEntityConditionsByGraph').mockImplementation(() => {
      return Promise.resolve([[rawResponseEntity]]);
    });

    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(fixedDate);

    jest.spyOn(databaseManager, 'set').mockImplementation(() => {
      return Promise.resolve(undefined);
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
    const result = await handlePostConditionEntity(sampleEntityCondition as unknown as EntityCondition);

    // Assert
    expect(loggerService.log).toHaveBeenCalledWith(
      `Started handling post request of entity condition executed by ${sampleEntityCondition.usr}.`,
    );
    expect(databaseManager.saveCondition).toHaveBeenCalledWith({ ...sampleEntityCondition, creDtTm: fixedDate });
    expect(databaseManager.saveEntity).toHaveBeenCalledWith(
      `${sampleEntityCondition.ntty.id + sampleEntityCondition.ntty.schmeNm.prtry}`,
      fixedDate,
    );
    expect(databaseManager.saveGovernedAsCreditorByEdge).toHaveBeenCalledWith('cond123', 'entity456', sampleEntityCondition);
    expect(databaseManager.saveGovernedAsDebtorByEdge).toHaveBeenCalledWith('cond123', 'entity456', sampleEntityCondition);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      result: { conditions: [], ntty: { id: '+27733161225', schmenm: { prtry: 'MSISDN' } } },
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
    const result = await handlePostConditionEntity(sampleEntityCondition as unknown as EntityCondition);

    // Assert
    expect(databaseManager.saveGovernedAsCreditorByEdge).toHaveBeenCalledWith('cond123', existingEntityId, sampleEntityCondition);
    expect(databaseManager.saveGovernedAsDebtorByEdge).toHaveBeenCalledWith('cond123', existingEntityId, sampleEntityCondition);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      result: {
        conditions: [],
        ntty: {
          id: '+27733161225',
          schmenm: {
            prtry: 'MSISDN',
          },
        },
      },
    });
  });

  it('should handle a successful post request for a debtor perspective', async () => {
    // Arrange
    const nowDateTime = new Date().toISOString();
    const conditionDebtor = { ...sampleEntityCondition, prsptv: 'debtor' };

    // Act
    const result = await handlePostConditionEntity(conditionDebtor as unknown as EntityCondition);

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
      result: {
        conditions: [],
        ntty: {
          id: '+27733161225',
          schmenm: {
            prtry: 'MSISDN',
          },
        },
      },
    });
  });

  it('should handle error post request for a unknown perspective', async () => {
    // Arrange
    const conditionDebtor = { ...sampleEntityCondition, prsptv: 'unknown' };

    // Act
    try {
      await handlePostConditionEntity(conditionDebtor as unknown as EntityCondition);
    } catch (error) {
      console.log(error);
      expect(`${error}`).toEqual('Error: Error: Please enter a valid perspective. Accepted values are: both, debtor, or creditor.');
    }
  });

  it('should handle a successful post request for a creditor perspective', async () => {
    // Arrange
    const nowDateTime = new Date().toISOString();
    const conditionCreditor = { ...sampleEntityCondition, prsptv: 'creditor' };

    jest.spyOn(databaseManager, 'saveEntity').mockImplementation(() => {
      return Promise.resolve({ _id: 'account456' });
    });
    // Act
    const result = await handlePostConditionEntity(conditionCreditor as unknown as EntityCondition);

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
      result: {
        conditions: [],
        ntty: {
          id: '+27733161225',
          schmenm: {
            prtry: 'MSISDN',
          },
        },
      },
    });
  });

  it('should throw an error if entity is not found and forceCret is false', async () => {
    // Arrange
    const conditionWithoutForceCret = { ...sampleEntityCondition, forceCret: false };

    // Act & Assert
    await expect(handlePostConditionEntity(conditionWithoutForceCret as unknown as EntityCondition)).rejects.toThrow(
      'Error: entity was not found and we could not create one because forceCret is set to false',
    );
  });

  it('should log and throw an error when database save fails', async () => {
    // Arrange
    const error = new Error('Database error');

    jest.spyOn(databaseManager, 'saveCondition').mockImplementation(() => {
      return Promise.reject(error);
    });

    // Act & Assert
    await expect(handlePostConditionEntity(sampleEntityCondition as unknown as EntityCondition)).rejects.toThrow('Database error');
    expect(loggerService.log).toHaveBeenCalledWith(
      'Error: posting condition for entity with error message: Error: while trying to save new entity: Database error',
    );
  });

  it('should log a warning if conditions already exist for the entity', async () => {
    const copyofRawResponseEntity = JSON.parse(JSON.stringify(rawResponseEntity));

    copyofRawResponseEntity.governed_as_creditor_by.push({
      ...copyofRawResponseEntity.governed_as_debtor_by[0],
      condition: { ...copyofRawResponseEntity.governed_as_debtor_by[0].condition, _key: '1324' },
    });
    copyofRawResponseEntity.governed_as_debtor_by.push({
      ...copyofRawResponseEntity.governed_as_debtor_by[0],
      condition: { ...copyofRawResponseEntity.governed_as_debtor_by[0].condition, _key: '6324' },
    });

    jest.spyOn(databaseManager, 'getEntityConditionsByGraph').mockImplementationOnce(() => {
      return Promise.resolve([[copyofRawResponseEntity]]);
    });

    // Act
    const result = await handlePostConditionEntity(sampleEntityCondition as unknown as EntityCondition);

    // Assert
    expect(loggerService.warn).toHaveBeenCalledWith('2 conditions already exist for the entity');
    expect(result).toEqual({
      message: '2 conditions already exist for the entity',
      result: {
        conditions: [],
        ntty: {
          id: '+27733161225',
          schmenm: {
            prtry: 'MSISDN',
          },
        },
      },
    });
  });
});

describe('getConditionForEntity', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test

    jest.spyOn(databaseManager, 'getEntityConditionsByGraph').mockImplementation(() => {
      return Promise.resolve([[rawResponseEntity]]);
    });

    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(fixedDate);

    jest.spyOn(databaseManager, 'set').mockImplementation(() => {
      return Promise.resolve(undefined);
    });
  });

  it('should get conditions for entity', async () => {
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'no' });
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should get no conditions for entity', async () => {
    jest.spyOn(databaseManager, 'getEntityConditionsByGraph').mockImplementation(() => {
      return Promise.resolve([]);
    });
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'no' });
    // Assert
    expect(result).toEqual(undefined);
  });

  it('should get conditions for entity and update cache', async () => {
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'active' });
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should prune active conditions for cache', async () => {
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'all' });
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should prune active conditions for cache (using env)', async () => {
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'default' });
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should skip caching', async () => {
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '' });
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should sync active condition by using default and environment variable', async () => {
    configuration.activeConditionsOnly = true;
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'default' });
    configuration.activeConditionsOnly = false;
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should throw an error', async () => {
    jest.spyOn(databaseManager, 'getEntityConditionsByGraph').mockImplementation(() => {
      return Promise.reject(new Error('something bad happened'));
    });
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '' });

    expect(result).toBe(undefined);
  });
});

describe('handlePostConditionAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test

    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(fixedDate);

    jest.spyOn(databaseManager, 'getAccount').mockImplementation(() => {
      return Promise.resolve(
        [[]], // No existing account
      );
    });

    jest.spyOn(databaseManager, 'getAccountConditionsByGraph').mockImplementation(() => {
      return Promise.resolve([[rawResponseEntity]]);
    });

    jest.spyOn(databaseManager, 'saveCondition').mockImplementation(() => {
      return Promise.resolve({ _id: 'cond123' });
    });

    jest.spyOn(databaseManager, 'saveAccount').mockImplementation(() => {
      return Promise.resolve({ _id: 'account456' });
    });

    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(fixedDate);
  });

  it('should handle a successful post request for a new account', async () => {
    // Act
    const result = await handlePostConditionAccount(sampleAccountCondition as unknown as AccountCondition);

    // Assert
    expect(loggerService.log).toHaveBeenCalledWith(
      `Started handling post request of account condition executed by ${sampleAccountCondition.usr}.`,
    );
    expect(databaseManager.saveCondition).toHaveBeenCalledWith({ ...sampleAccountCondition, creDtTm: fixedDate });
    expect(databaseManager.saveAccount).toHaveBeenCalledWith(
      `${sampleAccountCondition.acct.id + sampleAccountCondition.acct.schmeNm.prtry + sampleAccountCondition.acct.agt.finInstnId.clrSysMmbId.mmbId}`,
    );
    expect(databaseManager.saveGovernedAsCreditorAccountByEdge).toHaveBeenCalledWith('cond123', 'account456', sampleAccountCondition);
    expect(databaseManager.saveGovernedAsDebtorAccountByEdge).toHaveBeenCalledWith('cond123', 'account456', sampleAccountCondition);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      result: { conditions: [] },
    });
  });

  it('should handle a case where the account already exists', async () => {
    // Arrange

    const existingAccountId = 'account456';
    jest.spyOn(databaseManager, 'getAccount').mockImplementation(() => {
      return Promise.resolve(
        [[{ _id: existingAccountId }]], // No existing account
      );
    });
    (unwrap as jest.Mock).mockReturnValue({ _id: existingAccountId });

    // Act
    const result = await handlePostConditionAccount(sampleAccountCondition as unknown as AccountCondition);

    // Assert
    expect(databaseManager.saveGovernedAsCreditorAccountByEdge).toHaveBeenCalledWith('cond123', existingAccountId, sampleAccountCondition);
    expect(databaseManager.saveGovernedAsDebtorAccountByEdge).toHaveBeenCalledWith('cond123', existingAccountId, sampleAccountCondition);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      result: { conditions: [] },
    });
  });

  it('should handle a successful post request for a debtor perspective', async () => {
    // Arrange
    const nowDateTime = new Date().toISOString();
    const conditionDebtor = { ...sampleAccountCondition, prsptv: 'debtor' };

    // Act
    const result = await handlePostConditionAccount(conditionDebtor as unknown as AccountCondition);

    // Assert
    expect(databaseManager.saveCondition).toHaveBeenCalledWith(
      expect.objectContaining({
        ...conditionDebtor,
        creDtTm: nowDateTime,
      }),
    );
    expect(databaseManager.saveGovernedAsDebtorAccountByEdge).toHaveBeenCalledWith('cond123', 'account456', conditionDebtor);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      result: { conditions: [] },
    });
  });

  it('should handle error post request for a unknown perspective', async () => {
    // Arrange
    const conditionDebtor = { ...sampleAccountCondition, prsptv: 'unknown' };

    // Act
    try {
      await handlePostConditionAccount(conditionDebtor as unknown as AccountCondition);
    } catch (error) {
      console.log(error);
      expect(`${error}`).toEqual('Error: Error: Please enter a valid perspective. Accepted values are: both, debtor, or creditor.');
    }
  });

  it('should handle a successful post request for a creditor perspective', async () => {
    // Arrange
    const nowDateTime = new Date().toISOString();
    const conditionCreditor = { ...sampleAccountCondition, prsptv: 'creditor' };

    // Act
    const result = await handlePostConditionAccount(conditionCreditor as unknown as AccountCondition);

    // Assert
    expect(databaseManager.saveCondition).toHaveBeenCalledWith(
      expect.objectContaining({
        ...conditionCreditor,
        creDtTm: nowDateTime,
      }),
    );
    expect(databaseManager.saveGovernedAsCreditorAccountByEdge).toHaveBeenCalledWith('cond123', 'account456', conditionCreditor);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      result: {
        conditions: [],
      },
    });
  });

  it('should throw an error if account is not found and forceCret is false', async () => {
    // Arrange
    const conditionWithoutForceCret = { ...sampleAccountCondition, forceCret: false };

    // Act & Assert
    await expect(handlePostConditionAccount(conditionWithoutForceCret as unknown as AccountCondition)).rejects.toThrow(
      'Error: account was not found and we could not create one because forceCret is set to false',
    );
  });

  it('should log a warning if conditions already exist for the account', async () => {
    // Arrange
    const copyofRawResponseAccount = JSON.parse(JSON.stringify(rawResponseAccount));

    copyofRawResponseAccount.governed_as_creditor_by.push({
      ...copyofRawResponseAccount.governed_as_debtor_by[0],
      condition: { ...copyofRawResponseAccount.governed_as_debtor_by[0].condition, _key: '1324' },
    });
    copyofRawResponseAccount.governed_as_debtor_by.push({
      ...copyofRawResponseAccount.governed_as_debtor_by[0],
      condition: { ...copyofRawResponseAccount.governed_as_debtor_by[0].condition, _key: '6324' },
    });

    jest.spyOn(databaseManager, 'getAccountConditionsByGraph').mockImplementationOnce(() => {
      return Promise.resolve([[copyofRawResponseAccount]]);
    });

    // Act
    const result = await handlePostConditionAccount(sampleAccountCondition as unknown as AccountCondition);

    // Assert
    expect(loggerService.warn).toHaveBeenCalledWith('2 conditions already exist for the account');
    expect(result).toEqual({
      message: '2 conditions already exist for the account',
      result: {
        acct: {
          agt: {
            finInstnId: {
              clrSysMmbId: {
                mmbId: 'dfsp001',
              },
            },
          },
          id: '1010101010',
          schmenm: {
            prtry: 'Mxx',
          },
        },
        conditions: [],
      },
    });
  });

  it('should handle handle thrown errors when trying to saveConditions', async () => {
    const error = new Error('Database error');
    jest.spyOn(databaseManager, 'saveCondition').mockImplementation(() => {
      return Promise.reject(error);
    });

    // Assert
    await expect(handlePostConditionAccount(sampleAccountCondition as unknown as AccountCondition)).rejects.toThrow('Database error');
  });

  it('should log and throw an error when database save fails', async () => {
    // Arrange
    const error = new Error('Database error');
    jest.spyOn(databaseManager, 'getAccount').mockImplementation(() => {
      return Promise.reject(error);
    });

    // Act & Assert
    await expect(handlePostConditionAccount(sampleAccountCondition as unknown as AccountCondition)).rejects.toThrow('Database error');
    expect(loggerService.error).toHaveBeenCalledWith('Error: posting condition for account with error message: Database error');
  });
});

describe('getConditionForAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test

    jest.spyOn(databaseManager, 'getAccountConditionsByGraph').mockImplementation(() => {
      return Promise.resolve([[rawResponseAccount]]);
    });

    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(fixedDate);

    jest.spyOn(databaseManager, 'set').mockImplementation(() => {
      return Promise.resolve(undefined);
    });
  });

  it('should get conditions for account', async () => {
    const result = await handleGetConditionsForAccount({ id: '1010101010', synccache: 'no', schmenm: 'Mxx', agt: 'dfsp001' });
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should get no conditions for account', async () => {
    jest.spyOn(databaseManager, 'getAccountConditionsByGraph').mockImplementation(() => {
      return Promise.resolve([]);
    });
    const result = await handleGetConditionsForAccount({ id: '1010101010', synccache: 'no', schmenm: 'Mxx', agt: 'dfsp001' });

    // Assert
    expect(result).toEqual(undefined);
  });

  it('should get conditions for account and update cache', async () => {
    const result = await handleGetConditionsForAccount({ id: '1010101010', synccache: 'no', schmenm: 'Mxx', agt: 'dfsp001' });
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should prune active conditions for cache', async () => {
    const result = await handleGetConditionsForAccount({ id: '1010101010', synccache: 'no', schmenm: 'Mxx', agt: 'dfsp001' });
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should prune active conditions for cache (using env)', async () => {
    const result = await handleGetConditionsForAccount({ id: '', schmenm: '', agt: '007', synccache: 'default' });
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should skip caching', async () => {
    const result = await handleGetConditionsForAccount({ id: '', schmenm: '', agt: '008', synccache: 'no' });
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should sync all cache', async () => {
    const result = await handleGetConditionsForAccount({ id: '', schmenm: '', agt: '009', synccache: 'all' });
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should sync active cache by using environment variable', async () => {
    configuration.activeConditionsOnly = true;
    const result = await handleGetConditionsForAccount({ id: '', schmenm: '', agt: '001', synccache: 'default' });
    configuration.activeConditionsOnly = false;
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should sync active cache only', async () => {
    const result = await handleGetConditionsForAccount({ id: '', schmenm: '', agt: '001', synccache: 'active' });
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should throw an error', async () => {
    jest.spyOn(databaseManager, 'getAccountConditionsByGraph').mockImplementation(() => {
      return Promise.reject(new Error('something bad happened'));
    });
    const result = await handleGetConditionsForAccount({ id: '', schmenm: '', agt: '002', synccache: 'no' });

    expect(result).toBe(undefined);
  });
});

describe('handleUpdateExpiryDateForConditionsOfAccount', () => {
  const params = { id: '2110', schmenm: 'scheme', agt: 'agent', condid: '2110' };
  const xprtnDtTm = '2025-10-05T23:00:00.999Z';

  beforeEach(() => {
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(xprtnDtTm);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 404 if no records found in the database', async () => {
    (databaseManager.getAccountConditionsByGraph as jest.Mock).mockResolvedValue([]);

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'No records were found in the database using the provided data.',
    });
  });

  it('should handle when xprtnDtTm is not provided', async () => {
    (databaseManager.getAccountConditionsByGraph as jest.Mock).mockResolvedValue([]);

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, '');

    expect(result).toEqual({
      code: 404,
      message: 'No records were found in the database using the provided data.',
    });
  });

  it('should handle when xprtnDtTm is provided but with invalid date', async () => {
    (databaseManager.getAccountConditionsByGraph as jest.Mock).mockResolvedValue([]);

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, '2024-07-06T50:00:00.999Z');

    expect(result).toEqual({
      code: 400,
      message: 'Expiration time date provided was invalid.',
    });
  });

  it('should return 404 if no active conditions exist for the account', async () => {
    (databaseManager.getAccountConditionsByGraph as jest.Mock).mockResolvedValue([
      [{ governed_as_creditor_by: [], governed_as_debtor_by: [] }],
    ]);

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'Active conditions do not exist for this particular account in the database.',
    });
  });

  it('should return 404 if condition does not exist in the database', async () => {
    (databaseManager.getAccountConditionsByGraph as jest.Mock).mockResolvedValue([
      [{ governed_as_creditor_by: [{ condition: { _key: '' } }], governed_as_debtor_by: [{ condition: { _key: '' } }] }],
    ]);

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'Condition does not exist in the database.',
    });
  });

  it('should return 404 if account does not exist in the database', async () => {
    (databaseManager.getAccountConditionsByGraph as jest.Mock).mockResolvedValue([
      [
        {
          governed_as_creditor_by: [{ condition: { _key: '2110', _id: 'test1' }, result: {} }],
          governed_as_debtor_by: [{ condition: { _key: '2110', _id: 'test2' }, result: {} }],
        },
      ],
    ]);

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'Account does not exist in the database.',
    });
  });

  it('should return 405 if condition already contains an expiration date', async () => {
    (databaseManager.getAccountConditionsByGraph as jest.Mock).mockResolvedValue([[rawResponseAccount]]);

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, xprtnDtTm);

    expect(result).toEqual({
      code: 405,
      message: 'Update failed - condition 2110 already contains an expiration date 2024-08-08T10:00:00.999Z',
    });
  });

  it('should update expiry date and cache when conditions are met', async () => {
    const copyOfAccountRawResponse = rawResponseAccount;
    delete copyOfAccountRawResponse.governed_as_creditor_by[0].condition.xprtnDtTm;
    delete copyOfAccountRawResponse.governed_as_debtor_by[0].condition.xprtnDtTm;
    (databaseManager.getAccountConditionsByGraph as jest.Mock).mockResolvedValue([[copyOfAccountRawResponse]]);
    (databaseManager.updateExpiryDateOfAccountEdges as jest.Mock).mockResolvedValue('test');
    (databaseManager.updateCondition as jest.Mock).mockResolvedValue('test');

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, xprtnDtTm);

    expect(databaseManager.updateExpiryDateOfAccountEdges).toHaveBeenCalledWith(
      '21101010101010Mxxdfsp001',
      '21101010101010Mxxdfsp001',
      xprtnDtTm,
    );
    expect(databaseManager.updateCondition).toHaveBeenCalledWith('2110', xprtnDtTm);

    expect(result).toEqual({ code: 200, message: '' });
  });
});

describe('handleUpdateExpiryDateForConditionsOfEntity', () => {
  const params = { id: '2110', schmenm: 'scheme', condid: '2110' };
  const xprtnDtTm = '2025-09-08T10:00:00.999Z';

  beforeEach(() => {
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(xprtnDtTm);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 404 if no records found in the database', async () => {
    (databaseManager.getEntityConditionsByGraph as jest.Mock).mockResolvedValue([]);

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'No records were found in the database using the provided data.',
    });
  });

  it('should handle when xprtnDtTm is not provided', async () => {
    (databaseManager.getEntityConditionsByGraph as jest.Mock).mockResolvedValue([]);

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, undefined);

    expect(result).toEqual({
      code: 404,
      message: 'No records were found in the database using the provided data.',
    });
  });

  it('should handle when xprtnDtTm is provided but with invalid date', async () => {
    (databaseManager.getEntityConditionsByGraph as jest.Mock).mockResolvedValue([]);

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, '2024-07-06T50:00:00.999Z');

    expect(result).toEqual({
      code: 400,
      message: 'Expiration time date provided was invalid.',
    });
  });

  it('should return 404 if no active conditions exist for the entity', async () => {
    (databaseManager.getEntityConditionsByGraph as jest.Mock).mockResolvedValue([
      [{ governed_as_creditor_by: [], governed_as_debtor_by: [] }],
    ]);

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'Active conditions do not exist for this particular entity in the database.',
    });
  });

  it('should return 404 if condition does not exist in the database', async () => {
    (databaseManager.getEntityConditionsByGraph as jest.Mock).mockResolvedValue([
      [{ governed_as_creditor_by: [{ condition: { _key: '' } }], governed_as_debtor_by: [{ condition: { _key: '' } }] }],
    ]);

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'Condition does not exist in the database.',
    });
  });

  it('should return 404 if entity does not exist in the database', async () => {
    (databaseManager.getEntityConditionsByGraph as jest.Mock).mockResolvedValue([
      [
        {
          governed_as_creditor_by: [{ condition: { _key: '2110', _id: 'test1' }, result: {} }],
          governed_as_debtor_by: [{ condition: { _key: '2110', _id: 'test2' }, result: {} }],
        },
      ],
    ]);

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'Entity does not exist in the database.',
    });
  });

  it('should return 405 if condition already contains an expiration date', async () => {
    (databaseManager.getEntityConditionsByGraph as jest.Mock).mockResolvedValue([[rawResponseEntity]]);

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, xprtnDtTm);

    expect(result).toEqual({
      code: 405,
      message: 'Update failed - condition 2110 already contains an expiration date 2024-08-08T10:00:00.999Z',
    });
  });

  it('should update expiry date and cache when conditions are met', async () => {
    const copyOfEntityRawResponse = rawResponseEntity;
    delete copyOfEntityRawResponse.governed_as_creditor_by[0].condition.xprtnDtTm;
    delete copyOfEntityRawResponse.governed_as_debtor_by[0].condition.xprtnDtTm;
    (databaseManager.getEntityConditionsByGraph as jest.Mock).mockResolvedValue([[copyOfEntityRawResponse]]);
    (databaseManager.updateExpiryDateOfEntityEdges as jest.Mock).mockResolvedValue('test');
    (databaseManager.updateCondition as jest.Mock).mockResolvedValue('test');

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, xprtnDtTm);

    expect(databaseManager.updateExpiryDateOfEntityEdges).toHaveBeenCalledWith(
      '2110+27733161225MSISDN',
      '2110+27733161225MSISDN',
      xprtnDtTm,
    );
    expect(databaseManager.updateCondition).toHaveBeenCalledWith('2110', xprtnDtTm);

    expect(result).toEqual({ code: 200, message: '' });
  });
});
