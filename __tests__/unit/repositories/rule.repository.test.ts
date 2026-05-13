import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHandlePostExecuteSqlStatement = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandlePostExecuteSqlStatement(...args),
}));

jest.mock('../../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
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
import type { RuleEntity } from '../../../src/interface/rule.interface';

const mockTenantId = 'tenant-1';

const makeRuleEntity = (id = 1): RuleEntity => ({
  id,
  rule_name: 'TestRule',
  description: 'Test description',
  tenant_id: mockTenantId,
  txtp: 'pacs.002',
  version: '1.0.0',
  status: 'STATUS_01_IN_PROGRESS',
  publishing_status: 'INACTIVE',
  updated_by: 'user-1',
  rule_type: 'threshold',
  created_at: new Date(),
  updated_at: new Date(),
});

describe('Rule Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateRuleStatusInDB', () => {
    it('should update rule status and return rowCount', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await updateRuleStatusInDB('1', mockTenantId, 'STATUS_02_APPROVED', 'Looks good');

      expect(result).toEqual({ rowCount: 1 });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({ values: ['STATUS_02_APPROVED', 'Looks good', '1', mockTenantId] }),
        'configuration',
      );
    });

    it('should return rowCount 0 when no rows updated', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: null });

      const result = await updateRuleStatusInDB('999', mockTenantId, 'STATUS_02_APPROVED', '');

      expect(result).toEqual({ rowCount: 0 });
    });
  });

  describe('createRuleInDB', () => {
    it('should create a rule and return the entity', async () => {
      const entity = makeRuleEntity();
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [entity], rowCount: 1 });

      const result = await createRuleInDB(
        {
          ruleName: 'TestRule',
          description: 'Test',
          tenant_id: mockTenantId,
          txtp: 'pacs.002',
          version: '1.0.0',
          updated_by: 'user-1',
          rule_type: 'threshold',
          updated_at: new Date(),
          created_at: new Date(),
        },
        { rule: 'request' } as unknown as import('../../../src/interface/rule.interface').RuleRequest,
      );

      expect(result).toEqual(entity);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('INSERT INTO trs_rules') }),
        'configuration',
      );
    });

    it('should use COALESCE defaults for status and publishing_status', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [makeRuleEntity()], rowCount: 1 });

      await createRuleInDB(
        {
          ruleName: 'R',
          description: '',
          tenant_id: 'tenant-1',
          txtp: 'pacs.002',
          version: '1.0',
          updated_by: 'user',
          rule_type: 'type',
          updated_at: new Date(),
          created_at: new Date(),
        },
        {},
      );

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('COALESCE');
    });

    it('should use null for rule_config_id when not provided', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [makeRuleEntity()], rowCount: 1 });

      await createRuleInDB(
        {
          ruleName: 'R',
          description: '',
          tenant_id: 'tenant-1',
          txtp: 'pacs.002',
          version: '1.0',
          updated_by: 'user',
          rule_type: 'type',
          updated_at: new Date(),
          created_at: new Date(),
        },
        {},
      );

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values[11]).toBeNull();
    });
  });

  describe('updateRuleInDB', () => {
    it('should return updated rule entity', async () => {
      const entity = makeRuleEntity();
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [entity], rowCount: 1 });

      const result = await updateRuleInDB('1', mockTenantId, { rule_name: 'Updated' });

      expect(result).toEqual(entity);
      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('UPDATE trs_rules');
      expect(callArg.text).toContain('updated_at = NOW()');
    });

    it('should return null when rule not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await updateRuleInDB('999', mockTenantId, { rule_name: 'Updated' });

      expect(result).toBeNull();
    });

    it('should build dynamic SET clause for each updateData field', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [makeRuleEntity()], rowCount: 1 });

      await updateRuleInDB('1', mockTenantId, { rule_name: 'NewName', description: 'NewDesc' });

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('rule_name = $1');
      expect(callArg.text).toContain('description = $2');
      expect(callArg.values).toContain('NewName');
      expect(callArg.values).toContain('NewDesc');
    });
  });

  describe('findRuleConfigurationFromDB', () => {
    it('should return configuration when found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ configuration: { key: 'val' } }], rowCount: 1 });

      const result = await findRuleConfigurationFromDB('1', mockTenantId);

      expect(result).toEqual({ configuration: { key: 'val' } });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({ values: ['1', mockTenantId] }),
        'configuration',
      );
    });

    it('should return null when configuration not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await findRuleConfigurationFromDB('999', mockTenantId);

      expect(result).toBeNull();
    });
  });

  describe('updateRuleMetaData', () => {
    it('should update metadata and return result', async () => {
      const meta = { sync: true, deploy: false, test: true, simulation: false };
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ metadata: meta }], rowCount: 1 });

      const result = await updateRuleMetaData('1', meta, mockTenantId);

      expect(result).toEqual(meta);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({ values: ['1', JSON.stringify(meta), mockTenantId] }),
        'configuration',
      );
    });

    it('should include UPDATE trs_rules in query', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ metadata: {} }], rowCount: 1 });

      await updateRuleMetaData('1', {}, mockTenantId);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('UPDATE trs_rules');
      expect(callArg.text).toContain('metadata = $2');
    });
  });

  describe('findAllRuleIdsFromDb', () => {
    it('should return all rule ids for a tenant', async () => {
      const mockRows = [{ ruleId: '1', ruleCfg: {}, tenantId: mockTenantId }];
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: mockRows, rowCount: 1 });

      const result = await findAllRuleIdsFromDb(mockTenantId);

      expect(result).toEqual(mockRows);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.objectContaining({ values: [mockTenantId] }), 'configuration');
    });

    it('should return empty array when no rules found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await findAllRuleIdsFromDb(mockTenantId);

      expect(result).toEqual([]);
    });
  });

  describe('findRuleByIdFromDB', () => {
    it('should return rule entity when found', async () => {
      const entity = makeRuleEntity(5);
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [entity], rowCount: 1 });

      const result = await findRuleByIdFromDB(5, mockTenantId);

      expect(result).toEqual(entity);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({ values: [5, mockTenantId] }),
        'configuration',
      );
    });

    it('should return null when rule not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await findRuleByIdFromDB(999, mockTenantId);

      expect(result).toBeNull();
    });
  });

  describe('countRulesWithFiltersInDB', () => {
    it('should return parsed count', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ count: '42' }], rowCount: 1 });

      const result = await countRulesWithFiltersInDB('WHERE tenant_id = $1', [mockTenantId]);

      expect(result).toBe(42);
    });

    it('should return 0 when count is invalid', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ count: 'invalid' }], rowCount: 1 });

      const result = await countRulesWithFiltersInDB('', []);

      expect(result).toBe(0);
    });
  });

  describe('findRulesWithFiltersInDB', () => {
    it('should return rows wrapped in result key', async () => {
      const mockRows = [makeRuleEntity(1), makeRuleEntity(2)];
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: mockRows, rowCount: 2 });

      const result = await findRulesWithFiltersInDB('WHERE tenant_id = $1', 2, [mockTenantId, 10, 0]);

      expect(result).toEqual({ result: mockRows });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('ORDER BY updated_at DESC') }),
        'configuration',
      );
    });

    it('should use correct LIMIT and OFFSET placeholders based on paramIndex', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      await findRulesWithFiltersInDB('', 3, [10, 0]);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('LIMIT $3');
      expect(callArg.text).toContain('OFFSET $4');
    });
  });

  describe('getVersionsOfTransactionTypeFromDB', () => {
    it('should return versions array when found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ version: '1.0' }, { version: '2.0' }], rowCount: 2 });

      const result = await getVersionsOfTransactionTypeFromDB('pacs.002', mockTenantId);

      expect(result).toEqual(['1.0', '2.0']);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({ values: ['pacs.002', mockTenantId] }),
        'configuration',
      );
    });

    it('should return empty array when no versions found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await getVersionsOfTransactionTypeFromDB('unknown', mockTenantId);

      expect(result).toEqual([]);
    });
  });

  describe('saveRuleRequestInDB', () => {
    it('should execute UPDATE query with correct values', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 1 });

      await saveRuleRequestInDB('pacs.002', mockTenantId, { rule: 'req' });

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('UPDATE trs_rules'),
          values: [{ rule: 'req' }, mockTenantId, 'pacs.002'],
        }),
        'configuration',
      );
    });

    it('should propagate database errors', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Update failed'));

      await expect(saveRuleRequestInDB('pacs.002', mockTenantId, {})).rejects.toThrow('Update failed');
    });
  });

  describe('cloneRuleInDB', () => {
    it('should clone rule and return the new entity', async () => {
      const clonedEntity = makeRuleEntity(99);
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [clonedEntity], rowCount: 1 });

      const result = await cloneRuleInDB(
        {
          ruleName: 'ClonedRule',
          description: 'Clone',
          rule_config_id: 'cfg-1',
          txtp: 'pacs.002',
          version: '1.0.0',
          rule_type: 'threshold',
        },
        'user-1',
        1,
        mockTenantId,
      );

      expect(result).toEqual(clonedEntity);
      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('INSERT INTO trs_rules');
      expect(callArg.text).toContain('STATUS_01_IN_PROGRESS');
      expect(callArg.values[0]).toBe(1);
      expect(callArg.values[1]).toBe(mockTenantId);
    });

    it('should use COALESCE to override fields from original rule', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [makeRuleEntity(99)], rowCount: 1 });

      await cloneRuleInDB({ ruleName: 'ClonedRule' }, 'user-1', 1, mockTenantId);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('COALESCE');
    });
  });

  describe('cloneRuleFlowInDB', () => {
    it('should clone rule flow and return new flow entity', async () => {
      const mockFlow = {
        id: 10,
        rule_id: '99',
        flow_json_rule_builder: {},
        flow_json_test_case: {},
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [mockFlow], rowCount: 1 });

      const result = await cloneRuleFlowInDB('99', 1);

      expect(result).toEqual(mockFlow);
      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('INSERT INTO trs_rule_flow');
      expect(callArg.values).toEqual(['99', 1]);
    });

    it('should include NOW() for timestamps in clone query', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{}], rowCount: 1 });

      await cloneRuleFlowInDB('99', 1);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('NOW()');
    });
  });
});
