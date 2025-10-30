// SPDX-License-Identifier: Apache-2.0
import { Account, AccountCondition, Entity, EntityCondition, RawConditionResponse } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { configuration, databaseManager, loggerService } from '../../src';
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
  rawResponseAccount,
  rawResponseEntity,
  sampleAccountCondition,
  sampleEntityCondition,
  xprtnDtTm,
} from './test.data';

jest.mock('uuid', () => ({ v4: () => 'cond123' }));

jest.mock('@tazama-lf/frms-coe-lib/lib/services/dbManager', () => ({
  CreateStorageManager: jest
    .fn()
    .mockReturnValue({ db: { getRuleConfig: jest.fn(), isReadyCheck: jest.fn().mockReturnValue({ nodeEnv: 'test' }) } }),
}));

jest.mock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
  validateProcessorConfig: jest.fn().mockReturnValue({ functionName: 'test-rule-executor', nodeEnv: 'test', maxCPU: 1 }),
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
    updateExpiryDateOfCreditorAccountEdges: jest.fn(),
    updateExpiryDateOfDebtorAccountEdges: jest.fn(),
    updateExpiryDateOfCreditorEntityEdges: jest.fn(),
    updateExpiryDateOfDebtorEntityEdges: jest.fn(),
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

describe('handlePostConditionEntity', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test
    jest
      .spyOn(databaseManager, 'getEntity')
      .mockImplementation((entityId: string, schemeProprietary: string): Promise<Entity | undefined> => {
        return Promise.resolve({ id: `${entityId}${schemeProprietary}` } as Entity);
      });

    jest.spyOn(databaseManager, 'getEntityConditionsByGraph').mockImplementation((): Promise<RawConditionResponse[]> => {
      return Promise.resolve([rawResponseEntity] as unknown as RawConditionResponse[]);
    });

    jest.spyOn(databaseManager, 'set').mockImplementation(() => {
      return Promise.resolve(undefined);
    });

    jest.spyOn(databaseManager, 'saveCondition').mockImplementation(() => {
      return Promise.resolve(void '');
    });

    jest.spyOn(databaseManager, 'saveEntity').mockImplementation((_entityId: string, _CreDtTm: string): Promise<void> => {
      return Promise.resolve(void '');
    });
  });

  it('should handle a successful post request for a new entity', async () => {
    jest.spyOn(databaseManager, 'saveEntity').mockImplementation((_entityId: string, _CreDtTm: string): Promise<void> => {
      return Promise.resolve(void '');
    });
    const typedCondition = sampleEntityCondition as EntityCondition;
    // Act
    const result = await handlePostConditionEntity(typedCondition, 'DEFAULT');

    // Assert
    expect(loggerService.log).toHaveBeenCalledWith(
      `Started handling post request of entity condition executed by ${sampleEntityCondition.usr}.`,
    );
    const entityId = `${typedCondition.ntty.id}${typedCondition.ntty.schmeNm.prtry}`;
    expect(databaseManager.saveGovernedAsCreditorByEdge).toHaveBeenCalledWith('cond123', entityId, sampleEntityCondition);
    expect(databaseManager.saveGovernedAsDebtorByEdge).toHaveBeenCalledWith('cond123', entityId, sampleEntityCondition);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      result: entityResponse.result,
    });
  });

  it('should handle a case where the entity already exists', async () => {
    // Arrange
    const existingEntityId = '+27733161225MSISDN';
    jest.spyOn(databaseManager, 'getEntity').mockImplementation((): Promise<Entity | undefined> => {
      return Promise.resolve({ id: existingEntityId } as Entity);
    });

    // Act
    const result = await handlePostConditionEntity(sampleEntityCondition as EntityCondition, 'DEFAULT');

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
    const result = await handlePostConditionEntity(conditionDebtor as EntityCondition, 'DEFAULT');

    // Assert
    expect(databaseManager.saveCondition).toHaveBeenCalledWith(
      expect.objectContaining({
        ...conditionDebtor,
        creDtTm: nowDateTime,
      }),
    );
    const entityId = `${conditionDebtor.ntty.id}${conditionDebtor.ntty.schmeNm.prtry}`;
    expect(databaseManager.saveGovernedAsDebtorByEdge).toHaveBeenCalledWith('cond123', entityId, conditionDebtor);
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
      await handlePostConditionEntity(conditionDebtor as EntityCondition, 'DEFAULT');
    } catch (error) {
      console.log(error);
      expect(`${error}`).toEqual('Error: Error: Please enter a valid perspective. Accepted values are: both, debtor, or creditor.');
    }
  });

  it('should handle a successful post request for a creditor perspective', async () => {
    // Arrange
    const nowDateTime = new Date().toISOString();
    const conditionCreditor = { ...sampleEntityCondition, prsptv: 'creditor' };

    jest.spyOn(databaseManager, 'saveEntity').mockImplementation((): Promise<void> => {
      return Promise.resolve(void '');
    });
    // Act
    const result = await handlePostConditionEntity(conditionCreditor as EntityCondition, 'DEFAULT');

    // Assert
    expect(databaseManager.saveCondition).toHaveBeenCalledWith({
      ...conditionCreditor,
      creDtTm: nowDateTime,
    });
    const entityId = `${conditionCreditor.ntty.id}${conditionCreditor.ntty.schmeNm.prtry}`;
    expect(databaseManager.saveGovernedAsCreditorByEdge).toHaveBeenCalledWith('cond123', entityId, conditionCreditor);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      result: entityResponse.result,
    });
  });
  it('should create a new entity if entity does not exist and forceCret is set to true', async () => {
    jest.spyOn(databaseManager, 'getEntity').mockImplementation((): Promise<Entity | undefined> => {
      return Promise.resolve({ id: undefined } as unknown as Entity);
    });

    const nowDateTime = new Date().toISOString();

    // Arrange
    const condition = {
      ...sampleEntityCondition,
      forceCret: true,
      ntty: { id: 'new-entity-id', schmeNm: { prtry: 'new-prtry' } },
    } as EntityCondition;

    // Act & Assert
    await handlePostConditionEntity(condition as EntityCondition, 'DEFAULT');
    const entityId = condition.ntty.id + condition.ntty.schmeNm.prtry;
    expect(databaseManager.saveEntity).toHaveBeenCalledWith(entityId, 'DEFAULT', nowDateTime);
  });
  it('should handle error when creating a new entity if entity does not exist and forceCret is set to true', async () => {
    jest.spyOn(databaseManager, 'getEntity').mockImplementation((): Promise<Entity | undefined> => {
      return Promise.resolve({ id: undefined } as unknown as Entity);
    });

    jest.spyOn(databaseManager, 'saveEntity').mockImplementation((): Promise<void> => {
      return Promise.reject(new Error('Test Error'));
    });

    const nowDateTime = new Date().toISOString();

    // Arrange
    const condition = {
      ...sampleEntityCondition,
      forceCret: true,
      ntty: { id: 'new-entity-id', schmeNm: { prtry: 'new-prtry' } },
    } as EntityCondition;

    // Act & Assert
    const entityId = condition.ntty.id + condition.ntty.schmeNm.prtry;
    await expect(handlePostConditionEntity(condition as EntityCondition, 'DEFAULT')).rejects.toThrow(
      'Error: while trying to save new entity: Test Error',
    );
  });
  it('should throw an error if entity is not found and forceCret is false', async () => {
    jest.spyOn(databaseManager, 'getEntity').mockImplementation((): Promise<Entity | undefined> => {
      return Promise.resolve({ id: undefined } as unknown as Entity);
    });

    // Arrange
    const conditionWithoutForceCret = { ...sampleEntityCondition, forceCret: false } as EntityCondition;

    // Act & Assert
    await expect(handlePostConditionEntity(conditionWithoutForceCret as EntityCondition, 'DEFAULT')).rejects.toThrow(
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
    await expect(handlePostConditionEntity(sampleEntityCondition as EntityCondition, 'DEFAULT')).rejects.toThrow('Database error');
    expect(loggerService.log).toHaveBeenCalledWith('Error: posting condition for entity with error message: Database error');
  });

  it('should log a warning if conditions already exist for the entity', async () => {
    const copyofRawResponseEntity = JSON.parse(JSON.stringify(rawResponseEntity));

    copyofRawResponseEntity.governed_as_creditor_by.push({
      ...copyofRawResponseEntity.governed_as_debtor_by[0],
      condition: { ...copyofRawResponseEntity.governed_as_debtor_by[0].condition, condId: '1324' },
    });

    copyofRawResponseEntity.governed_as_debtor_by.push({
      ...copyofRawResponseEntity.governed_as_debtor_by[0],
      condition: { ...copyofRawResponseEntity.governed_as_debtor_by[0].condition, condId: '6324' },
    });

    jest.spyOn(databaseManager, 'getEntityConditionsByGraph').mockImplementationOnce(() => {
      return Promise.resolve([copyofRawResponseEntity]);
    });

    // Act
    await handlePostConditionEntity(sampleEntityCondition as EntityCondition, 'DEFAULT');

    // Assert
    expect(loggerService.warn).toHaveBeenCalledWith('2 conditions already exist for the entity');
  });
});

