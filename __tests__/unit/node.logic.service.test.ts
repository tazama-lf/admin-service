import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/repositories/configuration/node.repository', () => ({
  getNodeByIdFromDb: jest.fn(),
  getNodeByName: jest.fn(),
  insertNodesIntoDb: jest.fn(),
  deleteNodeByIdFromDB: jest.fn(),
  getAllNodes: jest.fn(),
  executeQueryNodeInDb: jest.fn(),
}));

jest.mock('../../src', () => ({
  loggerService: {
    error: jest.fn(),
  },
}));

import { getNodeById, createNode, deleteNodeById, findAllNodes, executeSelectQuery } from '../../src/services/node.logic.service';
import * as nodeRepository from '../../src/repositories/configuration/node.repository';

describe('Node Logic Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getNodeById should return rows when found', async () => {
    (nodeRepository.getNodeByIdFromDb as jest.Mock).mockResolvedValue([{ id: 1 }]);

    const result = await getNodeById(1, 'tenant-a');

    expect(result).toEqual([{ id: 1 }]);
  });

  it('getNodeById should return null when empty', async () => {
    (nodeRepository.getNodeByIdFromDb as jest.Mock).mockResolvedValue([]);

    const result = await getNodeById(1, 'tenant-a');

    expect(result).toBeNull();
  });

  it('createNode should throw conflict when node name already exists', async () => {
    (nodeRepository.getNodeByName as jest.Mock).mockResolvedValue([{ id: 1 }]);

    await expect(createNode([{ tenant_id: 'tenant-a', node_json: { name: 'A' }, created_by: 'u1', order: 1 }] as any)).rejects.toThrow(
      'already exists',
    );
  });

  it('createNode should insert and return nodes when valid', async () => {
    (nodeRepository.getNodeByName as jest.Mock).mockResolvedValue(null);
    (nodeRepository.insertNodesIntoDb as jest.Mock).mockResolvedValue([{ id: 1 }]);

    const result = await createNode([{ tenant_id: 'tenant-a', node_json: { name: 'A' }, created_by: 'u1', order: 1 }] as any);

    expect(result).toEqual([{ id: 1 }]);
  });

  it('createNode should normalize single object payload to array', async () => {
    (nodeRepository.getNodeByName as jest.Mock).mockResolvedValue(null);
    (nodeRepository.insertNodesIntoDb as jest.Mock).mockResolvedValue([{ id: 2 }]);

    const result = await createNode({ tenant_id: 'tenant-a', node_json: { name: 'B' }, created_by: 'u1', order: 2 } as any);

    expect(result).toEqual([{ id: 2 }]);
    expect(nodeRepository.insertNodesIntoDb).toHaveBeenCalledWith([
      { tenant_id: 'tenant-a', node_json: { name: 'B' }, created_by: 'u1', order: 2 },
    ]);
  });

  it('createNode should throw when insert returns empty', async () => {
    (nodeRepository.getNodeByName as jest.Mock).mockResolvedValue(null);
    (nodeRepository.insertNodesIntoDb as jest.Mock).mockResolvedValue([]);

    await expect(createNode([{ tenant_id: 'tenant-a', node_json: { name: 'A' }, created_by: 'u1', order: 1 }] as any)).rejects.toThrow(
      'Failed to create node',
    );
  });

  it('deleteNodeById should delegate to repository', async () => {
    (nodeRepository.deleteNodeByIdFromDB as jest.Mock).mockResolvedValue(undefined);

    await deleteNodeById(11, 'tenant-a');

    expect(nodeRepository.deleteNodeByIdFromDB).toHaveBeenCalledWith(11, 'tenant-a');
  });

  it('findAllNodes should build where clause with tenant and filters', async () => {
    (nodeRepository.getAllNodes as jest.Mock).mockResolvedValue([{ id: 1 }]);

    const result = await findAllNodes('tenant-a', { type: 'TYPE_A', category: 'CAT_A', sortBy: 'id', sortOrder: 'asc' } as any);

    expect(result).toEqual([{ id: 1 }]);
    expect(nodeRepository.getAllNodes).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id IN'),
      ['default', 'tenant-a', 'TYPE_A', 'CAT_A'],
      'id',
      'asc',
    );
  });

  it('findAllNodes should use default tenant-only query when tenant missing', async () => {
    (nodeRepository.getAllNodes as jest.Mock).mockResolvedValue([{ id: 1 }]);

    await findAllNodes('', {} as any);

    expect(nodeRepository.getAllNodes).toHaveBeenCalledWith(expect.stringContaining('tenant_id = $1'), ['default'], 'created_at', 'desc');
  });

  it('executeSelectQuery should reject non-SELECT queries', async () => {
    await expect(executeSelectQuery({ query: 'DELETE FROM trs_nodes', dbName: 'configuration' }, 'tenant-a')).rejects.toThrow(
      'Only SELECT queries are allowed.',
    );
  });

  it('executeSelectQuery should inject tenant condition in existing WHERE', async () => {
    (nodeRepository.executeQueryNodeInDb as jest.Mock)
      .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
      .mockResolvedValueOnce([{ id: 1 }]);

    const result = await executeSelectQuery({ query: 'SELECT * FROM trs_nodes WHERE id = 1', dbName: 'configuration' }, 'tenant-a');

    expect(result).toEqual([{ id: 1 }]);
    expect((nodeRepository.executeQueryNodeInDb as jest.Mock).mock.calls[1][0]).toContain("WHERE tenant_id = 'tenant-a' AND");
  });

  it('executeSelectQuery should append WHERE and LIMIT when absent', async () => {
    (nodeRepository.executeQueryNodeInDb as jest.Mock)
      .mockResolvedValueOnce([{ column_name: 'tenantid' }])
      .mockResolvedValueOnce([{ id: 1 }]);

    await executeSelectQuery({ query: 'SELECT * FROM trs_nodes', dbName: 'configuration' }, 'tenant-a');

    const executedQuery = (nodeRepository.executeQueryNodeInDb as jest.Mock).mock.calls[1][0] as string;
    expect(executedQuery).toContain("WHERE tenantid = 'tenant-a'");
    expect(executedQuery).toContain('LIMIT 5;');
  });

  it('executeSelectQuery should inject before ORDER BY', async () => {
    (nodeRepository.executeQueryNodeInDb as jest.Mock)
      .mockResolvedValueOnce([{ column_name: 'tenant_id' }])
      .mockResolvedValueOnce([{ id: 1 }]);

    await executeSelectQuery({ query: 'SELECT * FROM trs_nodes ORDER BY id DESC', dbName: 'configuration' }, 'tenant-a');

    const executedQuery = (nodeRepository.executeQueryNodeInDb as jest.Mock).mock.calls[1][0] as string;
    expect(executedQuery).toContain("WHERE tenant_id = 'tenant-a' ORDER BY");
    expect(executedQuery).toContain('LIMIT 5;');
  });

  it('executeSelectQuery should fallback to tenant_id when tenant column lookup fails', async () => {
    (nodeRepository.executeQueryNodeInDb as jest.Mock)
      .mockRejectedValueOnce(new Error('schema lookup failed'))
      .mockResolvedValueOnce([{ id: 1 }]);

    const result = await executeSelectQuery({ query: 'SELECT * FROM trs_nodes', dbName: 'configuration' }, 'tenant-a');

    expect(result).toEqual([{ id: 1 }]);
    const executedQuery = (nodeRepository.executeQueryNodeInDb as jest.Mock).mock.calls[1][0] as string;
    expect(executedQuery).toContain("WHERE tenant_id = 'tenant-a'");
  });

  it('executeSelectQuery should keep query unchanged when table name is not present', async () => {
    (nodeRepository.executeQueryNodeInDb as jest.Mock).mockResolvedValue([{ now: '2026-01-01' }]);

    const result = await executeSelectQuery({ query: 'SELECT NOW()', dbName: 'configuration' }, 'tenant-a');

    expect(result).toEqual([{ now: '2026-01-01' }]);
    expect(nodeRepository.executeQueryNodeInDb).toHaveBeenCalledWith('SELECT NOW() LIMIT 5;', 'tenant-a', 'configuration', []);
  });
});
