import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHandlePostExecuteSqlStatement = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandlePostExecuteSqlStatement(...args),
}));

jest.mock('../../../src', () => ({
  loggerService: { log: jest.fn(), error: jest.fn() },
}));

import {
  getNodeByName,
  getNodeByIdFromDb,
  insertNodesIntoDb,
  deleteNodeByIdFromDB,
  getAllNodes,
  executeQueryNodeInDb,
} from '../../../src/repositories/configuration/node.repository';
import type { Node } from '../../../src/interface/node.interface';

const makeNode = (id?: number): Node => ({
  id,
  tenant_id: 'tenant-1',
  node_json: { name: 'TestNode', type: 'processor' },
  created_by: 'user-1',
  order: 1,
});

describe('Node Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getNodeByName', () => {
    it('should return matching nodes when found', async () => {
      const mockNode = makeNode(1);
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [mockNode], rowCount: 1 });

      const result = await getNodeByName('TestNode', 'tenant-1');

      expect(result).toEqual([mockNode]);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({ values: ['TestNode', 'tenant-1'] }),
        'configuration',
      );
    });

    it('should return null when no node found by name', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await getNodeByName('NonExistent', 'tenant-1');

      expect(result).toBeNull();
    });

    it('should query trs_nodes table with name and tenant_id', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [makeNode(1)], rowCount: 1 });

      await getNodeByName('TestNode', 'tenant-1');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('trs_nodes');
    });
  });

  describe('getNodeByIdFromDb', () => {
    it('should return matching nodes when found by id', async () => {
      const mockNode = makeNode(42);
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [mockNode], rowCount: 1 });

      const result = await getNodeByIdFromDb(42, 'tenant-1');

      expect(result).toEqual([mockNode]);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({ values: [42, 'tenant-1'] }),
        'configuration',
      );
    });

    it('should return null when no node found by id', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await getNodeByIdFromDb(999, 'tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('insertNodesIntoDb', () => {
    it('should insert nodes and return result', async () => {
      const node = makeNode();
      const insertedNode = { ...node, id: 1, created_at: new Date(), updated_at: new Date() };
      const mockResult = { rows: [insertedNode], rowCount: 1 };
      mockHandlePostExecuteSqlStatement.mockResolvedValue(mockResult);

      const result = await insertNodesIntoDb([node]);

      expect(result).toEqual(mockResult);
      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string; values: unknown[] };
      expect(callArg.text).toContain('INSERT INTO trs_nodes');
      expect(callArg.text).toContain('RETURNING');
    });

    it('should build correct placeholders for multiple nodes', async () => {
      const nodes = [makeNode(), makeNode()];
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: nodes, rowCount: 2 });

      await insertNodesIntoDb(nodes);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values).toHaveLength(8);
    });

    it('should include NOW() for timestamps in query', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [makeNode(1)], rowCount: 1 });

      await insertNodesIntoDb([makeNode()]);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('NOW()');
    });

    it('should use configuration schema', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      await insertNodesIntoDb([makeNode()]);

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.anything(), 'configuration');
    });
  });

  describe('deleteNodeByIdFromDB', () => {
    it('should delete node by id and tenant', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 1 });

      await deleteNodeByIdFromDB(5, 'tenant-1');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('DELETE FROM trs_nodes'), values: [5, 'tenant-1'] }),
        'configuration',
      );
    });

    it('should propagate errors from database', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Delete failed'));

      await expect(deleteNodeByIdFromDB(5, 'tenant-1')).rejects.toThrow('Delete failed');
    });
  });

  describe('getAllNodes', () => {
    it('should return nodes with valid sortBy and sortOrder', async () => {
      const mockNodes = [makeNode(1), makeNode(2)];
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: mockNodes, rowCount: 2 });

      const result = await getAllNodes('WHERE tenant_id = $1', ['tenant-1'], 'id', 'asc');

      expect(result).toEqual(mockNodes);
      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('ORDER BY id ASC');
    });

    it('should default to created_at when sortBy is not in allowed list', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      await getAllNodes('', [], 'invalid_column', 'asc');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('ORDER BY created_at');
    });

    it('should default to ASC when sortOrder is not DESC', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      await getAllNodes('', [], 'id', 'asc');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('ASC');
    });

    it('should use DESC when sortOrder is desc', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      await getAllNodes('', [], 'id', 'desc');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('DESC');
    });

    it('should use created_at and ASC as defaults when no sortBy/sortOrder given', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      await getAllNodes('', []);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('ORDER BY created_at ASC');
    });

    it('should include the whereClause in query', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      await getAllNodes('WHERE tenant_id = $1', ['tenant-1']);

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { text: string };
      expect(callArg.text).toContain('WHERE tenant_id = $1');
    });
  });

  describe('executeQueryNodeInDb', () => {
    it('should execute query and return rows', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: mockRows, rowCount: 1 });

      const result = await executeQueryNodeInDb('SELECT * FROM trs_nodes WHERE id = $1', 'tenant-1', 'configuration', [1]);

      expect(result).toEqual(mockRows);
      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'SELECT * FROM trs_nodes WHERE id = $1', values: [1] }),
        'configuration',
      );
    });

    it('should default params to empty array when not provided', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      await executeQueryNodeInDb('SELECT 1', 'tenant-1', 'configuration');

      const callArg = (mockHandlePostExecuteSqlStatement as jest.Mock).mock.calls[0][0] as { values: unknown[] };
      expect(callArg.values).toEqual([]);
    });

    it('should use the provided dbName', async () => {
      mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [], rowCount: 0 });

      await executeQueryNodeInDb('SELECT 1', 'tenant-1', 'simulation');

      expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.anything(), 'simulation');
    });

    it('should propagate errors from database', async () => {
      mockHandlePostExecuteSqlStatement.mockRejectedValue(new Error('Query failed'));

      await expect(executeQueryNodeInDb('SELECT 1', 'tenant-1', 'configuration')).rejects.toThrow('Query failed');
    });
  });
});
