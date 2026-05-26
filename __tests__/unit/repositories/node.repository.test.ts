import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHandlePostExecuteSqlStatement = jest.fn();

jest.mock('../../../src/services/database.logic.service', () => ({
  handlePostExecuteSqlStatement: (...args: unknown[]) => mockHandlePostExecuteSqlStatement(...args),
}));

import {
  getNodeByName,
  getNodeByIdFromDb,
  insertNodesIntoDb,
  deleteNodeByIdFromDB,
  getAllNodes,
  executeQueryNodeInDb,
} from '../../../src/repositories/configuration/node.repository';

describe('Node Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getNodeByName should return rows when found', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ id: 1 }] });

    const result = await getNodeByName('NodeA', 'tenant-a');

    expect(result).toEqual([{ id: 1 }]);
    expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
      expect.objectContaining({ values: ['NodeA', 'tenant-a'] }),
      'configuration',
    );
  });

  it('getNodeByName should return null when not found', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [] });

    const result = await getNodeByName('NodeA', 'tenant-a');

    expect(result).toBeNull();
  });

  it('getNodeByIdFromDb should return rows when found', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ id: 2 }] });

    const result = await getNodeByIdFromDb(2, 'tenant-a');

    expect(result).toEqual([{ id: 2 }]);
  });

  it('getNodeByIdFromDb should return null when not found', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [] });

    const result = await getNodeByIdFromDb(2, 'tenant-a');

    expect(result).toBeNull();
  });

  it('insertNodesIntoDb should build placeholders and return result', async () => {
    const nodes = [
      { node_json: { name: 'A' }, tenant_id: 'tenant-a', created_by: 'u1', order: 1 },
      { node_json: { name: 'B' }, tenant_id: 'tenant-a', created_by: 'u1', order: 2 },
    ];

    const dbResult = { rows: [{ id: 1 }, { id: 2 }] };
    mockHandlePostExecuteSqlStatement.mockResolvedValue(dbResult);

    const result = await insertNodesIntoDb(nodes as any);

    expect(result).toEqual(dbResult as any);
    const callArg = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(callArg.text).toContain('INSERT INTO trs_nodes');
    expect(callArg.values).toHaveLength(8);
  });

  it('deleteNodeByIdFromDB should execute delete query', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rowCount: 1 });

    await deleteNodeByIdFromDB(10, 'tenant-a');

    expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(expect.objectContaining({ values: [10, 'tenant-a'] }), 'configuration');
  });

  it('getAllNodes should use validated sort field fallback', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ id: 1 }] });

    const result = await getAllNodes('WHERE tenant_id = $1', ['tenant-a'], 'invalid', 'desc');

    expect(result).toEqual([{ id: 1 }]);
    const callArg = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { text: string };
    expect(callArg.text).toContain('ORDER BY created_at DESC');
  });

  it('getAllNodes should use ASC when sort order is not DESC', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ id: 1 }] });

    await getAllNodes('WHERE tenant_id = $1', ['tenant-a'], 'id', 'asc');

    const callArg = mockHandlePostExecuteSqlStatement.mock.calls[0][0] as { text: string };
    expect(callArg.text).toContain('ORDER BY id ASC');
  });

  it('executeQueryNodeInDb should execute query on requested db', async () => {
    mockHandlePostExecuteSqlStatement.mockResolvedValue({ rows: [{ ok: true }] });

    const result = await executeQueryNodeInDb('SELECT 1', 'tenant-a', 'configuration', []);

    expect(result).toEqual([{ ok: true }]);
    expect(mockHandlePostExecuteSqlStatement).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'SELECT 1', values: [] }),
      'configuration',
    );
  });
});