describe('getConditionForEntity', () => {
  beforeEach(() => {
    jest.spyOn(databaseManager, 'getEntityConditionsByGraph').mockImplementation((): Promise<RawConditionResponse[]> => {
      return Promise.resolve([rawResponseEntity] as unknown as RawConditionResponse[]);
    });

    jest.spyOn(databaseManager, 'set').mockImplementationOnce(() => {
      return Promise.resolve(undefined);
    });

    jest.spyOn(databaseManager, 'getEntity').mockImplementation((): Promise<Entity | undefined> => {
      return Promise.resolve({ id: 'entity456', creDtTm: '', TenantId: 'DEFAULT' } as Entity);
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('should get conditions for entity', async () => {
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'no' }, 'DEFAULT');
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should get no conditions for entity', async () => {
    jest.clearAllMocks();
    jest.spyOn(databaseManager, 'getEntityConditionsByGraph').mockImplementation(() => {
      return Promise.resolve([]);
    });
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'no' }, 'DEFAULT');
    // Assert
    expect(result).toEqual({ code: 404 });
  });

  it('should get no entity was found', async () => {
    jest.spyOn(databaseManager, 'getEntity').mockImplementation((): Promise<Entity | undefined> => {
      return Promise.resolve({ id: '', creDtTm: '', TenantId: 'DEFAULT' } as Entity);
    });
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'no' }, 'DEFAULT');
    // Assert
    expect(result).toEqual({ result: 'Entity does not exist in the database', code: 404 });
  });

  it('should get conditions for entity and update cache', async () => {
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'active' }, 'DEFAULT');
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should prune active conditions for cache', async () => {
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'all' }, 'DEFAULT');
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should prune active conditions for cache (using env)', async () => {
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'default' }, 'DEFAULT');
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should skip caching', async () => {
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '' }, 'DEFAULT');
    // Assert
    expect(result).toEqual(entityResponse);
  });

  it('should sync active condition by using default and environment variable', async () => {
    configuration.ACTIVE_CONDITIONS_ONLY = true;
    const result = await handleGetConditionsForEntity({ id: '', schmenm: '', synccache: 'default' }, 'DEFAULT');
    configuration.ACTIVE_CONDITIONS_ONLY = false;
    // Assert
    expect(result).toEqual(entityResponse);
  });
});

