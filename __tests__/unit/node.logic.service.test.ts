import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/repositories/configuration/node.repository');
jest.mock('../../src/utils/error', () => ({
  HttpException: class HttpException extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  HttpStatus: { CONFLICT: 409, INTERNAL_SERVER_ERROR: 500 },
}));
jest.mock('../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
}));

import * as nodeRepository from '../../src/repositories/configuration/node.repository';
import { getNodeById, createNode, deleteNodeById, findAllNodes, executeSelectQuery } from '../../src/services/node.logic.service';
import type { Node } from '../../src/interface/node.interface';

const makeNode = (id = 1): Node => ({
  id,
  tenant_id: 'tenant-1',
  node_json: { name: 'TestNode', type: 'processor', category: 'general' },
  created_by: 'user-1',
  order: 1,
});

describe('Node Logic Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getNodeById', () => {
    it('should return nodes when found', async () => {
      const mockNode = makeNode(1);
      (nodeRepository.getNodeByIdFromDb as jest.Mock).mockResolvedValue([mockNode]);

      const result = await getNodeById(1, 'tenant-1');

      expect(result).toEqual([mockNode]);
      expect(nodeRepository.getNodeByIdFromDb).toHaveBeenCalledWith(1, 'tenant-1');
    });

    it('should return null when no node found', async () => {
      (nodeRepository.getNodeByIdFromDb as jest.Mock).mockResolvedValue(null);

      const result = await getNodeById(999, 'tenant-1');

      expect(result).toBeNull();
    });

    it('should return null when repository returns empty array', async () => {
      (nodeRepository.getNodeByIdFromDb as jest.Mock).mockResolvedValue([]);

      const result = await getNodeById(1, 'tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('createNode', () => {
    it('should create nodes successfully when names are unique', async () => {
      (nodeRepository.getNodeByName as jest.Mock).mockResolvedValue(null);
      (nodeRepository.insertNodesIntoDb as jest.Mock).mockResolvedValue([makeNode(1)]);

      const nodeData = [{ tenant_id: 'tenant-1', node_json: { name: 'TestNode' }, created_by: 'user-1', order: 1 }];
      const result = await createNode(nodeData);

      expect(result).toHaveLength(1);
      expect(nodeRepository.insertNodesIntoDb).toHaveBeenCalledTimes(1);
    });

    it('should throw CONFLICT when node name already exists', async () => {
      (nodeRepository.getNodeByName as jest.Mock).mockResolvedValue([makeNode(1)]);

      const nodeData = [{ tenant_id: 'tenant-1', node_json: { name: 'TestNode' }, created_by: 'user-1', order: 1 }];

      await expect(createNode(nodeData)).rejects.toThrow('already exists');
    });

    it('should throw INTERNAL_SERVER_ERROR when insert returns no data', async () => {
      (nodeRepository.getNodeByName as jest.Mock).mockResolvedValue(null);
      (nodeRepository.insertNodesIntoDb as jest.Mock).mockResolvedValue([]);

      const nodeData = [{ tenant_id: 'tenant-1', node_json: { name: 'TestNode' }, created_by: 'user-1', order: 1 }];

      await expect(createNode(nodeData)).rejects.toThrow('Failed to create node(s)');
    });

    it('should wrap a single object in array', async () => {
      (nodeRepository.getNodeByName as jest.Mock).mockResolvedValue(null);
      (nodeRepository.insertNodesIntoDb as jest.Mock).mockResolvedValue([makeNode(1)]);

      const result = await createNode([{ tenant_id: 'tenant-1', node_json: { name: 'Single' }, created_by: 'user-1', order: 1 }]);

      expect(result).toHaveLength(1);
    });
  });

  describe('deleteNodeById', () => {
    it('should call deleteNodeByIdFromDB with correct arguments', async () => {
      (nodeRepository.deleteNodeByIdFromDB as jest.Mock).mockResolvedValue(undefined);

      await deleteNodeById(5, 'tenant-1');

      expect(nodeRepository.deleteNodeByIdFromDB).toHaveBeenCalledWith(5, 'tenant-1');
    });

    it('should propagate errors from repository', async () => {
      (nodeRepository.deleteNodeByIdFromDB as jest.Mock).mockRejectedValue(new Error('Delete failed'));

      await expect(deleteNodeById(5, 'tenant-1')).rejects.toThrow('Delete failed');
    });
  });

  describe('findAllNodes', () => {
    it('should find nodes with tenantId filter', async () => {
      const mockNodes = [makeNode(1), makeNode(2)];
      (nodeRepository.getAllNodes as jest.Mock).mockResolvedValue(mockNodes);

      const result = await findAllNodes('tenant-1');

      expect(result).toEqual(mockNodes);
      const callArg = (nodeRepository.getAllNodes as jest.Mock).mock.calls[0];
      expect(callArg[0]).toContain('tenant_id IN');
      expect(callArg[1]).toContain('default');
      expect(callArg[1]).toContain('tenant-1');
    });

    it('should apply type filter when provided', async () => {
      (nodeRepository.getAllNodes as jest.Mock).mockResolvedValue([]);

      await findAllNodes('tenant-1', { type: 'processor' });

      const callArg = (nodeRepository.getAllNodes as jest.Mock).mock.calls[0];
      expect(callArg[0]).toContain("node_json->>'type'");
    });

    it('should apply category filter when provided', async () => {
      (nodeRepository.getAllNodes as jest.Mock).mockResolvedValue([]);

      await findAllNodes('tenant-1', { category: 'general' });

      const callArg = (nodeRepository.getAllNodes as jest.Mock).mock.calls[0];
      expect(callArg[0]).toContain("node_json->>'category'");
    });

    it('should use default sort when not provided', async () => {
      (nodeRepository.getAllNodes as jest.Mock).mockResolvedValue([]);

      await findAllNodes('tenant-1');

      const callArg = (nodeRepository.getAllNodes as jest.Mock).mock.calls[0];
      expect(callArg[2]).toBe('created_at');
      expect(callArg[3]).toBe('desc');
    });

    it('should use custom sort when provided', async () => {
      (nodeRepository.getAllNodes as jest.Mock).mockResolvedValue([]);

      await findAllNodes('tenant-1', { sortBy: 'updated_at', sortOrder: 'asc' });

      const callArg = (nodeRepository.getAllNodes as jest.Mock).mock.calls[0];
      expect(callArg[2]).toBe('updated_at');
      expect(callArg[3]).toBe('asc');
    });

    it('should combine type and category filters', async () => {
      (nodeRepository.getAllNodes as jest.Mock).mockResolvedValue([]);

      await findAllNodes('tenant-1', { type: 'processor', category: 'general' });

      const callArg = (nodeRepository.getAllNodes as jest.Mock).mock.calls[0];
      expect(callArg[0]).toContain("node_json->>'type'");
      expect(callArg[0]).toContain("node_json->>'category'");
    });
  });

  describe('executeSelectQuery', () => {
    beforeEach(() => {
      (nodeRepository.executeQueryNodeInDb as jest.Mock).mockResolvedValue([]);
    });

    it('should execute valid SELECT query', async () => {
      const mockRows = [{ id: 1, tenant_id: 'tenant-1' }];
      (nodeRepository.executeQueryNodeInDb as jest.Mock).mockResolvedValue(mockRows);

      const result = await executeSelectQuery({ query: 'SELECT * FROM trs_nodes', dbName: 'configuration' }, 'tenant-1');

      expect(result).toEqual(mockRows);
    });

    it('should throw for INSERT queries', async () => {
      await expect(executeSelectQuery({ query: 'INSERT INTO trs_nodes VALUES (1)', dbName: 'configuration' }, 'tenant-1')).rejects.toThrow(
        'Only SELECT queries are allowed.',
      );
    });

    it('should throw for DELETE queries', async () => {
      await expect(executeSelectQuery({ query: 'DELETE FROM trs_nodes', dbName: 'configuration' }, 'tenant-1')).rejects.toThrow(
        'Only SELECT queries are allowed.',
      );
    });

    it('should throw for DROP queries', async () => {
      await expect(executeSelectQuery({ query: 'DROP TABLE trs_nodes', dbName: 'configuration' }, 'tenant-1')).rejects.toThrow(
        'Only SELECT queries are allowed.',
      );
    });

    it('should inject tenant_id into WHERE clause when one exists', async () => {
      (nodeRepository.executeQueryNodeInDb as jest.Mock)
        .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
        .mockResolvedValueOnce([{ id: 1 }]);

      await executeSelectQuery({ query: 'SELECT * FROM trs_nodes WHERE id = 1', dbName: 'configuration' }, 'tenant-1');

      const secondCallArg = (nodeRepository.executeQueryNodeInDb as jest.Mock).mock.calls[1][0] as string;
      expect(secondCallArg).toContain("tenant_id = 'tenant-1'");
    });

    it('should add WHERE clause when query has no WHERE', async () => {
      (nodeRepository.executeQueryNodeInDb as jest.Mock).mockResolvedValueOnce([{ column_name: 'tenant_id' }]).mockResolvedValueOnce([]);

      await executeSelectQuery({ query: 'SELECT * FROM trs_nodes', dbName: 'configuration' }, 'tenant-1');

      const secondCallArg = (nodeRepository.executeQueryNodeInDb as jest.Mock).mock.calls[1][0] as string;
      expect(secondCallArg).toContain('WHERE');
    });

    it('should add LIMIT 5 when query has no LIMIT', async () => {
      (nodeRepository.executeQueryNodeInDb as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await executeSelectQuery({ query: 'SELECT * FROM trs_nodes', dbName: 'configuration' }, 'tenant-1');

      const secondCallArg = (nodeRepository.executeQueryNodeInDb as jest.Mock).mock.calls[1][0] as string;
      expect(secondCallArg).toContain('LIMIT 5');
    });

    it('should inject before ORDER BY when present', async () => {
      (nodeRepository.executeQueryNodeInDb as jest.Mock).mockResolvedValueOnce([{ column_name: 'tenant_id' }]).mockResolvedValueOnce([]);

      await executeSelectQuery({ query: 'SELECT * FROM trs_nodes ORDER BY id', dbName: 'configuration' }, 'tenant-1');

      const secondCallArg = (nodeRepository.executeQueryNodeInDb as jest.Mock).mock.calls[1][0] as string;
      expect(secondCallArg).toContain('WHERE');
      expect(secondCallArg).toContain('ORDER BY');
    });

    it('should use default tenant_id column when schema query fails', async () => {
      (nodeRepository.executeQueryNodeInDb as jest.Mock).mockRejectedValueOnce(new Error('Schema error')).mockResolvedValueOnce([]);

      const { loggerService } = jest.requireMock('../../src') as { loggerService: { error: jest.Mock } };

      await executeSelectQuery({ query: 'SELECT * FROM trs_nodes', dbName: 'configuration' }, 'tenant-1');

      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should pass custom params to executeQueryNodeInDb', async () => {
      (nodeRepository.executeQueryNodeInDb as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await executeSelectQuery({ query: 'SELECT * FROM trs_nodes', dbName: 'configuration', params: [1, 2] }, 'tenant-1');

      const secondCall = (nodeRepository.executeQueryNodeInDb as jest.Mock).mock.calls[1];
      expect(secondCall[3]).toEqual([1, 2]);
    });
  });
});
