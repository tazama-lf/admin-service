import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHandlePostExecuteSqlStatement = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandlePostExecuteSqlStatement(...args),
}));

import {
  updateRuleStatusInDB,
  createRuleInDB,
  updateRuleInDB,
  findRuleConfigurationFromDB,
  updateRuleMetaData,
  findAllRuleIdsFromDb,
  findRuleByIdFromDB,
  countRulesWithFiltersInDB,
  findRulesWithFiltersInDB,
  getVersionsOfTransactionTypeFromDB,
  saveRuleRequestInDB,
  cloneRuleInDB,
  cloneRuleFlowInDB,
} from '../../../src/repositories/configuration/rule.repository';

describe('Rule Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updateRuleStatusInDB should return rowCount', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rowCount: 2 });

    const result = await updateRuleStatusInDB('1', 'tenant-a', 'APPROVED', 'ok');

    expect(result).toEqual({ rowCount: 2 });
  });

  it('createRuleInDB should insert and return row', async () => {
    const row = { id: 1, rule_name: 'RuleA', tenant_id: 'tenant-a' };
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [row] });

    const result = await createRuleInDB(
      {
        ruleName: 'RuleA',
        description: 'desc',
        tenant_id: 'tenant-a',
        txtp: 'pacs.008',
        version: '1.0',
        updated_by: 'u1',
        rule_type: 'CUSTOM',
        updated_at: new Date(),
        created_at: new Date(),
      },
      { any: 'request' } as any,
    );

    expect(result).toEqual(row);
    const callArg = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { text: string };
    expect(callArg.text).toContain('INSERT INTO trs_rules');
  });

  it('updateRuleInDB should return updated rule when found', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ id: 1, status: 'ACTIVE' }] });

    const result = await updateRuleInDB('1', 'tenant-a', { status: 'ACTIVE' } as any);

    expect(result).toEqual({ id: 1, status: 'ACTIVE' });
  });

  it('updateRuleInDB should return null when no rows updated', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [] });

    const result = await updateRuleInDB('1', 'tenant-a', { status: 'ACTIVE' } as any);

    expect(result).toBeNull();
  });

  it('findRuleConfigurationFromDB should return null on no row', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [] });

    const result = await findRuleConfigurationFromDB('1', 'tenant-a');

    expect(result).toBeNull();
  });

  it('findRuleConfigurationFromDB should return configuration', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ configuration: { a: 1 } }] });

    const result = await findRuleConfigurationFromDB('1', 'tenant-a');

    expect(result).toEqual({ configuration: { a: 1 } });
  });

  it('updateRuleMetaData should return metadata from db', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ metadata: { sync: true } }] });

    const result = await updateRuleMetaData('1', { sync: true }, 'tenant-a');

    expect(result).toEqual({ sync: true });
  });

  it('findAllRuleIdsFromDb should return rows', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ ruleId: 'r1', tenantId: 't1', ruleCfg: {} }] });

    const result = await findAllRuleIdsFromDb('tenant-a');

    expect(result).toHaveLength(1);
  });

  it('findRuleByIdFromDB should return null when no row', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [] });

    const result = await findRuleByIdFromDB(1, 'tenant-a');

    expect(result).toBeNull();
  });

  it('findRuleByIdFromDB should return row when found', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ id: 1 }] });

    const result = await findRuleByIdFromDB(1, 'tenant-a');

    expect(result).toEqual({ id: 1 });
  });

  it('countRulesWithFiltersInDB should parse count', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ count: '12' }] });

    const result = await countRulesWithFiltersInDB('WHERE tenant_id = $1', ['tenant-a']);

    expect(result).toBe(12);
  });

  it('countRulesWithFiltersInDB should return 0 for invalid count', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ count: 'not-a-number' }] });

    const result = await countRulesWithFiltersInDB('', []);

    expect(result).toBe(0);
  });

  it('findRulesWithFiltersInDB should return wrapped result rows', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ id: 1 }] });

    const result = await findRulesWithFiltersInDB('WHERE tenant_id = $1', 2, ['tenant-a', 10, 0]);

    expect(result).toEqual({ result: [{ id: 1 }] });
  });

  it('getVersionsOfTransactionTypeFromDB should return versions list', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ version: '1.0' }, { version: '2.0' }] });

    const result = await getVersionsOfTransactionTypeFromDB('pacs.008', 'tenant-a');

    expect(result).toEqual(['1.0', '2.0']);
  });

  it('getVersionsOfTransactionTypeFromDB should return empty array when no rows', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [] });

    const result = await getVersionsOfTransactionTypeFromDB('pacs.008', 'tenant-a');

    expect(result).toEqual([]);
  });

  it('saveRuleRequestInDB should execute update', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rowCount: 1 });

    await saveRuleRequestInDB('pacs.008', 'tenant-a', { request: true } as any);

    expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
      expect.objectContaining({ values: [{ request: true }, 'tenant-a', 'pacs.008'] }),
      'configuration',
    );
  });

  it('cloneRuleInDB should return cloned rule', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ id: 2, rule_name: 'Cloned' }] });

    const result = await cloneRuleInDB(
      {
        ruleName: 'Cloned',
        description: 'desc',
        rule_config_id: 'cfg',
        txtp: 'pacs.008',
        version: '1.0',
        rule_type: 'CUSTOM',
      } as any,
      'user-a',
      1,
      'tenant-a',
    );

    expect(result.id).toBe(2);
    const callArg = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { text: string };
    expect(callArg.text).toContain('INSERT INTO trs_rules');
  });

  it('cloneRuleFlowInDB should return cloned flow row', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ id: 11, rule_id: '2' }] });

    const result = await cloneRuleFlowInDB('2', 1);

    expect(result).toEqual({ id: 11, rule_id: '2' });
    const callArg = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(callArg.text).toContain('INSERT INTO trs_rule_flow');
    expect(callArg.values).toEqual(['2', 1]);
  });
});
