// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { HttpException, HttpStatus } from '../../src/utils/error';

jest.mock('../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: jest.fn(),
}));

jest.mock('../../src/repositories/configuration/rule.repository', () => ({
  updateRuleStatusInDB: jest.fn(),
  createRuleInDB: jest.fn(),
  updateRuleInDB: jest.fn(),
  findAllRuleIdsFromDb: jest.fn(),
  findRuleConfigurationFromDB: jest.fn(),
  findRuleByIdFromDB: jest.fn(),
  cloneRuleInDB: jest.fn(),
  cloneRuleFlowInDB: jest.fn(),
  saveRuleRequestInDB: jest.fn(),
  findRulesWithFiltersInDB: jest.fn(),
  countRulesWithFiltersInDB: jest.fn(),
  getVersionsOfTransactionTypeFromDB: jest.fn(),
}));

import * as ruleLogicService from '../../src/services/rule.logic.service';
import * as ruleRepository from '../../src/repositories/configuration/rule.repository';

describe('Rule Logic Service', () => {
  const mockTenantId = 'tenant-123';
  const mockRuleId = 'rule-456';
  const mockUserId = 'user-789';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateRuleStatus', () => {
    it('should update rule status successfully', async () => {
      (ruleRepository.updateRuleStatusInDB as jest.Mock).mockResolvedValue({ rowCount: 1 });

      const result = await ruleLogicService.updateRuleStatus(mockRuleId, mockTenantId, 'active', 'Approved');

      expect(ruleRepository.updateRuleStatusInDB).toHaveBeenCalledWith(mockRuleId, mockTenantId, 'active', 'Approved');
      expect(result).toEqual({
        success: true,
        message: `Rule with id "${mockRuleId}" successfully updated to status "active" with reason "Approved"`,
      });
    });

    it('should update rule status without reason', async () => {
      (ruleRepository.updateRuleStatusInDB as jest.Mock).mockResolvedValue({ rowCount: 1 });

      const result = await ruleLogicService.updateRuleStatus(mockRuleId, mockTenantId, 'active', '');

      expect(result.message).toBe(`Rule with id "${mockRuleId}" successfully updated to status "active"`);
    });

    it('should throw error when rule is not found', async () => {
      (ruleRepository.updateRuleStatusInDB as jest.Mock).mockResolvedValue({ rowCount: 0 });

      await expect(ruleLogicService.updateRuleStatus(mockRuleId, mockTenantId, 'active', 'Test')).rejects.toThrow(
        new HttpException(`Rule with id "${mockRuleId}" not found or status not updated`, HttpStatus.NOT_FOUND),
      );
    });
  });

  describe('createRule', () => {
    it('should create a rule successfully', async () => {
      const mockRuleData = {
        ruleName: 'Test Rule',
        description: 'Test Description',
        tenant_id: mockTenantId,
        txtp: 'pacs.008.001.10',
        version: '1.0.0',
        status: 'draft',
        publishing_status: 'inactive',
        updated_by: mockUserId,
        rule_type: 'typology',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockRuleRequest = {
        field1: 'value1',
        field2: 'value2',
      };

      const mockCreatedRule = {
        id: 1,
        ...mockRuleData,
      };

      (ruleRepository.createRuleInDB as jest.Mock).mockResolvedValue(mockCreatedRule);

      const result = await ruleLogicService.createRule(mockRuleData, mockRuleRequest);

      expect(ruleRepository.createRuleInDB).toHaveBeenCalledWith(mockRuleData, mockRuleRequest);
      expect(result).toEqual(mockCreatedRule);
    });

    it('should create a rule with optional fields', async () => {
      const mockRuleData = {
        ruleName: 'Test Rule',
        description: 'Test Description',
        tenant_id: mockTenantId,
        txtp: 'pacs.002.001.12',
        txtp_version: '1.0',
        version: '2.0.0',
        updated_by: mockUserId,
        rule_type: 'rule',
        rule_config_id: 'config-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockRuleRequest = { testField: 'testValue' };

      const mockCreatedRule = {
        id: 2,
        ...mockRuleData,
      };

      (ruleRepository.createRuleInDB as jest.Mock).mockResolvedValue(mockCreatedRule);

      const result = await ruleLogicService.createRule(mockRuleData, mockRuleRequest);

      expect(result).toEqual(mockCreatedRule);
    });
  });

  describe('updateRule', () => {
    it('should update rule successfully', async () => {
      const updateData = {
        rule_name: 'Updated Rule Name',
        description: 'Updated Description',
        status: 'active',
      };

      const mockUpdatedRule = {
        id: 1,
        rule_name: updateData.rule_name,
        description: updateData.description,
        status: updateData.status,
        tenant_id: mockTenantId,
      };

      (ruleRepository.updateRuleInDB as jest.Mock).mockResolvedValue(mockUpdatedRule);

      const result = await ruleLogicService.updateRule('1', mockTenantId, updateData);

      expect(ruleRepository.updateRuleInDB).toHaveBeenCalledWith('1', mockTenantId, updateData);
      expect(result).toEqual(mockUpdatedRule);
    });

    it('should update rule metadata', async () => {
      const updateData = {
        metadata: {
          sync: true,
          deploy: false,
          test: true,
          simulation: false,
        },
      };

      const mockUpdatedRule = {
        id: 1,
        metadata: updateData.metadata,
        tenant_id: mockTenantId,
      };

      (ruleRepository.updateRuleInDB as jest.Mock).mockResolvedValue(mockUpdatedRule);

      const result = await ruleLogicService.updateRule('1', mockTenantId, updateData);

      expect(result).toEqual(mockUpdatedRule);
    });

    it('should return null when rule is not found', async () => {
      (ruleRepository.updateRuleInDB as jest.Mock).mockResolvedValue(null);

      const result = await ruleLogicService.updateRule('999', mockTenantId, { rule_name: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('findAllRuleIds', () => {
    it('should find all rule IDs for a tenant', async () => {
      const mockRuleIds = [
        { ruleId: 'rule-1', ruleCfg: { config: 'cfg1' }, tenantId: mockTenantId },
        { ruleId: 'rule-2', ruleCfg: { config: 'cfg2' }, tenantId: mockTenantId },
        { ruleId: 'rule-3', ruleCfg: { config: 'cfg3' }, tenantId: mockTenantId },
      ];

      (ruleRepository.findAllRuleIdsFromDb as jest.Mock).mockResolvedValue(mockRuleIds);

      const result = await ruleLogicService.findAllRuleIds(mockTenantId);

      expect(ruleRepository.findAllRuleIdsFromDb).toHaveBeenCalledWith(mockTenantId);
      expect(result).toEqual(mockRuleIds);
      expect(result).toHaveLength(3);
    });

    it('should return empty array when no rules found', async () => {
      (ruleRepository.findAllRuleIdsFromDb as jest.Mock).mockResolvedValue([]);

      const result = await ruleLogicService.findAllRuleIds(mockTenantId);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('findRuleConfiguration', () => {
    it('should find rule configuration', async () => {
      const mockConfiguration = {
        id: 'config-123',
        settings: {
          threshold: 100,
          enabled: true,
        },
      };

      (ruleRepository.findRuleConfigurationFromDB as jest.Mock).mockResolvedValue(mockConfiguration);

      const result = await ruleLogicService.findRuleConfiguration(mockRuleId, mockTenantId);

      expect(ruleRepository.findRuleConfigurationFromDB).toHaveBeenCalledWith(mockRuleId, mockTenantId);
      expect(result).toEqual(mockConfiguration);
    });

    it('should return null when configuration is not found', async () => {
      (ruleRepository.findRuleConfigurationFromDB as jest.Mock).mockResolvedValue(null);

      const result = await ruleLogicService.findRuleConfiguration('non-existent', mockTenantId);

      expect(result).toBeNull();
    });
  });

  describe('findRuleById', () => {
    it('should find rule by id', async () => {
      const mockRule = {
        id: 1,
        rule_name: 'Test Rule',
        description: 'Test Description',
        tenant_id: mockTenantId,
        status: 'active',
      };

      (ruleRepository.findRuleByIdFromDB as jest.Mock).mockResolvedValue(mockRule);

      const result = await ruleLogicService.findRuleById(1, mockTenantId);

      expect(ruleRepository.findRuleByIdFromDB).toHaveBeenCalledWith(1, mockTenantId);
      expect(result).toEqual(mockRule);
    });

    it('should return null when rule is not found', async () => {
      (ruleRepository.findRuleByIdFromDB as jest.Mock).mockResolvedValue(null);

      const result = await ruleLogicService.findRuleById(999, mockTenantId);

      expect(result).toBeNull();
    });
  });

  describe('cloneRule', () => {
    it('should clone rule successfully', async () => {
      const mockPayload = {
        rule_name: 'Cloned Rule',
        description: 'Cloned Description',
      };

      const mockClonedRule = {
        id: 2,
        rule_name: mockPayload.rule_name,
        description: mockPayload.description,
        tenant_id: mockTenantId,
      };

      const mockRuleRequest = {
        field1: 'value1',
      };

      (ruleRepository.cloneRuleInDB as jest.Mock).mockResolvedValue(mockClonedRule);
      (ruleRepository.cloneRuleFlowInDB as jest.Mock).mockResolvedValue(undefined);
      (ruleRepository.saveRuleRequestInDB as jest.Mock).mockResolvedValue(undefined);

      const result = await ruleLogicService.cloneRule(1, mockPayload, mockUserId, mockTenantId, mockRuleRequest);

      expect(ruleRepository.cloneRuleInDB).toHaveBeenCalledWith(mockPayload, mockUserId, 1, mockTenantId);
      expect(ruleRepository.cloneRuleFlowInDB).toHaveBeenCalledWith(2, 1);
      expect(ruleRepository.saveRuleRequestInDB).toHaveBeenCalled();
      expect(result).toEqual(mockClonedRule);
    });

    it('should clone rule without rule request', async () => {
      const mockPayload = {
        rule_name: 'Cloned Rule',
        description: 'Cloned Description',
      };

      const mockClonedRule = {
        id: 3,
        rule_name: mockPayload.rule_name,
        description: mockPayload.description,
        tenant_id: mockTenantId,
      };

      (ruleRepository.cloneRuleInDB as jest.Mock).mockResolvedValue(mockClonedRule);
      (ruleRepository.cloneRuleFlowInDB as jest.Mock).mockResolvedValue(undefined);

      const result = await ruleLogicService.cloneRule(1, mockPayload, mockUserId, mockTenantId, undefined);

      expect(ruleRepository.cloneRuleInDB).toHaveBeenCalledWith(mockPayload, mockUserId, 1, mockTenantId);
      expect(ruleRepository.cloneRuleFlowInDB).toHaveBeenCalledWith(3, 1);
      expect(ruleRepository.saveRuleRequestInDB).not.toHaveBeenCalled();
      expect(result).toEqual(mockClonedRule);
    });
  });

  describe('findRulesWithFilters', () => {
    it('should find rules with status filter', async () => {
      const payload = { status: 'active,draft' };

      const mockRules = {
        result: [
          { id: 1, rule_name: 'Rule 1', status: 'active' },
          { id: 2, rule_name: 'Rule 2', status: 'draft' },
        ],
      };

      (ruleRepository.countRulesWithFiltersInDB as jest.Mock).mockResolvedValue(2);
      (ruleRepository.findRulesWithFiltersInDB as jest.Mock).mockResolvedValue(mockRules);

      const result = await ruleLogicService.findRulesWithFilters(10, 0, payload, mockTenantId);

      expect(result.data).toEqual(mockRules.result);
      expect(result.total).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it('should find rules with multiple filters', async () => {
      const payload = {
        status: 'active',
        publishingStatus: 'published',
        ruleName: 'Test',
        ruleType: 'typology',
        updatedBy: 'user@example.com',
      };

      const mockRules = {
        result: [{ id: 1, rule_name: 'Test Rule', status: 'active' }],
      };

      (ruleRepository.countRulesWithFiltersInDB as jest.Mock).mockResolvedValue(1);
      (ruleRepository.findRulesWithFiltersInDB as jest.Mock).mockResolvedValue(mockRules);

      const result = await ruleLogicService.findRulesWithFilters(10, 0, payload, mockTenantId);

      expect(result.data).toEqual(mockRules.result);
      expect(result.total).toBe(1);
    });

    it('should find rules with date filters', async () => {
      const payload = {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      };

      const mockRules = {
        result: [
          { id: 1, rule_name: 'Rule 1', created_at: '2026-01-15' },
          { id: 2, rule_name: 'Rule 2', created_at: '2026-01-20' },
        ],
      };

      (ruleRepository.countRulesWithFiltersInDB as jest.Mock).mockResolvedValue(2);
      (ruleRepository.findRulesWithFiltersInDB as jest.Mock).mockResolvedValue(mockRules);

      const result = await ruleLogicService.findRulesWithFilters(10, 0, payload, mockTenantId);

      expect(result.data).toEqual(mockRules.result);
      expect(result.total).toBe(2);
    });

    it('should find rules with specific createdAt date', async () => {
      const payload = {
        createdAt: '2026-01-15',
      };

      const mockRules = {
        result: [{ id: 1, rule_name: 'Rule 1', created_at: '2026-01-15' }],
      };

      (ruleRepository.countRulesWithFiltersInDB as jest.Mock).mockResolvedValue(1);
      (ruleRepository.findRulesWithFiltersInDB as jest.Mock).mockResolvedValue(mockRules);

      const result = await ruleLogicService.findRulesWithFilters(10, 0, payload, mockTenantId);

      expect(result.data).toEqual(mockRules.result);
      expect(result.total).toBe(1);
    });

    it('should handle pagination correctly', async () => {
      const mockRules = {
        result: [{ id: 11, rule_name: 'Rule 11' }],
      };

      (ruleRepository.countRulesWithFiltersInDB as jest.Mock).mockResolvedValue(15);
      (ruleRepository.findRulesWithFiltersInDB as jest.Mock).mockResolvedValue(mockRules);

      const result = await ruleLogicService.findRulesWithFilters(5, 2, {}, mockTenantId);

      expect(result.limit).toBe(5);
      expect(result.offset).toBe(2);
      expect(result.total).toBe(15);
    });

    it('should return empty result when no rules match filters', async () => {
      const payload = { status: 'archived' };

      const mockRules = {
        result: [],
      };

      (ruleRepository.countRulesWithFiltersInDB as jest.Mock).mockResolvedValue(0);
      (ruleRepository.findRulesWithFiltersInDB as jest.Mock).mockResolvedValue(mockRules);

      const result = await ruleLogicService.findRulesWithFilters(10, 0, payload, mockTenantId);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getVersionsOfTransactionType', () => {
    it('should get all versions of a transaction type', async () => {
      const transactionType = 'pacs.008.001.10';
      const mockVersions = ['1.0.0', '1.1.0', '2.0.0'];

      (ruleRepository.getVersionsOfTransactionTypeFromDB as jest.Mock).mockResolvedValue(mockVersions);

      const result = await ruleLogicService.getVersionsOfTransactionType(transactionType, mockTenantId);

      expect(ruleRepository.getVersionsOfTransactionTypeFromDB).toHaveBeenCalledWith(transactionType, mockTenantId);
      expect(result).toEqual(mockVersions);
      expect(result).toHaveLength(3);
    });

    it('should return empty array when no versions found', async () => {
      const transactionType = 'non.existent.type';

      (ruleRepository.getVersionsOfTransactionTypeFromDB as jest.Mock).mockResolvedValue([]);

      const result = await ruleLogicService.getVersionsOfTransactionType(transactionType, mockTenantId);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should handle multiple transaction types separately', async () => {
      const transactionType1 = 'pacs.008.001.10';
      const transactionType2 = 'pacs.002.001.12';

      (ruleRepository.getVersionsOfTransactionTypeFromDB as jest.Mock)
        .mockResolvedValueOnce(['1.0.0', '2.0.0'])
        .mockResolvedValueOnce(['1.0.0']);

      const result1 = await ruleLogicService.getVersionsOfTransactionType(transactionType1, mockTenantId);
      const result2 = await ruleLogicService.getVersionsOfTransactionType(transactionType2, mockTenantId);

      expect(result1).toHaveLength(2);
      expect(result2).toHaveLength(1);
    });
  });
});