describe('handlePostConditionAccount', () => {
  beforeEach(() => {
    jest
      .spyOn(databaseManager, 'getAccount')
      .mockImplementation((accountId: string, schemeProprietary: string, agtMemberId: string): Promise<Account | undefined> => {
        return Promise.resolve({ id: `${accountId}${schemeProprietary}${agtMemberId}`, TenantId: 'DEFAULT' } as Account);
      });

    jest.spyOn(databaseManager, 'getAccountConditionsByGraph').mockImplementation((): Promise<RawConditionResponse[]> => {
      return Promise.resolve([rawResponseAccount] as RawConditionResponse[]);
    });

    jest.spyOn(databaseManager, 'saveCondition').mockImplementation((): Promise<void> => {
      return Promise.resolve(void '');
    });

    jest.spyOn(databaseManager, 'saveAccount').mockImplementation((): Promise<void> => {
      return Promise.resolve(void '');
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('should handle a successful post request for a new account', async () => {
    // Act
    const result = await handlePostConditionAccount(sampleAccountCondition, 'DEFAULT');

    // Assert
    expect(loggerService.log).toHaveBeenCalledWith(
      `Started handling post request of account condition executed by ${sampleAccountCondition.usr}.`,
    );
    const accountId = `${sampleAccountCondition.acct.id + sampleAccountCondition.acct.schmeNm.prtry + sampleAccountCondition.acct.agt.finInstnId.clrSysMmbId.mmbId}`;
    expect(databaseManager.saveGovernedAsCreditorAccountByEdge).toHaveBeenCalledWith('cond123', accountId, sampleAccountCondition);
    expect(databaseManager.saveGovernedAsDebtorAccountByEdge).toHaveBeenCalledWith('cond123', accountId, sampleAccountCondition);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      result: accountResponse.result,
    });
  });

  it('should handle a case where the account already exists', async () => {
    const existingAccountId = '1010101010Mxxdfsp001';
    jest.spyOn(databaseManager, 'getAccount').mockImplementation((): Promise<Account | undefined> => {
      return Promise.resolve(
        { id: existingAccountId, TenantId: 'DEFAULT' }, // No existing account
      );
    });

    // Act
    const result = await handlePostConditionAccount(sampleAccountCondition as AccountCondition, 'DEFAULT');

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
    const result = await handlePostConditionAccount(conditionDebtor, 'DEFAULT');
    const accountId = `${sampleAccountCondition.acct.id + sampleAccountCondition.acct.schmeNm.prtry + sampleAccountCondition.acct.agt.finInstnId.clrSysMmbId.mmbId}`;

    // Assert
    expect(databaseManager.saveGovernedAsDebtorAccountByEdge).toHaveBeenCalledWith('cond123', accountId, conditionDebtor);
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
      await handlePostConditionAccount(conditionDebtor as AccountCondition, 'DEFAULT');
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
    const result = await handlePostConditionAccount(conditionCreditor as AccountCondition, 'DEFAULT');

    // Assert
    expect(databaseManager.saveCondition).toHaveBeenCalledWith(
      expect.objectContaining({
        ...conditionCreditor,
        creDtTm: nowDateTime,
      }),
    );
    const accountId = `${sampleAccountCondition.acct.id + sampleAccountCondition.acct.schmeNm.prtry + sampleAccountCondition.acct.agt.finInstnId.clrSysMmbId.mmbId}`;

    expect(databaseManager.saveGovernedAsCreditorAccountByEdge).toHaveBeenCalledWith('cond123', accountId, conditionCreditor);
    expect(result).toEqual({
      message: 'New condition was saved successfully.',
      result: accountResponse.result,
    });
  });

  it('should create a new account if account does not exist and forceCret is set to true', async () => {
    jest.spyOn(databaseManager, 'getAccount').mockImplementation((): Promise<Account | undefined> => {
      return Promise.resolve({ id: '' } as Account);
    });

    // Arrange
    const condition = { ...sampleAccountCondition, forceCret: true } as AccountCondition;

    // Act & Assert
    await handlePostConditionAccount(condition as AccountCondition, 'DEFAULT');
    const accountId = condition.acct.id + condition.acct.schmeNm.prtry + condition.acct.agt.finInstnId.clrSysMmbId.mmbId;
    expect(databaseManager.saveAccount).toHaveBeenCalledWith(accountId, 'DEFAULT');
  });

  it('should handle error when creating a new account if account does not exist and forceCret is set to true', async () => {
    jest.spyOn(databaseManager, 'getAccount').mockImplementation((): Promise<Account | undefined> => {
      return Promise.resolve({ id: '' } as Account);
    });

    jest.spyOn(databaseManager, 'saveAccount').mockImplementation((): Promise<void> => {
      return Promise.reject(new Error('Test Error'));
    });

    // Arrange
    const condition = { ...sampleAccountCondition, forceCret: true } as AccountCondition;

    // Act & Assert
    await expect(handlePostConditionAccount(condition as AccountCondition, 'DEFAULT')).rejects.toThrow(
      'Error: while trying to save new account: Test Error',
    );
  });

  it('should throw an error if account is not found and forceCret is false', async () => {
    jest.spyOn(databaseManager, 'getAccount').mockImplementation((): Promise<Account | undefined> => {
      return Promise.resolve({ id: undefined } as unknown as Account);
    });
    // Arrange
    const conditionWithoutForceCret = { ...sampleAccountCondition, forceCret: false };

    // Act & Assert
    await expect(handlePostConditionAccount(conditionWithoutForceCret as AccountCondition, 'DEFAULT')).rejects.toThrow(
      'Error: account was not found and we could not create one because forceCret is set to false',
    );
  });

  it('should log a warning if conditions already exist for the account', async () => {
    // Arrange
    const copyofRawResponseAccount = JSON.parse(JSON.stringify(rawResponseAccount));

    copyofRawResponseAccount.governed_as_creditor_account_by.push({
      ...copyofRawResponseAccount.governed_as_debtor_account_by[0],
      condition: { ...copyofRawResponseAccount.governed_as_debtor_account_by[0].condition, condId: '1324' },
    });
    copyofRawResponseAccount.governed_as_debtor_account_by.push({
      ...copyofRawResponseAccount.governed_as_debtor_account_by[0],
      condition: { ...copyofRawResponseAccount.governed_as_debtor_account_by[0].condition, condId: '6324' },
    });

    jest.spyOn(databaseManager, 'getAccountConditionsByGraph').mockImplementationOnce(() => {
      return Promise.resolve([copyofRawResponseAccount]);
    });

    // Act
    await handlePostConditionAccount(sampleAccountCondition as AccountCondition, 'DEFAULT');

    // Assert
    expect(loggerService.warn).toHaveBeenCalledWith('2 conditions already exist for the account');
  });

  it('should handle handle thrown errors when trying to saveConditions', async () => {
    const error = new Error('Database error');
    jest.spyOn(databaseManager, 'saveCondition').mockImplementation(() => {
      return Promise.reject(error);
    });

    // Assert
    await expect(handlePostConditionAccount(sampleAccountCondition as AccountCondition, 'DEFAULT')).rejects.toThrow('Database error');
  });

  it('should log and throw an error when database save fails', async () => {
    // Arrange
    const error = new Error('Database error');
    jest.spyOn(databaseManager, 'getAccount').mockImplementation(() => {
      return Promise.reject(error);
    });

    // Act & Assert
    await expect(handlePostConditionAccount(sampleAccountCondition as AccountCondition, 'DEFAULT')).rejects.toThrow('Database error');
    expect(loggerService.error).toHaveBeenCalledWith('Error: posting condition for account with error message: Database error');
  });
});

describe('getConditionForAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test

    jest.spyOn(databaseManager, 'getAccount').mockImplementation((): Promise<Account | undefined> => {
      return Promise.resolve({ id: 'account456', TenantId: 'DEFAULT' } as Account);
    });

    jest.spyOn(databaseManager, 'getAccountConditionsByGraph').mockImplementation((): Promise<RawConditionResponse[]> => {
      return Promise.resolve([rawResponseAccount] as RawConditionResponse[]);
    });

    jest.spyOn(databaseManager, 'set').mockImplementation(() => {
      return Promise.resolve(undefined);
    });
  });

  it('should get conditions for account', async () => {
    const result = await handleGetConditionsForAccount({ id: '1010101010', synccache: 'no', schmenm: 'Mxx', agt: 'dfsp001' }, 'DEFAULT');
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should get no conditions for account', async () => {
    jest.spyOn(databaseManager, 'getAccountConditionsByGraph').mockImplementation(() => {
      return Promise.resolve([]);
    });
    const result = await handleGetConditionsForAccount({ id: '1010101010', synccache: 'no', schmenm: 'Mxx', agt: 'dfsp001' }, 'DEFAULT');

    // Assert
    expect(result).toEqual({ code: 404 });
  });

  it('should get no account was found', async () => {
    jest.spyOn(databaseManager, 'getAccount').mockImplementation((): Promise<Account | undefined> => {
      return Promise.resolve({ id: '', TenantId: 'DEFAULT' } as Account);
    });
    const result = await handleGetConditionsForAccount({ id: '1010101010', synccache: 'no', schmenm: 'Mxx', agt: 'dfsp001' }, 'DEFAULT');
    // Assert
    expect(result).toEqual({ result: 'Account does not exist in the database', code: 404 });
  });

  it('should get conditions for account and update cache', async () => {
    const result = await handleGetConditionsForAccount({ id: '1010101010', synccache: 'no', schmenm: 'Mxx', agt: 'dfsp001' }, 'DEFAULT');
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should prune active conditions for cache', async () => {
    const result = await handleGetConditionsForAccount({ id: '1010101010', synccache: 'no', schmenm: 'Mxx', agt: 'dfsp001' }, 'DEFAULT');
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should prune active conditions for cache (using env)', async () => {
    const result = await handleGetConditionsForAccount({ id: '', schmenm: '', agt: '007', synccache: 'default' }, 'DEFAULT');
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should skip caching', async () => {
    const result = await handleGetConditionsForAccount({ id: '', schmenm: '', agt: '008', synccache: 'no' }, 'DEFAULT');
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should sync all cache', async () => {
    const result = await handleGetConditionsForAccount({ id: '', schmenm: '', agt: '009', synccache: 'all' }, 'DEFAULT');
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should sync active cache by using environment variable', async () => {
    configuration.ACTIVE_CONDITIONS_ONLY = true;
    const result = await handleGetConditionsForAccount({ id: '', schmenm: '', agt: '001', synccache: 'default' }, 'DEFAULT');
    configuration.ACTIVE_CONDITIONS_ONLY = false;
    // Assert
    expect(result).toEqual(accountResponse);
  });

  it('should sync active cache only', async () => {
    const result = await handleGetConditionsForAccount({ id: '', schmenm: '', agt: '001', synccache: 'active' }, 'DEFAULT');
    // Assert
    expect(result).toEqual(accountResponse);
  });
});

