import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHandlePostExecuteSqlStatement = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandlePostExecuteSqlStatement(...args),
}));

jest.mock('../../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  getRuleRequestByRuleId,
  getRuleConfigById,
  createRuleFlowInDB,
  findRuleFlowFromDB,
  updateRuleFlowInDB,
  findRuleFlowStatusFromDB,
} from '../../../src/repositories/configuration/rule-flow.repository';

describe('Rule Flow Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRuleRequestByRuleId', () => {
    const mockRuleId = 'rule-123';
    const mockTenantId = 'tenant-456';

    it('should return rule request and rule config id when found', async () => {
      const mockRuleRequest = { field1: 'value1', field2: 'value2' };
      const mockRuleConfigId = 'config-789';

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [
          {
            rulerequest: mockRuleRequest,
            rule_config_id: mockRuleConfigId,
          },
        ],
        rowCount: 1,
      });

      const result = await getRuleRequestByRuleId(mockRuleId, mockTenantId);

      expect(result).toEqual({
        rulerequest: mockRuleRequest,
        rule_config_id: mockRuleConfigId,
      });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'SELECT rulerequest, rule_config_id FROM trs_rules WHERE id = $1 AND tenant_id = $2;',
          values: [mockRuleId, mockTenantId],
        }),
        'configuration',
      );
    });

    it('should return null when rule not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await getRuleRequestByRuleId(mockRuleId, mockTenantId);

      expect(result).toBeNull();
    });

    it('should use correct database schema', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [
          {
            rulerequest: {},
            rule_config_id: 'config-id',
          },
        ],
        rowCount: 1,
      });

      await getRuleRequestByRuleId(mockRuleId, mockTenantId);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.anything(), 'configuration');
    });

    it('should handle complex rule request objects', async () => {
      const complexRuleRequest = {
        nested: { data: { structure: 'value' } },
        array: [1, 2, 3],
        boolean: true,
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [
          {
            rulerequest: complexRuleRequest,
            rule_config_id: 'config-id',
          },
        ],
        rowCount: 1,
      });

      const result = await getRuleRequestByRuleId(mockRuleId, mockTenantId);

      expect(result?.rulerequest).toEqual(complexRuleRequest);
    });
  });

  describe('getRuleConfigById', () => {
    const mockRuleConfigId = 'config-123';
    const mockTenantId = 'tenant-456';

    it('should return configuration when found', async () => {
      const mockConfiguration = {
        id: 'config-123',
        cfg: 'v1.0',
        desc: 'Test configuration',
        config: { setting1: 'value1' },
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ configuration: mockConfiguration }],
        rowCount: 1,
      });

      const result = await getRuleConfigById(mockRuleConfigId, mockTenantId);

      expect(result).toEqual({ configuration: mockConfiguration });
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'SELECT configuration FROM rule WHERE "ruleid" = $1 AND "tenantid" = $2;',
          values: [mockRuleConfigId, mockTenantId],
        }),
        'configuration',
      );
    });

    it('should return null configuration when not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await getRuleConfigById(mockRuleConfigId, mockTenantId);

      expect(result).toEqual({ configuration: null });
    });

    it('should use quoted column names in query', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await getRuleConfigById(mockRuleConfigId, mockTenantId);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('"ruleid"');
      expect(callArg.text).toContain('"tenantid"');
    });

    it('should handle complex configuration objects', async () => {
      const complexConfig = {
        id: 'config-123',
        cfg: 'v2.0',
        desc: 'Complex config',
        config: {
          nested: { deep: { structure: true } },
          arrays: [
            [1, 2],
            [3, 4],
          ],
        },
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ configuration: complexConfig }],
        rowCount: 1,
      });

      const result = await getRuleConfigById(mockRuleConfigId, mockTenantId);

      expect(result.configuration).toEqual(complexConfig);
    });
  });

  describe('createRuleFlowInDB', () => {
    const mockRuleFlowData = {
      rule_id: 'rule-123',
      tenantId: 'tenant-456',
      flowData: {
        flow_json_rule_builder: { nodes: [], edges: [] },
        flow_json_test_case: { cases: [] },
      },
    };

    const mockResponse = {
      id: 'flow-789',
      rule_id: 'rule-123',
      flow_json_rule_builder: { nodes: [], edges: [] },
      flow_json_test_case: { cases: [] },
      tenant_id: 'tenant-456',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };

    it('should create rule flow successfully', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockResponse],
        rowCount: 1,
      });

      const result = await createRuleFlowInDB(mockRuleFlowData);

      expect(result).toEqual(mockResponse);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('INSERT INTO trs_rule_flow'),
          values: [
            'rule-123',
            JSON.stringify(mockRuleFlowData.flowData.flow_json_rule_builder),
            JSON.stringify(mockRuleFlowData.flowData.flow_json_test_case),
            'tenant-456',
          ],
        }),
        'configuration',
      );
    });

    it('should stringify JSON fields correctly', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockResponse],
        rowCount: 1,
      });

      await createRuleFlowInDB(mockRuleFlowData);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(typeof callArg.values[1]).toBe('string');
      expect(typeof callArg.values[2]).toBe('string');
      expect(JSON.parse(callArg.values[1] as string)).toEqual(mockRuleFlowData.flowData.flow_json_rule_builder);
      expect(JSON.parse(callArg.values[2] as string)).toEqual(mockRuleFlowData.flowData.flow_json_test_case);
    });

    it('should include all required columns in INSERT', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockResponse],
        rowCount: 1,
      });

      await createRuleFlowInDB(mockRuleFlowData);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('rule_id');
      expect(callArg.text).toContain('flow_json_rule_builder');
      expect(callArg.text).toContain('flow_json_test_case');
      expect(callArg.text).toContain('tenant_id');
      expect(callArg.text).toContain('updated_at');
      expect(callArg.text).toContain('created_at');
    });

    it('should use NOW() for timestamps', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockResponse],
        rowCount: 1,
      });

      await createRuleFlowInDB(mockRuleFlowData);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('NOW()');
    });

    it('should return all columns in RETURNING clause', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockResponse],
        rowCount: 1,
      });

      await createRuleFlowInDB(mockRuleFlowData);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('RETURNING');
      expect(callArg.text).toContain('id');
      expect(callArg.text).toContain('rule_id');
      expect(callArg.text).toContain('tenant_id');
      expect(callArg.text).toContain('created_at');
      expect(callArg.text).toContain('updated_at');
    });

    it('should handle complex flow data structures', async () => {
      const complexFlowData = {
        rule_id: 'rule-123',
        tenantId: 'tenant-456',
        flowData: {
          flow_json_rule_builder: {
            nodes: [
              { id: '1', type: 'start' },
              { id: '2', type: 'end' },
            ],
            edges: [{ source: '1', target: '2' }],
          },
          flow_json_test_case: {
            cases: [{ input: 'test', expected: 'result' }],
          },
        },
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockResponse],
        rowCount: 1,
      });

      const result = await createRuleFlowInDB(complexFlowData);

      expect(result).toEqual(mockResponse);
    });
  });

  describe('findRuleFlowFromDB', () => {
    const mockRuleId = 'rule-123';
    const mockTenantId = 'tenant-456';

    it('should find rule flow with all columns', async () => {
      const mockRuleFlow = {
        id: 'flow-789',
        rule_id: 'rule-123',
        flow_json_rule_builder: { nodes: [] },
        flow_json_test_case: { cases: [] },
        tenant_id: 'tenant-456',
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockRuleFlow],
        rowCount: 1,
      });

      const result = await findRuleFlowFromDB(mockRuleId, mockTenantId, '*');

      expect(result).toEqual(mockRuleFlow);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: [mockRuleId, mockTenantId],
        }),
        'configuration',
      );
      const sqlArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(sqlArg.text).toContain('SELECT *');
      expect(sqlArg.text).toContain('FROM trs_rule_flow');
      expect(sqlArg.text).toContain('WHERE rule_id = $1 AND tenant_id = $2');
      expect(sqlArg.text).toContain('LIMIT 1');
    });

    it('should find rule flow with specific columns', async () => {
      const mockRuleFlow = {
        id: 'flow-789',
        status: 'active',
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockRuleFlow],
        rowCount: 1,
      });

      const result = await findRuleFlowFromDB(mockRuleId, mockTenantId, 'id, status');

      expect(result).toEqual(mockRuleFlow);
      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('SELECT id, status');
    });

    it('should return null when rule flow not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await findRuleFlowFromDB(mockRuleId, mockTenantId, '*');

      expect(result).toBeNull();
    });

    it('should limit results to 1', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ id: 'flow-1' }],
        rowCount: 1,
      });

      await findRuleFlowFromDB(mockRuleId, mockTenantId, 'id');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('LIMIT 1');
    });

    it('should handle different select clauses', async () => {
      const selectClauses = ['id, rule_id', 'flow_json_rule_builder', 'id, tenant_id, created_at'];

      for (const selectClause of selectClauses) {
        mockHandlePostExecuteSqlStatement.mockResolvedValue({
          rows: [{ id: 'test' }],
          rowCount: 1,
        });

        await findRuleFlowFromDB(mockRuleId, mockTenantId, selectClause);

        const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[
          mockHandlePostExecuteSqlStatement.mock.calls.length - 1
        ][0] as { text: string };
        expect(callArg.text).toContain(`SELECT ${selectClause}`);
      }
    });
  });

  describe('updateRuleFlowInDB', () => {
    const mockRuleId = 'rule-123';
    const mockTenantId = 'tenant-456';
    const mockFlowData = {
      flowJson: { nodes: [], edges: [] },
      tsFileBase64: 'base64encodedstring',
      status: 'active',
    };

    const mockUpdatedFlow = {
      id: 'flow-789',
      rule_id: 'rule-123',
      flow_json_rule_builder: { nodes: [], edges: [] },
      status: 'active',
      updated_at: '2026-01-02T00:00:00.000Z',
    };

    it('should update rule flow successfully', async () => {
      const setClause = 'flow_json_rule_builder = $2, ts_file_base64 = $3, status = $4,';
      const returningClause = 'id, rule_id, flow_json_rule_builder, status, updated_at';

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedFlow],
        rowCount: 1,
      });

      const result = await updateRuleFlowInDB(setClause, returningClause, mockRuleId, mockFlowData, mockTenantId);

      expect(result).toEqual(mockUpdatedFlow);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: [mockRuleId, JSON.stringify(mockFlowData.flowJson), mockFlowData.tsFileBase64, mockFlowData.status, mockTenantId],
        }),
        'configuration',
      );
      const sqlArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(sqlArg.text).toContain('UPDATE trs_rule_flow SET');
      expect(sqlArg.text).toContain('WHERE rule_id = $1 AND tenant_id = $5');
      expect(sqlArg.text).toContain('RETURNING');
    });

    it('should return null when rule flow not found', async () => {
      const setClause = 'status = $4,';
      const returningClause = 'id';

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await updateRuleFlowInDB(setClause, returningClause, mockRuleId, mockFlowData, mockTenantId);

      expect(result).toBeNull();
    });

    it('should include updated_at = NOW() in query', async () => {
      const setClause = 'status = $4,';
      const returningClause = 'id';

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedFlow],
        rowCount: 1,
      });

      await updateRuleFlowInDB(setClause, returningClause, mockRuleId, mockFlowData, mockTenantId);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('updated_at = NOW()');
    });

    it('should stringify flowJson correctly', async () => {
      const setClause = 'flow_json_rule_builder = $2,';
      const returningClause = 'id';

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedFlow],
        rowCount: 1,
      });

      await updateRuleFlowInDB(setClause, returningClause, mockRuleId, mockFlowData, mockTenantId);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(typeof callArg.values[1]).toBe('string');
      expect(JSON.parse(callArg.values[1] as string)).toEqual(mockFlowData.flowJson);
    });

    it('should handle different set and returning clauses', async () => {
      const testCases = [
        {
          setClause: 'status = $4,',
          returningClause: 'id, status',
        },
        {
          setClause: 'flow_json_rule_builder = $2, status = $4,',
          returningClause: 'id, rule_id, status, updated_at',
        },
        {
          setClause: 'ts_file_base64 = $3,',
          returningClause: '*',
        },
      ];

      for (const testCase of testCases) {
        mockHandlePostExecuteSqlStatement.mockResolvedValue({
          rows: [mockUpdatedFlow],
          rowCount: 1,
        });

        await updateRuleFlowInDB(testCase.setClause, testCase.returningClause, mockRuleId, mockFlowData, mockTenantId);

        const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[
          mockHandlePostExecuteSqlStatement.mock.calls.length - 1
        ][0] as { text: string };
        expect(callArg.text).toContain(testCase.setClause);
        expect(callArg.text).toContain(`RETURNING ${testCase.returningClause}`);
      }
    });

    it('should use correct parameter positions', async () => {
      const setClause = 'flow_json_rule_builder = $2, ts_file_base64 = $3, status = $4,';
      const returningClause = 'id';

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockUpdatedFlow],
        rowCount: 1,
      });

      await updateRuleFlowInDB(setClause, returningClause, mockRuleId, mockFlowData, mockTenantId);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('rule_id = $1');
      expect(callArg.text).toContain('tenant_id = $5');
    });
  });

  describe('findRuleFlowStatusFromDB', () => {
    const mockRuleId = 'rule-123';
    const mockTenantId = 'tenant-456';

    it('should find rule flow status with default table', async () => {
      const mockStatus = {
        id: 'flow-789',
        rule_id: 'rule-123',
        status: 'active',
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [mockStatus],
        rowCount: 1,
      });

      const result = await findRuleFlowStatusFromDB(mockRuleId, mockTenantId, 'id, rule_id, status', 'trs_rule_flow');

      expect(result).toEqual(mockStatus);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          values: [mockRuleId, mockTenantId],
        }),
        'configuration',
      );
      const sqlArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(sqlArg.text).toContain('SELECT id, rule_id, status');
      expect(sqlArg.text).toContain('FROM trs_rule_flow');
      expect(sqlArg.text).toContain('WHERE rule_id = $1 AND tenant_id = $2');
      expect(sqlArg.text).toContain('LIMIT 1');
    });

    it('should return null when status not found', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await findRuleFlowStatusFromDB(mockRuleId, mockTenantId, 'status', 'trs_rule_flow');

      expect(result).toBeNull();
    });

    it('should handle different table names', async () => {
      const tables = ['trs_rule_flow', 'trs_rules', 'rule_config'];

      for (const table of tables) {
        mockHandlePostExecuteSqlStatement.mockResolvedValue({
          rows: [{ status: 'active' }],
          rowCount: 1,
        });

        await findRuleFlowStatusFromDB(mockRuleId, mockTenantId, 'status', table);

        const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[
          mockHandlePostExecuteSqlStatement.mock.calls.length - 1
        ][0] as { text: string };
        expect(callArg.text).toContain(`FROM ${table}`);
      }
    });

    it('should handle different select clauses', async () => {
      const selectClauses = ['status', 'id, status', '*', 'status, updated_at, created_at'];

      for (const selectClause of selectClauses) {
        mockHandlePostExecuteSqlStatement.mockResolvedValue({
          rows: [{ id: 'test' }],
          rowCount: 1,
        });

        await findRuleFlowStatusFromDB(mockRuleId, mockTenantId, selectClause, 'trs_rule_flow');

        const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[
          mockHandlePostExecuteSqlStatement.mock.calls.length - 1
        ][0] as { text: string };
        expect(callArg.text).toContain(`SELECT ${selectClause}`);
      }
    });

    it('should limit results to 1', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ status: 'active' }],
        rowCount: 1,
      });

      await findRuleFlowStatusFromDB(mockRuleId, mockTenantId, 'status', 'trs_rule_flow');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('LIMIT 1');
    });

    it('should use correct database schema', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [{ status: 'active' }],
        rowCount: 1,
      });

      await findRuleFlowStatusFromDB(mockRuleId, mockTenantId, 'status', 'trs_rule_flow');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.anything(), 'configuration');
    });

    it('should handle complex status objects', async () => {
      const complexStatus = {
        id: 'flow-789',
        status: 'active',
        metadata: { lastModified: '2026-01-01', user: 'admin' },
        details: { step: 1, total: 5 },
      };

      mockHandlePostExecuteSqlStatement.mockResolvedValue({
        rows: [complexStatus],
        rowCount: 1,
      });

      const result = await findRuleFlowStatusFromDB(mockRuleId, mockTenantId, 'id, status, metadata, details', 'trs_rule_flow');

      expect(result).toEqual(complexStatus);
    });
  });
});
