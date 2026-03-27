// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as ruleFlowService from '../../src/services/rule-flow.logic.service';
import * as ruleFlowRepository from '../../src/repositories/configuration/rule-flow.repository';
import { HttpException, HttpStatus } from '../../src/utils/error';

jest.mock('../../src/repositories/configuration/rule-flow.repository');
jest.mock('../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Rule Flow Logic Service', () => {
  const mockTenantId = 'tenant-123';
  const mockRuleId = 'rule-456';
  const mockRuleConfigId = 'config-789';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getGlobalVariables', () => {
    it('should retrieve rule request and configuration successfully', async () => {
      const mockRuleRequest = {
        rule_config_id: mockRuleConfigId,
        rulerequest: {
          field1: 'value1',
          field2: 'value2',
        },
      };

      const mockConfiguration = {
        configuration: {
          id: mockRuleConfigId,
          cfg: 'test-config',
          desc: 'Test Configuration',
          config: {
            setting1: 'value1',
            setting2: 'value2',
          },
        },
      };

      (ruleFlowRepository.getRuleRequestByRuleId as jest.Mock).mockResolvedValue(mockRuleRequest);
      (ruleFlowRepository.getRuleConfigById as jest.Mock).mockResolvedValue(mockConfiguration);

      const result = await ruleFlowService.getGlobalVariables(mockRuleId, mockTenantId);

      expect(ruleFlowRepository.getRuleRequestByRuleId).toHaveBeenCalledWith(mockRuleId, mockTenantId);
      expect(ruleFlowRepository.getRuleConfigById).toHaveBeenCalledWith(mockRuleConfigId, mockTenantId);
      expect(result).toEqual({
        ruleRequest: mockRuleRequest.rulerequest,
        configuration: mockConfiguration.configuration,
      });
    });

    it('should return null when rule request is not found', async () => {
      (ruleFlowRepository.getRuleRequestByRuleId as jest.Mock).mockResolvedValue(null);

      const result = await ruleFlowService.getGlobalVariables(mockRuleId, mockTenantId);

      expect(result).toBeNull();
      expect(ruleFlowRepository.getRuleConfigById).not.toHaveBeenCalled();
    });

    it('should return null when rule configuration is not found', async () => {
      const mockRuleRequest = {
        rule_config_id: mockRuleConfigId,
        rulerequest: { field1: 'value1' },
      };

      (ruleFlowRepository.getRuleRequestByRuleId as jest.Mock).mockResolvedValue(mockRuleRequest);
      (ruleFlowRepository.getRuleConfigById as jest.Mock).mockResolvedValue(null);

      const result = await ruleFlowService.getGlobalVariables(mockRuleId, mockTenantId);

      expect(result).toBeNull();
    });
  });

  describe('createRuleFlow', () => {
    it('should create rule flow successfully', async () => {
      const mockRuleFlowData = {
        rule_id: mockRuleId,
        flow_json: { nodes: [], edges: [] },
        ts_file_base64: 'base64string',
        category: 'rule_builder',
        status: 'active',
        tenant_id: mockTenantId,
      };

      const mockCreatedRuleFlow = {
        id: 'flow-123',
        ...mockRuleFlowData,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (ruleFlowRepository.createRuleFlowInDB as jest.Mock).mockResolvedValue(mockCreatedRuleFlow);

      const result = await ruleFlowService.createRuleFlow(mockRuleFlowData);

      expect(ruleFlowRepository.createRuleFlowInDB).toHaveBeenCalledWith(mockRuleFlowData);
      expect(result).toEqual([mockCreatedRuleFlow]);
    });

    it('should throw error when rule flow creation fails', async () => {
      const mockRuleFlowData = {
        rule_id: mockRuleId,
        flow_json: { nodes: [], edges: [] },
        category: 'rule_builder',
        status: 'active',
        tenant_id: mockTenantId,
      };

      (ruleFlowRepository.createRuleFlowInDB as jest.Mock).mockResolvedValue(null);

      await expect(ruleFlowService.createRuleFlow(mockRuleFlowData)).rejects.toThrow('Failed to create or update rule flow');
    });
  });

  describe('findRuleFlow', () => {
    it('should find rule flow with rule_builder category', async () => {
      const mockRuleFlow = {
        id: 'flow-123',
        rule_id: mockRuleId,
        flow_json: { nodes: [], edges: [] },
        ts_file_base64: 'base64string',
        status: 'active',
        tenant_id: mockTenantId,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (ruleFlowRepository.findRuleFlowFromDB as jest.Mock).mockResolvedValue(mockRuleFlow);

      const result = await ruleFlowService.findRuleFlow(mockRuleId, mockTenantId, 'rule_builder');

      expect(ruleFlowRepository.findRuleFlowFromDB).toHaveBeenCalledWith(
        mockRuleId,
        mockTenantId,
        'id, rule_id, flow_json_rule_builder as flow_json, ts_file_base64_rule_builder as ts_file_base64, status_rule_builder as status, tenant_id, created_at, updated_at',
      );
      expect(result).toEqual(mockRuleFlow);
    });

    it('should find rule flow with test_case_generation category', async () => {
      const mockRuleFlow = {
        id: 'flow-123',
        rule_id: mockRuleId,
        flow_json: { nodes: [], edges: [] },
        ts_file_base64: 'base64string',
        status: 'active',
        tenant_id: mockTenantId,
      };

      (ruleFlowRepository.findRuleFlowFromDB as jest.Mock).mockResolvedValue(mockRuleFlow);

      const result = await ruleFlowService.findRuleFlow(mockRuleId, mockTenantId, 'test_case_generation');

      expect(ruleFlowRepository.findRuleFlowFromDB).toHaveBeenCalledWith(
        mockRuleId,
        mockTenantId,
        'id, rule_id, flow_json_test_case as flow_json, ts_file_base64_test_case as ts_file_base64, status_test_case as status, tenant_id, created_at, updated_at',
      );
      expect(result).toEqual(mockRuleFlow);
    });

    it('should find rule flow without category (all fields)', async () => {
      const mockRuleFlow = {
        id: 'flow-123',
        rule_id: mockRuleId,
        flow_json_rule_builder: { nodes: [], edges: [] },
        ts_file_base64_rule_builder: 'base64string1',
        flow_json_test_case: { nodes: [], edges: [] },
        ts_file_base64_test_case: 'base64string2',
        tenant_id: mockTenantId,
        status_rule_builder: 'active',
        status_test_case: 'pending',
      };

      (ruleFlowRepository.findRuleFlowFromDB as jest.Mock).mockResolvedValue(mockRuleFlow);

      const result = await ruleFlowService.findRuleFlow(mockRuleId, mockTenantId);

      expect(ruleFlowRepository.findRuleFlowFromDB).toHaveBeenCalledWith(
        mockRuleId,
        mockTenantId,
        'id, rule_id, flow_json_rule_builder, ts_file_base64_rule_builder, flow_json_test_case, ts_file_base64_test_case, tenant_id, status_rule_builder, status_test_case, created_at, updated_at',
      );
      expect(result).toEqual(mockRuleFlow);
    });

    it('should return null when rule flow is not found', async () => {
      (ruleFlowRepository.findRuleFlowFromDB as jest.Mock).mockResolvedValue(null);

      const result = await ruleFlowService.findRuleFlow(mockRuleId, mockTenantId);

      expect(result).toBeNull();
    });
  });

  describe('updateRuleFlow', () => {
    it('should update rule flow for rule_builder category', async () => {
      const flowData = {
        flow_json: { nodes: [{ id: '1' }], edges: [] },
        ts_file_base64: 'updatedBase64',
        category: 'rule_builder',
        status: 'updated',
      };

      const mockUpdatedRuleFlow = {
        id: 'flow-123',
        rule_id: mockRuleId,
        flow_json: flowData.flow_json,
        ts_file_base64: flowData.ts_file_base64,
        status: flowData.status,
        tenant_id: mockTenantId,
      };

      (ruleFlowRepository.updateRuleFlowInDB as jest.Mock).mockResolvedValue(mockUpdatedRuleFlow);

      const result = await ruleFlowService.updateRuleFlow(mockRuleId, flowData, mockTenantId);

      expect(ruleFlowRepository.updateRuleFlowInDB).toHaveBeenCalledWith(
        expect.stringContaining('flow_json_rule_builder'),
        expect.stringContaining('flow_json_rule_builder as flow_json'),
        mockRuleId,
        {
          flowJson: flowData.flow_json,
          tsFileBase64: flowData.ts_file_base64,
          status: flowData.status,
        },
        mockTenantId,
      );
      expect(result).toEqual(mockUpdatedRuleFlow);
    });

    it('should update rule flow for test_case_generation category', async () => {
      const flowData = {
        flow_json: { nodes: [{ id: '1' }], edges: [] },
        ts_file_base64: 'updatedBase64',
        category: 'test_case_generation',
        status: 'completed',
      };

      const mockUpdatedRuleFlow = {
        id: 'flow-123',
        rule_id: mockRuleId,
        flow_json: flowData.flow_json,
        ts_file_base64: flowData.ts_file_base64,
        status: flowData.status,
        tenant_id: mockTenantId,
      };

      (ruleFlowRepository.updateRuleFlowInDB as jest.Mock).mockResolvedValue(mockUpdatedRuleFlow);

      const result = await ruleFlowService.updateRuleFlow(mockRuleId, flowData, mockTenantId);

      expect(ruleFlowRepository.updateRuleFlowInDB).toHaveBeenCalledWith(
        expect.stringContaining('flow_json_test_case'),
        expect.stringContaining('flow_json_test_case as flow_json'),
        mockRuleId,
        {
          flowJson: flowData.flow_json,
          tsFileBase64: flowData.ts_file_base64,
          status: flowData.status,
        },
        mockTenantId,
      );
      expect(result).toEqual(mockUpdatedRuleFlow);
    });

    it('should update rule flow without ts_file_base64', async () => {
      const flowData = {
        flow_json: { nodes: [{ id: '1' }], edges: [] },
        category: 'rule_builder',
        status: 'updated',
      };

      const mockUpdatedRuleFlow = {
        id: 'flow-123',
        rule_id: mockRuleId,
        flow_json: flowData.flow_json,
        ts_file_base64: '',
        status: flowData.status,
        tenant_id: mockTenantId,
      };

      (ruleFlowRepository.updateRuleFlowInDB as jest.Mock).mockResolvedValue(mockUpdatedRuleFlow);

      const result = await ruleFlowService.updateRuleFlow(mockRuleId, flowData, mockTenantId);

      expect(ruleFlowRepository.updateRuleFlowInDB).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        mockRuleId,
        {
          flowJson: flowData.flow_json,
          tsFileBase64: '',
          status: flowData.status,
        },
        mockTenantId,
      );
      expect(result).toEqual(mockUpdatedRuleFlow);
    });

    it('should throw error for invalid category', async () => {
      const flowData = {
        flow_json: { nodes: [], edges: [] },
        category: 'invalid_category',
        status: 'active',
      };

      await expect(ruleFlowService.updateRuleFlow(mockRuleId, flowData, mockTenantId)).rejects.toThrow(
        new HttpException(`Invalid category for updating rule flow: invalid_category`, HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('getRuleFlowStatus', () => {
    it('should get rule flow status for rule_builder category', async () => {
      const mockStatus = {
        id: 'flow-123',
        rule_id: mockRuleId,
        status: 'active',
      };

      (ruleFlowRepository.findRuleFlowStatusFromDB as jest.Mock).mockResolvedValue(mockStatus);

      const result = await ruleFlowService.getRuleFlowStatus(mockRuleId, mockTenantId, { category: 'rule_builder' });

      expect(ruleFlowRepository.findRuleFlowStatusFromDB).toHaveBeenCalledWith(
        mockRuleId,
        mockTenantId,
        'id, rule_id, status_rule_builder as status',
        'trs_rule_flow',
      );
      expect(result).toEqual(mockStatus);
    });

    it('should get rule flow status for test_case_generation category', async () => {
      const mockStatus = {
        id: 'flow-123',
        rule_id: mockRuleId,
        status: 'pending',
      };

      (ruleFlowRepository.findRuleFlowStatusFromDB as jest.Mock).mockResolvedValue(mockStatus);

      const result = await ruleFlowService.getRuleFlowStatus(mockRuleId, mockTenantId, { category: 'test_case_generation' });

      expect(ruleFlowRepository.findRuleFlowStatusFromDB).toHaveBeenCalledWith(
        mockRuleId,
        mockTenantId,
        'id, rule_id, status_test_case as status',
        'trs_rule_flow',
      );
      expect(result).toEqual(mockStatus);
    });

    it('should get rule flow status without category (both statuses)', async () => {
      const mockStatus = {
        id: 'flow-123',
        rule_id: mockRuleId,
        status_rule_builder: 'active',
        status_test_case: 'pending',
      };

      (ruleFlowRepository.findRuleFlowStatusFromDB as jest.Mock).mockResolvedValue(mockStatus);

      const result = await ruleFlowService.getRuleFlowStatus(mockRuleId, mockTenantId);

      expect(ruleFlowRepository.findRuleFlowStatusFromDB).toHaveBeenCalledWith(
        mockRuleId,
        mockTenantId,
        'id, rule_id, status_rule_builder as status_rule_builder, status_test_case as status_test_case',
        'trs_rule_flow',
      );
      expect(result).toEqual(mockStatus);
    });

    it('should return null when rule flow status is not found', async () => {
      (ruleFlowRepository.findRuleFlowStatusFromDB as jest.Mock).mockResolvedValue(null);

      const result = await ruleFlowService.getRuleFlowStatus(mockRuleId, mockTenantId);

      expect(result).toBeNull();
    });
  });
});