describe('handleUpdateExpiryDateForConditionsOfAccount', () => {
  const params = { id: '2110', schmenm: 'scheme', agt: 'agent', condid: 'cond123' };
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

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, 'DEFAULT', '2024-07-06T50:00:00.999Z');

    expect(result).toEqual({
      code: 400,
      message: 'Expiration time date provided was invalid.',
    });
  });

  it('should return 404 if no active conditions exist for the account', async () => {
    (databaseManager.getAccountConditionsByGraph as jest.Mock).mockResolvedValue([
      { governed_as_creditor_account_by: [], governed_as_debtor_account_by: [] },
    ]);

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'Active conditions do not exist for this particular account in the database.',
    });
  });

  it('should return 404 if condition does not exist in the database', async () => {
    (databaseManager.getAccountConditionsByGraph as jest.Mock).mockResolvedValue([
      { governed_as_creditor_account_by: [{ condition: { _key: '' } }], governed_as_debtor_account_by: [{ condition: { _key: '' } }] },
    ]);

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'Condition does not exist in the database.',
    });
  });

  it('should return 404 if account does not exist in the database', async () => {
    (databaseManager.getAccountConditionsByGraph as jest.Mock).mockResolvedValue([
      {
        governed_as_creditor_account_by: [{ condition: { condId: 'cond123' }, result: {} }],
        governed_as_debtor_account_by: [{ condition: { condId: 'cond123' }, result: {} }],
      },
    ]);

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'Account does not exist in the database.',
    });
  });

  it('should return 405 if condition already contains an expiration date', async () => {
    (databaseManager.getAccountConditionsByGraph as jest.Mock).mockResolvedValue([rawResponseAccount]);

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, xprtnDtTm);

    expect(result).toEqual({
      code: 405,
      message: `Update failed - condition cond123 already contains an expiration date ${xprtnDtTm}`,
    });
  });

  it('should update expiry date and cache when conditions are met', async () => {
    const copyOfAccountRawResponse = rawResponseAccount as any;
    delete copyOfAccountRawResponse.governed_as_creditor_account_by[0].condition.xprtnDtTm;
    delete copyOfAccountRawResponse.governed_as_debtor_account_by[0].condition.xprtnDtTm;
    copyOfAccountRawResponse.governed_as_creditor_account_by[0].id = '+27733161225MSISDN';
    copyOfAccountRawResponse.governed_as_creditor_account_by[0].source = rawResponseAccount.governed_as_creditor_account_by[0].edge.source;
    copyOfAccountRawResponse.governed_as_creditor_account_by[0].destination =
      rawResponseAccount.governed_as_creditor_account_by[0].edge.destination;
    copyOfAccountRawResponse.governed_as_debtor_account_by[0].id = '+27733161225MSISDN';
    copyOfAccountRawResponse.governed_as_debtor_account_by[0].source = rawResponseAccount.governed_as_creditor_account_by[0].edge.source;
    copyOfAccountRawResponse.governed_as_debtor_account_by[0].destination =
      rawResponseAccount.governed_as_creditor_account_by[0].edge.destination;

    (databaseManager.getAccountConditionsByGraph as jest.Mock).mockResolvedValue([copyOfAccountRawResponse]);
    (databaseManager.updateExpiryDateOfCreditorAccountEdges as jest.Mock).mockResolvedValue('test');
    (databaseManager.updateExpiryDateOfDebtorAccountEdges as jest.Mock).mockResolvedValue('test');
    (databaseManager.updateCondition as jest.Mock).mockResolvedValue('test');

    const result = await handleUpdateExpiryDateForConditionsOfAccount(params, 'DEFAULT', xprtnDtTm);

    expect(databaseManager.updateExpiryDateOfCreditorAccountEdges).toHaveBeenCalledWith(
      rawResponseAccount.governed_as_creditor_account_by[0].edge.source,
      rawResponseAccount.governed_as_creditor_account_by[0].edge.destination,
      xprtnDtTm,
      'DEFAULT', // tenent id
    );
    //expect(databaseManager.updateCondition).toHaveBeenCalledWith('cond123', xprtnDtTm);

    expect(result).toEqual({ code: 200, message: '' });
  });
});

