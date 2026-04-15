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
  executeQueryNodeInDbReadOnly: jest.fn(),
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

  beforeEach(() => {
    jest.clearAllMocks();
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
      (validateQuery.validateSelectQuery as jest.Mock).mockReturnValue([{ type: 'select' }]);
    });

    it('should execute a simple SELECT query with LIMIT enforcement', async () => {
      const mockQuery = 'SELECT * FROM users';
      const mockResult = [{ id: 1, name: 'John' }];

      (nodeRepository.executeQueryNodeInDbReadOnly as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }]) // resolveTenantColumn
        .mockResolvedValueOnce(mockResult); // actual query

      const result = await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration', params: [] }, mockTenantId);

      expect(validateQuery.validateSelectQuery).toHaveBeenCalledWith(mockQuery);
      expect(nodeRepository.executeQueryNodeInDbReadOnly).toHaveBeenLastCalledWith(
        'SELECT * FROM users WHERE tenant_id = $1 LIMIT 10',
        'configuration',
        [mockTenantId],
      );
      expect(result).toEqual(mockResult);
    });

    it('should strip trailing semicolons before processing', async () => {
      const mockQuery = 'SELECT * FROM users;';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDbReadOnly as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(validateQuery.validateSelectQuery).toHaveBeenCalledWith('SELECT * FROM users');
    });

    it('should inject tenant filter into WHERE clause', async () => {
      const mockQuery = 'SELECT * FROM users WHERE status = $1';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDbReadOnly as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration', params: ['active'] }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDbReadOnly).toHaveBeenLastCalledWith(
        'SELECT * FROM users WHERE tenant_id = $2 AND status = $1 LIMIT 10',
        'configuration',
        ['active', mockTenantId],
      );
    });

    it('should inject tenant filter when no WHERE clause exists', async () => {
      const mockQuery = 'SELECT * FROM users ORDER BY created_at DESC';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDbReadOnly as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDbReadOnly).toHaveBeenLastCalledWith(
        'SELECT * FROM users  WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should inject tenant filter before GROUP BY', async () => {
      const mockQuery = 'SELECT status, COUNT(*) FROM users GROUP BY status';
      const mockResult = [{ status: 'active', count: 5 }];

      (nodeRepository.executeQueryNodeInDbReadOnly as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDbReadOnly).toHaveBeenLastCalledWith(
        'SELECT status, COUNT(*) FROM users  WHERE tenant_id = $1 GROUP BY status LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should replace user-supplied LIMIT with enforced LIMIT', async () => {
      const mockQuery = 'SELECT * FROM users LIMIT 1000';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDbReadOnly as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDbReadOnly).toHaveBeenLastCalledWith(
        'SELECT * FROM users  WHERE tenant_id = $1 LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should strip LIMIT with OFFSET and enforce cap', async () => {
      const mockQuery = 'SELECT * FROM users LIMIT 50 OFFSET 100';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDbReadOnly as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDbReadOnly).toHaveBeenLastCalledWith(
        'SELECT * FROM users  WHERE tenant_id = $1 LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should use tenantId column when detected', async () => {
      const mockQuery = 'SELECT * FROM transaction';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDbReadOnly as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenantId' }]) // tenantId instead of tenant_id
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'event_history' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDbReadOnly).toHaveBeenLastCalledWith(
        'SELECT * FROM transaction WHERE tenantId = $1 LIMIT 10',
        'event_history',
        [mockTenantId],
      );
    });

    it('should default to tenant_id when column resolution fails', async () => {
      const mockQuery = 'SELECT * FROM unknown_table';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDbReadOnly as jest.Mock)
        .mockResolvedValueOnce([]) // No tenant column found
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDbReadOnly).toHaveBeenLastCalledWith(
        'SELECT * FROM unknown_table WHERE tenant_id = $1 LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should handle CTE (WITH) queries', async () => {
      const mockQuery = `
        WITH active_users AS (
          SELECT * FROM users WHERE status = 'active'
        )
        SELECT * FROM active_users
      `;
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDbReadOnly as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      const result = await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

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

      expect(nodeRepository.executeQueryNodeInDbReadOnly).not.toHaveBeenCalled();
    });

    it('should handle queries without table names', async () => {
      const mockQuery = 'SELECT 1 AS value';
      const mockResult = [{ value: 1 }];

      (nodeRepository.executeQueryNodeInDbReadOnly as jest.Mock).mockResolvedValueOnce(mockResult);

      const result = await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      // Should execute without tenant injection since no table detected
      expect(nodeRepository.executeQueryNodeInDbReadOnly).toHaveBeenCalledWith('SELECT 1 AS value LIMIT 10', 'configuration', []);
      expect(result).toEqual(mockResult);
    });

    it('should handle errors during tenant column resolution gracefully', async () => {
      const mockQuery = 'SELECT * FROM users';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDbReadOnly as jest.Mock)
        .mockRejectedValueOnce(new Error('Connection error')) // resolveTenantColumn fails
        .mockResolvedValueOnce(mockResult); // actual query still works

      const result = await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      // Should default to tenant_id
      expect(nodeRepository.executeQueryNodeInDbReadOnly).toHaveBeenLastCalledWith(
        'SELECT * FROM users WHERE tenant_id = $1 LIMIT 10',
        'configuration',
        [mockTenantId],
      );
      expect(result).toEqual(mockResult);
    });

    it('should preserve existing parameters and append tenant parameter', async () => {
      const mockQuery = 'SELECT * FROM users WHERE name = $1 AND age > $2';
      const mockParams = ['John', 25];
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDbReadOnly as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration', params: mockParams }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDbReadOnly).toHaveBeenLastCalledWith(
        'SELECT * FROM users WHERE tenant_id = $3 AND name = $1 AND age > $2 LIMIT 10',
        'configuration',
        ['John', 25, mockTenantId],
      );
    });
  });
});
