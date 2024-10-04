// SPDX-License-Identifier: Apache-2.0
import { unwrap } from '@tazama-lf/frms-coe-lib/lib/helpers/unwrap';
import { databaseManager, loggerService } from '../../src';
import {
  handleGetConditionsForAccount,
  handleGetConditionsForEntity,
  handlePostConditionAccount,
  handlePostConditionEntity,
  handleRefreshCache,
  handleUpdateExpiryDateForConditionsOfAccount,
  handleUpdateExpiryDateForConditionsOfEntity,
} from '../../src/services/event-flow.logic.service';
import {
  accountResponse,
  entityResponse,
  fixedDate,
  rawResponseAccount,
  rawResponseEntity,
  sampleAccountCondition,
  sampleEntityCondition,
  xprtnDtTm,
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

jest.mock('@tazama-lf/frms-coe-lib/lib/helpers/env', () => ({
  validateProcessorConfig: jest.fn().mockReturnValue({
    functionName: 'test-ed',
    nodeEnv: 'test',
  }),
  validateEnvVar: jest.fn().mockReturnValue(''),
  validateDatabaseConfig: jest.fn().mockReturnValue({}),
}));

jest.mock('@tazama-lf/frms-coe-lib/lib/helpers/env/database.config', () => ({
  Database: {
    CONFIGURATION: 'MOCK_DB',
    TRANSACTION: 'MOCK_DB',
  },
}));

// Mock the module
jest.mock('../../src/', () => ({
  databaseManager: {
    getEntityConditionsByGraph: jest.fn(),
    getAccountConditionsByGraph: jest.fn(),
    getEntity: jest.fn(),
    getConditions: jest.fn(),
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

    jest.spyOn(databaseManager, 'set').mockImplementation(() => {
      return Promise.resolve(undefined);
    });

    jest.spyOn(databaseManager, 'saveCondition').mockImplementation(() => {
      return Promise.resolve({ _id: 'cond123' });
    });

    jest.spyOn(databaseManager, 'saveEntity').mockImplementation(() => {
      return Promise.resolve({ _id: 'entity456' });
    });
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
    expect(databaseManager.saveGovernedAsCreditorByEdge).toHaveBeenCalledWith('cond123', 'entity456', sampleEntityCondition);
    expect(databaseManager.saveGovernedAsDebtorByEdge).toHaveBeenCalledWith('cond123', 'entity456', sampleEntityCondition);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      result: entityResponse.result,
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
      result: entityResponse.result,
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
      result: entityResponse.result,
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
      result: entityResponse.result,
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
  });
});

describe('getConditionForEntity', () => {
  beforeEach(() => {
    jest.spyOn(databaseManager, 'getEntityConditionsByGraph').mockImplementation(() => {
      return Promise.resolve([[rawResponseEntity]]);
    });

    jest.spyOn(databaseManager, 'set').mockImplementationOnce(() => {
      return Promise.resolve(undefined);
    });

    jest.spyOn(databaseManager, 'getEntity').mockImplementation(() => {
      return Promise.resolve([[{ _id: 'entity456' }]]);
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('should get conditions for entity', async () => {
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'no' });
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should get no conditions for entity', async () => {
    jest.clearAllMocks();
    jest.spyOn(databaseManager, 'getEntityConditionsByGraph').mockImplementation(() => {
      return Promise.resolve([]);
    });
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'no' });
    // Assert
    expect(result).toEqual({ code: 404 });
  });

  it('should get no entity was found', async () => {
    jest.spyOn(databaseManager, 'getEntity').mockImplementation(() => {
      return Promise.resolve([]);
    });
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'no' });
    // Assert
    expect(result).toEqual({ result: 'Entity does not exist in the database', code: 404 });
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
});

describe('handlePostConditionAccount', () => {
  beforeEach(() => {
    jest.spyOn(databaseManager, 'getAccount').mockImplementation(() => {
      return Promise.resolve(
        [[]], // No existing account
      );
    });

    jest.spyOn(databaseManager, 'getAccountConditionsByGraph').mockImplementation(() => {
      return Promise.resolve([[rawResponseAccount]]);
    });

    jest.spyOn(databaseManager, 'saveCondition').mockImplementation(() => {
      return Promise.resolve({ _id: 'cond123' });
    });

    jest.spyOn(databaseManager, 'saveAccount').mockImplementation(() => {
      return Promise.resolve({ _id: 'account456' });
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('should handle a successful post request for a new account', async () => {
    // Act
    const result = await handlePostConditionAccount(sampleAccountCondition);

    // Assert
    expect(loggerService.log).toHaveBeenCalledWith(
      `Started handling post request of account condition executed by ${sampleAccountCondition.usr}.`,
    );
    expect(databaseManager.saveAccount).toHaveBeenCalledWith(
      `${sampleAccountCondition.acct.id + sampleAccountCondition.acct.schmeNm.prtry + sampleAccountCondition.acct.agt.finInstnId.clrSysMmbId.mmbId}`,
    );
    expect(databaseManager.saveGovernedAsCreditorAccountByEdge).toHaveBeenCalledWith('cond123', 'account456', sampleAccountCondition);
    expect(databaseManager.saveGovernedAsDebtorAccountByEdge).toHaveBeenCalledWith('cond123', 'account456', sampleAccountCondition);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      result: accountResponse.result,
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
      result: accountResponse.result,
    });
  });

  it('should handle a successful post request for a debtor perspective', async () => {
    // Arrange
    const nowDateTime = new Date().toISOString();
    const conditionDebtor = { ...sampleAccountCondition, prsptv: 'debtor' } as AccountCondition;

    // Act
    const result = await handlePostConditionAccount(conditionDebtor);

    // Assert
    expect(databaseManager.saveGovernedAsDebtorAccountByEdge).toHaveBeenCalledWith('cond123', 'account456', conditionDebtor);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      result: accountResponse.result,
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
      result: accountResponse.result,
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

    copyofRawResponseAccount.governed_as_creditor_account_by.push({
      ...copyofRawResponseAccount.governed_as_debtor_account_by[0],
      condition: { ...copyofRawResponseAccount.governed_as_debtor_account_by[0].condition, _key: '1324' },
    });
    copyofRawResponseAccount.governed_as_debtor_account_by.push({
      ...copyofRawResponseAccount.governed_as_debtor_account_by[0],
      condition: { ...copyofRawResponseAccount.governed_as_debtor_account_by[0].condition, _key: '6324' },
    });

    jest.spyOn(databaseManager, 'getAccountConditionsByGraph').mockImplementationOnce(() => {
      return Promise.resolve([[copyofRawResponseAccount]]);
    });

    // Act
    const result = await handlePostConditionAccount(sampleAccountCondition as unknown as AccountCondition);

    // Assert
    expect(loggerService.warn).toHaveBeenCalledWith('2 conditions already exist for the account');
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

    jest.spyOn(databaseManager, 'getAccount').mockImplementation(() => {
      return Promise.resolve([[{ _id: 'account456' }]]);
    });

    jest.spyOn(databaseManager, 'getAccountConditionsByGraph').mockImplementation(() => {
      return Promise.resolve([[rawResponseAccount]]);
    });

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
    expect(result).toEqual({ code: 404 });
  });

  it('should get no account was found', async () => {
    jest.spyOn(databaseManager, 'getAccount').mockImplementation(() => {
      return Promise.resolve([]);
    });
    const result = await handleGetConditionsForAccount({ id: '1010101010', synccache: 'no', schmenm: 'Mxx', agt: 'dfsp001' });
    // Assert
    expect(result).toEqual({ result: 'Account does not exist in the database', code: 404 });
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
});

describe('handleUpdateExpiryDateForConditionsOfAccount', () => {
  const params = { id: '2110', schmenm: 'scheme', agt: 'agent', condid: '2110' };

  beforeEach(() => {
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValueOnce(String(xprtnDtTm));
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
      [{ governed_as_creditor_account_by: [], governed_as_debtor_account_by: [] }],
    ]);

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'Active conditions do not exist for this particular account in the database.',
    });
  });

  it('should return 404 if condition does not exist in the database', async () => {
    (databaseManager.getAccountConditionsByGraph as jest.Mock).mockResolvedValue([
      [{ governed_as_creditor_account_by: [{ condition: { _key: '' } }], governed_as_debtor_account_by: [{ condition: { _key: '' } }] }],
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
          governed_as_creditor_account_by: [{ condition: { _key: '2110', _id: 'test1' }, result: {} }],
          governed_as_debtor_account_by: [{ condition: { _key: '2110', _id: 'test2' }, result: {} }],
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
      message: `Update failed - condition 2110 already contains an expiration date ${xprtnDtTm}`,
    });
  });

  it('should update expiry date and cache when conditions are met', async () => {
    const copyOfAccountRawResponse = rawResponseAccount;
    delete copyOfAccountRawResponse.governed_as_creditor_account_by[0].condition.xprtnDtTm;
    delete copyOfAccountRawResponse.governed_as_debtor_account_by[0].condition.xprtnDtTm;
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

  beforeEach(() => {
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValueOnce(String(xprtnDtTm));
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
      message: `Update failed - condition 2110 already contains an expiration date ${xprtnDtTm}`,
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

describe('handleCacheUpdate', () => {
  const params = { id: '2110', schmenm: 'scheme', condid: '2110' };
  const xprtnDtTm = '2025-09-08T10:00:00.999Z';

  beforeEach(() => {
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValueOnce(xprtnDtTm);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should cache conditions', async () => {
    (databaseManager.getConditions as jest.Mock).mockResolvedValue([
      [
        {
          _key: 'a66e78a0-2508-4fca-aac3-3207d8d2f88b',
          _id: 'conditions/a66e78a0-2508-4fca-aac3-3207d8d2f88b',
          _rev: '_ibU2C8y---',
          evtTp: ['pacs.008.001.10'],
          condTp: 'non-overridable-block',
          prsptv: 'creditor',
          incptnDtTm: '2024-09-10T00:00:00.000Z',
          condRsn: 'R001',
          acct: {
            id: '1010111011',
            schmeNm: {
              prtry: 'Mxx',
            },
            agt: {
              finInstnId: {
                clrSysMmbId: {
                  mmbId: 'dfsp028',
                },
              },
            },
          },
          forceCret: true,
          usr: 'bob',
          creDtTm: '2024-09-09T07:38:16.421Z',
          condId: 'a66e78a0-2508-4fca-aac3-3207d8d2f88b',
        },
        {
          _key: 'c859d422-d67f-454e-aae2-5011b0b16af2',
          _id: 'conditions/c859d422-d67f-454e-aae2-5011b0b16af2',
          _rev: '_ibU2KsK---',
          evtTp: ['pacs.008.001.10'],
          condTp: 'overridable-block',
          prsptv: 'both',
          incptnDtTm: '2024-09-17T21:00:00.999Z',
          condRsn: 'R001',
          ntty: {
            id: '+27733861223',
            schmeNm: {
              prtry: 'MSISDN',
            },
          },
          forceCret: true,
          usr: 'bob',
          creDtTm: '2024-09-09T07:38:24.349Z',
          condId: 'c859d422-d67f-454e-aae2-5011b0b16af2',
        },
        {
          _key: '62b21fc0-5f4f-4f49-9cb0-c69e0123b3ec',
          _id: 'conditions/62b21fc0-5f4f-4f49-9cb0-c69e0123b3ec',
          _rev: '_ibqTs2y---',
          evtTp: ['pacs.008.001.10'],
          condTp: 'overridable-block',
          prsptv: 'both',
          incptnDtTm: '2024-09-17T21:00:00.999Z',
          xprtnDtTm: '2024-10-10T21:00:00.999Z',
          condRsn: 'R001',
          ntty: {
            id: '+27733861223',
            schmeNm: {
              prtry: 'MSISDN',
            },
          },
          forceCret: true,
          usr: 'bob',
          creDtTm: '2024-09-10T08:38:40.265Z',
          condId: '62b21fc0-5f4f-4f49-9cb0-c69e0123b3ec',
        },
      ],
    ]);

    const result = await handleRefreshCache(true, 12);

    expect(result).toBe(undefined);
  });
});
