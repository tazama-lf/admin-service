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

jest.mock('../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: jest.fn(),
}));

import * as nodeLogicService from '../../src/services/node.logic.service';
import * as nodeRepository from '../../src/repositories/configuration/node.repository';
import * as validateQuery from '../../src/utils/validateQuery';
import { handlePostExecuteSqlStatement } from '../../src/services/database.logic.service';

describe('Node Logic Service', () => {
  const mockTenantId = 'tenant-123';
  const mockNodeId = 1;

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
      // Restore real validateSelectQuery — _location offsets from the real parser are
      // required by injectTenantCondition. Tests needing a custom AST mock per-test.
      const real = jest.requireActual<typeof import('../../src/utils/validateQuery')>('../../src/utils/validateQuery');
      (validateQuery.validateSelectQuery as jest.Mock).mockImplementation((q: unknown) => real.validateSelectQuery(q as string));
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
        'SELECT * FROM (SELECT * FROM users WHERE status = $1 AND tenant_id = $2) _q LIMIT 10',
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
        'SELECT * FROM (SELECT * FROM users WHERE tenant_id = $1 ORDER BY created_at DESC) _q LIMIT 10',
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
        'SELECT * FROM (SELECT status, COUNT(*) FROM users WHERE tenant_id = $1 GROUP BY status) _q LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should cap rows while preserving user-supplied LIMIT inside subquery', async () => {
      const mockQuery = 'SELECT * FROM users LIMIT 1000';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users WHERE tenant_id = $1 LIMIT 1000) _q LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should cap rows with LIMIT OFFSET inside subquery', async () => {
      const mockQuery = 'SELECT * FROM users LIMIT 50 OFFSET 100';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users WHERE tenant_id = $1 LIMIT 50 OFFSET 100) _q LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should cap rows with standalone OFFSET inside subquery', async () => {
      const mockQuery = 'SELECT * FROM users OFFSET 50';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users WHERE tenant_id = $1 OFFSET 50) _q LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should cap rows with FETCH FIRST inside subquery', async () => {
      const mockQuery = 'SELECT * FROM users FETCH FIRST 50 ROWS ONLY';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users WHERE tenant_id = $1 FETCH FIRST 50 ROWS ONLY) _q LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should cap rows with FETCH NEXT inside subquery', async () => {
      const mockQuery = 'SELECT * FROM users FETCH NEXT 100 ROW ONLY';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users WHERE tenant_id = $1 FETCH NEXT 100 ROW ONLY) _q LIMIT 10',
        'configuration',
        [mockTenantId],
      );
    });

    it('should use tenantId column when detected', async () => {
      const mockQuery = 'SELECT * FROM transaction';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenantId' }]) // tenantId instead of tenant_id
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'event_history' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM transaction WHERE tenantId = $1) _q LIMIT 10',
        'event_history',
        [mockTenantId],
      );
    });

    it('should skip tenant filter when no tenant column is found', async () => {
      const mockQuery = 'SELECT * FROM unknown_table';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([]) // No tenant column found
        .mockResolvedValueOnce(mockResult);

      await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM unknown_table) _q LIMIT 10',
        'configuration',
        [],
      );
    });

    it('should inject tenant filter for base table inside a CTE query', async () => {
      const mockQuery = `WITH active_users AS (SELECT * FROM users WHERE status = 'active') SELECT * FROM active_users`;
      const mockResult = [{ id: 1 }];

      const mockDb = nodeRepository.executeQueryNodeInDb as jest.MockedFunction<() => Promise<Array<Record<string, unknown>>>>;
      mockDb.mockResolvedValueOnce([{ column_name: 'tenant_id' }]); // resolveTenantColumn for 'users'
      mockDb.mockResolvedValueOnce([]); // resolveTenantColumn for 'active_users' (CTE alias)
      mockDb.mockResolvedValueOnce(mockResult); // actual query

      const result = await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenCalledWith(
        expect.stringContaining('information_schema.columns'),
        'configuration',
        ['users'],
      );
      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(expect.stringContaining('SELECT * FROM ('), 'configuration', [
        mockTenantId,
      ]);
      expect(result).toEqual(mockResult);
    });

    it('should throw error when validation fails', async () => {
      const mockQuery = 'SELECT * FROM users; SELECT * FROM orders';

      (validateQuery.validateSelectQuery as jest.Mock).mockImplementation(() => {
        throw new Error('Only a single statement is allowed — multiple statements detected.');
      });

      await expect(nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId)).rejects.toThrow(
        new HttpException('Only a single statement is allowed — multiple statements detected.', HttpStatus.FORBIDDEN),
      );

      expect(nodeRepository.executeQueryNodeInDb).not.toHaveBeenCalled();
    });

    it('should skip tenant injection when query already filters by tenant column (case-insensitive)', async () => {
      // TenantId (mixed case) in WHERE — parser lowercases to 'tenantid', matches 'tenantId' case-insensitively
      const mockQuery = 'SELECT * FROM transaction WHERE TenantId = $1';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenantId' }])
        .mockResolvedValueOnce(mockResult);

      const result = await nodeLogicService.executeSelectQuery(
        { query: mockQuery, dbName: 'event_history', params: ['tenant-456'] },
        mockTenantId,
      );

      // tenant condition already present — no injection, params unchanged
      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM transaction WHERE TenantId = $1) _q LIMIT 10',
        'event_history',
        ['tenant-456'],
      );
      expect(result).toEqual(mockResult);
    });

    it('should skip tenant injection when query already has tenant_id in WHERE', async () => {
      const mockQuery = 'SELECT * FROM users WHERE status = $1 AND tenant_id = $2';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      const result = await nodeLogicService.executeSelectQuery(
        { query: mockQuery, dbName: 'configuration', params: ['active', 'tenant-789'] },
        mockTenantId,
      );

      // tenant_id already in WHERE — skip injection, params unchanged
      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users WHERE status = $1 AND tenant_id = $2) _q LIMIT 10',
        'configuration',
        ['active', 'tenant-789'],
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw when query has no tables', async () => {
      const mockQuery = 'SELECT 1 AS value';

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

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockRejectedValueOnce(new Error('Connection error')) // resolveTenantColumn call fails
        .mockResolvedValueOnce(mockResult); // outer query still executes

      const result = await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);

      expect(nodeRepository.executeQueryNodeInDb).toHaveBeenLastCalledWith(
        'SELECT * FROM (SELECT * FROM users) _q LIMIT 10',
        'configuration',
        [],
      );
      expect(result).toEqual(mockResult);
    });

    it('throws 403 when table name is a reserved keyword', async () => {
      // 'user' is in RESERVED_KEYWORDS — validateTableName throws, executeSelectQuery wraps as 403
      const mockQuery = 'SELECT * FROM "user"';

      await expect(nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('injects tenant filter before HAVING clause', async () => {
      // Real SQL with HAVING — real parser produces AST with _location offsets for having
      const mockQuery = 'SELECT name FROM orders GROUP BY name HAVING COUNT(*) > 1';
      const mockResult = [{ name: 'alice' }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      const result = await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);
      expect(result).toEqual(mockResult);
    });

    it('injects tenant filter before LIMIT clause', async () => {
      // Real SQL with LIMIT — real parser produces AST with _location offsets for limit
      const mockQuery = 'SELECT id FROM products LIMIT 5';
      const mockResult = [{ id: 1 }];

      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce(mockResult);

      const result = await nodeLogicService.executeSelectQuery({ query: mockQuery, dbName: 'configuration' }, mockTenantId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('extractTablesFromAST', () => {
    it('handles node.name.name pattern (nested name object)', () => {
      const ast = [
        {
          type: 'select',
          from: [{ type: 'table', name: { name: 'orders' } }],
        },
      ];
      const result = nodeLogicService.extractTablesFromAST(ast);
      expect(result).toContain('orders');
    });

    it('handles string node.name pattern', () => {
      const ast = [
        {
          type: 'select',
          from: [{ type: 'table', name: 'products' }],
        },
      ];
      const result = nodeLogicService.extractTablesFromAST(ast);
      expect(result).toContain('products');
    });
  });

  describe('resolveSortColumn', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns null when sortBy is empty', async () => {
      const result = await nodeLogicService.resolveSortColumn(['users'], '', 'configuration');
      expect(result).toBeNull();
    });

    it('returns null when sortBy has invalid characters', async () => {
      const result = await nodeLogicService.resolveSortColumn(['users'], 'col; DROP TABLE', 'configuration');
      expect(result).toBeNull();
    });

    it('returns null when sortBy not in ORDER BY of AST', async () => {
      const ast = [{ type: 'select', orderBy: [{ name: 'created_at' }] }];
      const result = await nodeLogicService.resolveSortColumn(['users'], 'name', 'configuration', ast);
      expect(result).toBeNull();
    });

    it('returns sortBy when column exists in table', async () => {
      (handlePostExecuteSqlStatement as jest.Mock).mockResolvedValue({ rows: [{ column_name: 'name' }] });
      const result = await nodeLogicService.resolveSortColumn(['users'], 'name', 'configuration');
      expect(result).toBe('name');
    });

    it('returns null when column not found in any table', async () => {
      (handlePostExecuteSqlStatement as jest.Mock).mockResolvedValue({ rows: [] });
      const result = await nodeLogicService.resolveSortColumn(['users'], 'nonexistent', 'configuration');
      expect(result).toBeNull();
    });

    it('skips table and continues when DB throws during column lookup', async () => {
      (handlePostExecuteSqlStatement as jest.Mock)
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ rows: [{ column_name: 'name' }] });
      const result = await nodeLogicService.resolveSortColumn(['bad_table', 'users'], 'name', 'configuration');
      expect(result).toBe('name');
    });

    it('skips AST ORDER BY check when orderByCols is empty', async () => {
      const ast = [{ type: 'select', orderBy: [] }];
      (handlePostExecuteSqlStatement as jest.Mock).mockResolvedValue({ rows: [{ column_name: 'name' }] });
      const result = await nodeLogicService.resolveSortColumn(['users'], 'name', 'configuration', ast);
      expect(result).toBe('name');
    });
  });
});
