// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { HttpException, HttpStatus } from '../../src/utils/error';

// Mock the logger service
jest.mock('../../src', () => ({
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the repository
jest.mock('../../src/repositories/configuration/node.repository', () => ({
  getNodeByIdFromDb: jest.fn(),
  insertNodesIntoDb: jest.fn(),
  deleteNodeByIdFromDB: jest.fn(),
  getAllNodes: jest.fn(),
  getNodeByName: jest.fn(),
  executeQueryNodeInDb: jest.fn(),
}));

// Mock the validateQuery utility
jest.mock('../../src/utils/validateQuery', () => ({
  validateSelectQuery: jest.fn(),
}));

import * as nodeLogicService from '../../src/services/node.logic.service';
import * as nodeRepository from '../../src/repositories/configuration/node.repository';
import * as validateQuery from '../../src/utils/validateQuery';

describe('Node Logic Service', () => {
  const mockTenantId = 'tenant-123';
  const mockNodeId = 1;

  // Helper function to create mock AST for a simple SELECT query
  const createMockAST = (tableName: string) => [
    {
      type: 'select',
      columns: [{ expr: { type: 'ref', name: '*' } }],
      from: [{ type: 'table', name: { name: tableName } }],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock for validateSelectQuery - returns AST for 'users' table
    (validateQuery.validateSelectQuery as jest.Mock).mockImplementation(() => [
      {
        type: 'select',
        columns: [{ expr: { type: 'ref', name: '*' } }],
        from: [{ type: 'table', name: { name: 'users' } }],
      },
    ]);
  });

  describe('getNodeById', () => {
    it('should return node when found', async () => {
      const mockNodes = [{ id: mockNodeId, tenant_id: mockTenantId, node_json: { name: 'test' } }];
      (nodeRepository.getNodeByIdFromDb as jest.Mock).mockResolvedValue(mockNodes);

      const result = await nodeLogicService.getNodeById(mockNodeId, mockTenantId);

      expect(nodeRepository.getNodeByIdFromDb).toHaveBeenCalledWith(mockNodeId, mockTenantId);
      expect(result).toEqual(mockNodes);
    });

    it('should return null when no node found', async () => {
      (nodeRepository.getNodeByIdFromDb as jest.Mock).mockResolvedValue([]);

      const result = await nodeLogicService.getNodeById(mockNodeId, mockTenantId);

      expect(result).toBeNull();
    });

    it('should return null when result is null', async () => {
      (nodeRepository.getNodeByIdFromDb as jest.Mock).mockResolvedValue(null);

      const result = await nodeLogicService.getNodeById(mockNodeId, mockTenantId);

      expect(result).toBeNull();
    });
  });

  describe('createNode', () => {
    it('should create a single node successfully', async () => {
      const mockNodeData = [
        {
          tenant_id: mockTenantId,
          node_json: { name: 'test-node', type: 'processor' },
          created_by: 'user-123',
          order: 1,
        },
      ];
      const mockCreatedNode = [{ id: 1, ...mockNodeData[0] }];

      (nodeRepository.getNodeByName as jest.Mock).mockResolvedValue([]);
      (nodeRepository.insertNodesIntoDb as jest.Mock).mockResolvedValue(mockCreatedNode);

      const result = await nodeLogicService.createNode(mockNodeData);

      expect(nodeRepository.getNodeByName).toHaveBeenCalledWith('test-node', mockTenantId);
      expect(nodeRepository.insertNodesIntoDb).toHaveBeenCalledWith(mockNodeData);
      expect(result).toEqual(mockCreatedNode);
    });

    it('should create multiple nodes successfully', async () => {
      const mockNodeData = [
        {
          tenant_id: mockTenantId,
          node_json: { name: 'node-1', type: 'processor' },
          created_by: 'user-123',
          order: 1,
        },
        {
          tenant_id: mockTenantId,
          node_json: { name: 'node-2', type: 'processor' },
          created_by: 'user-123',
          order: 2,
        },
      ];
      const mockCreatedNodes = mockNodeData.map((node, idx) => ({ id: idx + 1, ...node }));

      (nodeRepository.getNodeByName as jest.Mock).mockResolvedValue([]);
      (nodeRepository.insertNodesIntoDb as jest.Mock).mockResolvedValue(mockCreatedNodes);

      const result = await nodeLogicService.createNode(mockNodeData);

      expect(nodeRepository.getNodeByName).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockCreatedNodes);
    });

    it('should throw error when node name already exists', async () => {
      const mockNodeData = [
        {
          tenant_id: mockTenantId,
          node_json: { name: 'existing-node', type: 'processor' },
          created_by: 'user-123',
          order: 1,
        },
      ];

      (nodeRepository.getNodeByName as jest.Mock).mockResolvedValue([{ id: 1, name: 'existing-node' }]);

      await expect(nodeLogicService.createNode(mockNodeData)).rejects.toThrow(
        new HttpException(`Node with name "existing-node" already exists for tenant "${mockTenantId}"`, HttpStatus.CONFLICT),
      );

      expect(nodeRepository.insertNodesIntoDb).not.toHaveBeenCalled();
    });

    it('should throw error when no data returned from insert', async () => {
      const mockNodeData = [
        {
          tenant_id: mockTenantId,
          node_json: { name: 'test-node', type: 'processor' },
          created_by: 'user-123',
          order: 1,
        },
      ];

      (nodeRepository.getNodeByName as jest.Mock).mockResolvedValue([]);
      (nodeRepository.insertNodesIntoDb as jest.Mock).mockResolvedValue([]);

      await expect(nodeLogicService.createNode(mockNodeData)).rejects.toThrow(
        new HttpException('Failed to create node(s): No data returned', HttpStatus.INTERNAL_SERVER_ERROR),
      );
    });
  });

  describe('deleteNodeById', () => {
    it('should delete node successfully', async () => {
      (nodeRepository.deleteNodeByIdFromDB as jest.Mock).mockResolvedValue(undefined);

      await nodeLogicService.deleteNodeById(mockNodeId, mockTenantId);

      expect(nodeRepository.deleteNodeByIdFromDB).toHaveBeenCalledWith(mockNodeId, mockTenantId);
    });
  });

  describe('findAllNodes', () => {
    it('should find all nodes with tenant filter', async () => {
      const mockNodes = [
        { id: 1, tenant_id: mockTenantId, node_json: { name: 'node-1' } },
        { id: 2, tenant_id: mockTenantId, node_json: { name: 'node-2' } },
      ];

      (nodeRepository.getAllNodes as jest.Mock).mockResolvedValue(mockNodes);

      const result = await nodeLogicService.findAllNodes(mockTenantId);

      expect(nodeRepository.getAllNodes).toHaveBeenCalledWith(
        'WHERE tenant_id IN ($1, $2)',
        ['default', mockTenantId],
        'created_at',
        'desc',
      );
      expect(result).toEqual(mockNodes);
    });

    it('should find nodes with type filter', async () => {
      const mockNodes = [{ id: 1, tenant_id: mockTenantId, node_json: { type: 'processor' } }];

      (nodeRepository.getAllNodes as jest.Mock).mockResolvedValue(mockNodes);

      const result = await nodeLogicService.findAllNodes(mockTenantId, { type: 'processor' });

      expect(nodeRepository.getAllNodes).toHaveBeenCalledWith(
        "WHERE tenant_id IN ($1, $2) AND node_json->>'type' = $3",
        ['default', mockTenantId, 'processor'],
        'created_at',
        'desc',
      );
      expect(result).toEqual(mockNodes);
    });

    it('should find nodes with category filter', async () => {
      const mockNodes = [{ id: 1, tenant_id: mockTenantId, node_json: { category: 'input' } }];

      (nodeRepository.getAllNodes as jest.Mock).mockResolvedValue(mockNodes);

      const result = await nodeLogicService.findAllNodes(mockTenantId, { category: 'input' });

      expect(nodeRepository.getAllNodes).toHaveBeenCalledWith(
        "WHERE tenant_id IN ($1, $2) AND node_json->>'category' = $3",
        ['default', mockTenantId, 'input'],
        'created_at',
        'desc',
      );
      expect(result).toEqual(mockNodes);
    });

    it('should find nodes with custom sort', async () => {
      const mockNodes = [{ id: 1, tenant_id: mockTenantId }];

      (nodeRepository.getAllNodes as jest.Mock).mockResolvedValue(mockNodes);

      const result = await nodeLogicService.findAllNodes(mockTenantId, { sortBy: 'updated_at', sortOrder: 'asc' });

      expect(nodeRepository.getAllNodes).toHaveBeenCalledWith(
        'WHERE tenant_id IN ($1, $2)',
        ['default', mockTenantId],
        'updated_at',
        'asc',
      );
      expect(result).toEqual(mockNodes);
    });

    it('should handle empty tenant id', async () => {
      const mockNodes = [{ id: 1, tenant_id: 'default' }];

      (nodeRepository.getAllNodes as jest.Mock).mockResolvedValue(mockNodes);

      const result = await nodeLogicService.findAllNodes('');

      expect(nodeRepository.getAllNodes).toHaveBeenCalledWith('WHERE tenant_id = $1', ['default'], 'created_at', 'desc');
      expect(result).toEqual(mockNodes);
    });
  });

  describe('executeSelectQuery', () => {
    beforeEach(() => {
      (validateQuery.validateSelectQuery as jest.Mock).mockReturnValue(createMockAST('users'));
    });

    it('should execute a simple SELECT query with LIMIT enforcement', async () => {
      const mockQuery = 'SELECT * FROM users';
      const mockResult = [{ id: 1, name: 'John' }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }]) // resolveTenantColumn
        .mockResolvedValueOnce(mockResult); // actual query

      const result = await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration', params: [] }, mockTenantId);

      expect(validateQuery.validateSelectQuery).toHaveBeenCalledWith(mockQuery);
      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('information_schema.columns'),
        'configuration',
        ['users'],
      );
      expect(result).toEqual(mockResult);
    });

    it('should strip trailing semicolons before processing', async () => {
      const mockQuery = 'SELECT * FROM users;';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(validateQuery.validateSelectQuery).toHaveBeenCalledWith('SELECT * FROM users');
    });

    it('should inject tenant filter into WHERE clause', async () => {
      const mockQuery = 'SELECT * FROM users WHERE status = $1';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }]) // resolveTenantColumn
        .mockResolvedValueOnce(mockResult); // actual query

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration', params: ['active'] }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users WHERE status = $1) _q WHERE tenant_id = $2 LIMIT 10',
        'configuration',
        ['active', mockTenantId],
      );
    });

    it('should inject tenant filter when no WHERE clause exists', async () => {
      const mockQuery = 'SELECT * FROM users ORDER BY created_at DESC';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users ORDER BY created_at DESC) _q WHERE tenant_id = $1 LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should inject tenant filter before GROUP BY', async () => {
      const mockQuery = 'SELECT status, COUNT(*) FROM users GROUP BY status';
      const mockResult = [{ status: 'active', count: 5 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT status, COUNT(*) FROM users GROUP BY status) _q WHERE tenant_id = $1 LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should replace user-supplied LIMIT with enforced LIMIT', async () => {
      const mockQuery = 'SELECT * FROM users LIMIT 1000';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users LIMIT 1000) _q WHERE tenant_id = $1 LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should strip LIMIT with OFFSET and enforce cap', async () => {
      const mockQuery = 'SELECT * FROM users LIMIT 50 OFFSET 100';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users LIMIT 50 OFFSET 100) _q WHERE tenant_id = $1 LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should strip standalone OFFSET and enforce cap', async () => {
      const mockQuery = 'SELECT * FROM users OFFSET 50';
      const mockResult = [{ id: 1 }];

      (validateQuery.validateSelectQuery as jest.Mock).mockReturnValue(createMockAST('users'));
      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users OFFSET 50) _q WHERE tenant_id = $1 LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should strip FETCH FIRST and enforce cap', async () => {
      const mockQuery = 'SELECT * FROM users FETCH FIRST 50 ROWS ONLY';
      const mockResult = [{ id: 1 }];

      (validateQuery.validateSelectQuery as jest.Mock).mockReturnValue(createMockAST('users'));
      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users FETCH FIRST 50 ROWS ONLY) _q WHERE tenant_id = $1 LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should strip FETCH NEXT and enforce cap', async () => {
      const mockQuery = 'SELECT * FROM users FETCH NEXT 100 ROW ONLY';
      const mockResult = [{ id: 1 }];

      (validateQuery.validateSelectQuery as jest.Mock).mockReturnValue(createMockAST('users'));
      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users FETCH NEXT 100 ROW ONLY) _q WHERE tenant_id = $1 LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should use tenantId column when detected', async () => {
      const mockQuery = 'SELECT * FROM transaction';
      const mockResult = [{ id: 1 }];

      (validateQuery.validateSelectQuery as jest.Mock).mockReturnValue(createMockAST('transaction'));
      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenantId' }]) // tenantId instead of tenant_id
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'event_history' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM transaction) _q WHERE tenantId = $1 LIMIT 10',
        'event_history',
        [mockTenantId],
      );
    });

    it('should skip tenant filter when no tenant column is found', async () => {
      const mockQuery = 'SELECT * FROM unknown_table';
      const mockResult = [{ id: 1 }];

      (validateQuery.validateSelectQuery as jest.Mock).mockReturnValue(createMockAST('unknown_table'));
      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([]) // No tenant column found
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM unknown_table) _q  LIMIT 10',
        'configuration',
        [],
      );
    });

    it('should inject tenant filter for base table inside a CTE query', async () => {
      const mockQuery = `
        WITH active_users AS (
          SELECT * FROM users WHERE status = 'active'
        )
        SELECT * FROM active_users
      `;
      const mockResult = [{ id: 1 }];

      // WITH queries should still extract base tables from CTE bodies.
      (validateQuery.validateSelectQuery as jest.Mock).mockReturnValue([
        {
          type: 'with',
          bind: [
            {
              alias: 'active_users',
              statement: {
                type: 'select',
                from: [{ type: 'table', name: { name: 'users' } }],
              },
            },
          ],
          in: {
            type: 'select',
            from: [{ type: 'table', name: { name: 'active_users' } }],
          },
        },
      ]);
      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }]) // resolveTenantColumn
        .mockResolvedValueOnce(mockResult); // actual query

      const result = await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      // Should resolve tenant column for base table 'users'
      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenCalledWith(
        expect.stringContaining('information_schema.columns'),
        'configuration',
        ['users'],
      );
      // Should wrap entire query and apply tenant filter on outer query
      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        expect.stringContaining('SELECT * FROM ('),
        'configuration',
        [mockTenantId],
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw error when validation fails', async () => {
      const mockQuery = 'INSERT INTO users VALUES (1)';

      (validateQuery.validateSelectQuery as jest.Mock).mockImplementation(() => {
        throw new Error('Only SELECT queries are allowed. Got: insert');
      });

      await expect(nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId)).rejects.toThrow(
        new HttpException('Only SELECT queries are allowed. Got: insert', HttpStatus.FORBIDDEN),
      );

      expect(nodeRepository.executeQueryNodeInDb).not.toHaveBeenCalled();
    });

    it('should always wrap and apply tenant filter even if query already has tenant condition', async () => {
      const mockQuery = 'SELECT * FROM transaction WHERE TenantId = $1';
      const mockResult = [{ id: 1 }];

      (validateQuery.validateSelectQuery as jest.Mock).mockReturnValue(createMockAST('transaction'));
      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenantId' }])
        .mockResolvedValueOnce(mockResult);

      const result = await nodeLogicService.executeSelectQuery(
        { query: mockQuery, dbName: 'event_history', params: ['tenant-456'] },
        mockTenantId,
      );

      // New behavior: always wrap and apply outer tenant filter via subquery
      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM transaction WHERE TenantId = $1) _q WHERE tenantId = $2 LIMIT 10',
        'event_history',
        ['tenant-456', mockTenantId],
      );
      expect(result).toEqual(mockResult);
    });

    it('should always wrap and apply tenant filter even with existing tenant_id condition', async () => {
      const mockQuery = 'SELECT * FROM users WHERE status = $1 AND tenant_id = $2';
      const mockResult = [{ id: 1 }];

      (validateQuery.validateSelectQuery as jest.Mock).mockReturnValue(createMockAST('users'));
      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      const result = await nodeLogicService.executeSelectQuery(
        { query: mockQuery, dbName: 'configuration', params: ['active', 'tenant-789'] },
        mockTenantId,
      );

      // New behavior: always wrap and apply outer tenant filter via subquery
      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users WHERE status = $1 AND tenant_id = $2) _q WHERE tenant_id = $3 LIMIT 10',
        'configuration',
        ['active', 'tenant-789', mockTenantId],
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw when query has no tables', async () => {
      const mockQuery = 'SELECT 1 AS value';

      // Query without FROM clause
      (validateQuery.validateSelectQuery as jest.Mock).mockReturnValue([
        {
          type: 'select',
          columns: [{ expr: { type: 'integer', value: 1 }, alias: { name: 'value' } }],
        },
      ]);

      await expect(nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId)).rejects.toThrow(
        new HttpException('Query must reference at least one base table.', HttpStatus.FORBIDDEN),
      );

      expect(nodeRepository.executeQueryNodeInDb).not.toHaveBeenCalled();
    });

    it('should skip tenant filter when tenant column lookup fails', async () => {
      const mockQuery = 'SELECT * FROM users';
      const mockResult = [{ id: 1 }];

      (validateQuery.validateSelectQuery as jest.Mock).mockReturnValue(createMockAST('users'));
      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockRejectedValueOnce(new Error('Connection error')) // resolveTenantColumn call fails
        .mockResolvedValueOnce(mockResult); // outer query still executes

      // When tenant column lookup fails, gracefully skip tenant filtering for that table
      const result = await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      // Query executes without tenant filter due to column lookup failure
      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users) _q  LIMIT 10',
        'configuration',
        [],
      );
      expect(result).toEqual(mockResult);
    });


  });
});