describe('handleUpdateExpiryDateForConditionsOfEntity', () => {
  const params = { id: 'cond123', schmenm: 'scheme', condid: 'cond123' };
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

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, 'DEFAULT', undefined);

    expect(result).toEqual({
      code: 404,
      message: 'No records were found in the database using the provided data.',
    });
  });

  it('should handle when xprtnDtTm is provided but with invalid date', async () => {
    (databaseManager.getEntityConditionsByGraph as jest.Mock).mockResolvedValue([]);

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, 'DEFAULT', '2024-07-06T50:00:00.999Z');

    expect(result).toEqual({
      code: 400,
      message: 'Expiration time date provided was invalid.',
    });
  });

  it('should return 404 if no active conditions exist for the entity', async () => {
    (databaseManager.getEntityConditionsByGraph as jest.Mock).mockResolvedValue([
      { governed_as_creditor_by: [], governed_as_debtor_by: [] },
    ]);

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'Active conditions do not exist for this particular entity in the database.',
    });
  });

  it('should return 404 if condition does not exist in the database', async () => {
    (databaseManager.getEntityConditionsByGraph as jest.Mock).mockResolvedValue([
      { governed_as_creditor_by: [{ condition: { condId: '' } }], governed_as_debtor_by: [{ condition: { condId: '' } }] },
    ]);

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'Condition does not exist in the database.',
    });
  });

  it('should return 404 if entity does not exist in the database', async () => {
    (databaseManager.getEntityConditionsByGraph as jest.Mock).mockResolvedValue([
      {
        governed_as_creditor_by: [{ condition: { condId: 'cond123' }, result: {} }],
        governed_as_debtor_by: [{ condition: { condId: 'cond123' }, result: {} }],
      },
    ]);

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, xprtnDtTm);

    expect(result).toEqual({
      code: 404,
      message: 'Entity does not exist in the database.',
    });
  });

  it('should return 405 if condition already contains an expiration date', async () => {
    (databaseManager.getEntityConditionsByGraph as jest.Mock).mockResolvedValue([rawResponseEntity]);

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, xprtnDtTm);

    expect(result).toEqual({
      code: 405,
      message: `Update failed - condition cond123 already contains an expiration date ${xprtnDtTm}`,
    });
  });

  it('should update expiry date and cache when conditions are met', async () => {
    const copyOfEntityRawResponse = rawResponseEntity as any;
    delete copyOfEntityRawResponse.governed_as_creditor_by[0].condition.xprtnDtTm;
    delete copyOfEntityRawResponse.governed_as_debtor_by[0].condition.xprtnDtTm;
    copyOfEntityRawResponse.governed_as_creditor_by[0].id = '+27733161225MSISDN';
    copyOfEntityRawResponse.governed_as_creditor_by[0].source = rawResponseEntity.governed_as_creditor_by[0].edge.source;
    copyOfEntityRawResponse.governed_as_creditor_by[0].destination = rawResponseEntity.governed_as_creditor_by[0].edge.destination;
    copyOfEntityRawResponse.governed_as_debtor_by[0].id = '+27733161225MSISDN';
    copyOfEntityRawResponse.governed_as_debtor_by[0].source = rawResponseEntity.governed_as_creditor_by[0].edge.source;
    copyOfEntityRawResponse.governed_as_debtor_by[0].destination = rawResponseEntity.governed_as_creditor_by[0].edge.destination;

    (databaseManager.getEntityConditionsByGraph as jest.Mock).mockResolvedValue([copyOfEntityRawResponse]);
    (databaseManager.updateExpiryDateOfCreditorEntityEdges as jest.Mock).mockResolvedValue('test');
    (databaseManager.updateExpiryDateOfDebtorEntityEdges as jest.Mock).mockResolvedValue('test');
    (databaseManager.updateCondition as jest.Mock).mockResolvedValue('test');

    const result = await handleUpdateExpiryDateForConditionsOfEntity(params, 'DEFAULT', xprtnDtTm);

    expect(databaseManager.updateExpiryDateOfDebtorEntityEdges).toHaveBeenCalledWith(
      rawResponseEntity.governed_as_creditor_by[0].edge.source,
      rawResponseEntity.governed_as_creditor_by[0].edge.destination,
      xprtnDtTm,
      'DEFAULT',
    );
    expect(databaseManager.updateCondition).toHaveBeenCalledWith('cond123', xprtnDtTm, 'DEFAULT');

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

    const result = await handleRefreshCache(true, 'DEFAULT', 12);

    expect(result).toBe(undefined);
  });
});
