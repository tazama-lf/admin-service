import { handlePostExecuteSqlStatement, handleReadOnlyExecuteSqlStatement } from '../../services/database.logic.service';
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { Node } from '../../interface/node.interface';

export const getNodeByName = async (nodeName: string, tenantId: string): Promise<Node[] | null> => {
  const queryRes = await handlePostExecuteSqlStatement<Node>(
    {
      // eslint-disable-next-line @stylistic/quotes -- SQL string contains single quotes
      text: "SELECT id FROM trs_nodes WHERE (node_json->>'name') = $1 AND tenant_id = $2 LIMIT 1",
      values: [nodeName, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );
  return queryRes.rows.length > 0 ? queryRes.rows : null;
};
export const getNodeByIdFromDb = async (nodeId: number, tenantId: string): Promise<Node[] | null> => {
  const queryRes = await handlePostExecuteSqlStatement<Node>(
    {
      text: 'SELECT id FROM trs_nodes WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      values: [nodeId, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );
  return queryRes.rows.length > 0 ? queryRes.rows : null;
};

export const insertNodesIntoDb = async (nodes: Node[]): Promise<Node[]> => {
  const valuesPerNode = 4;
  const valuePlaceholders = nodes
    .map((_, index) => {
      const offset = index * valuesPerNode;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, NOW(), NOW())`;
    })
    .join(', ');

  const values = nodes.flatMap((node) => [node.node_json, node.tenant_id, node.created_by, node.order]);
  const result: unknown = await handlePostExecuteSqlStatement(
    {
      text: `INSERT INTO trs_nodes (node_json, tenant_id, created_by, "order", updated_at, created_at) VALUES ${valuePlaceholders} RETURNING id, node_json, tenant_id, "order", created_by, created_at, updated_at;`,
      values,
    } satisfies PgQueryConfig,
    'configuration',
  );

  return result as Node[];
};

export const deleteNodeByIdFromDB = async (nodeId: number, tenantId: string): Promise<void> => {
  await handlePostExecuteSqlStatement(
    {
      text: 'DELETE FROM trs_nodes WHERE id = $1 AND tenant_id = $2;',
      values: [nodeId, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );
};

export const getAllNodes = async (
  whereClause: string,
  queryParams: unknown[],
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
): Promise<Node[]> => {
  const allowedSortColumns = ['id', 'created_at', 'updated_at', 'tenant_id', 'order'];
  const validatedSortBy = sortBy && allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';

  const validatedSortOrder = sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const dbquery = `SELECT * FROM trs_nodes ${whereClause} ORDER BY ${validatedSortBy} ${validatedSortOrder}`;

  const result = await handlePostExecuteSqlStatement<Node>(
    {
      text: dbquery,
      values: queryParams,
    } satisfies PgQueryConfig,
    'configuration',
  );
  return result.rows;
};

export const executeQueryNodeInDb = async (
  query: string,
  dbName: string,
  params: unknown[] = [],
): Promise<Array<Record<string, unknown>>> => {
  const result = await handlePostExecuteSqlStatement(
    {
      text: query,
      values: params,
    } satisfies PgQueryConfig,
    dbName,
  );
  return result.rows;
};

export const executeQueryNodeInDbReadOnly = async (
  query: string,
  dbName: string,
  params: unknown[] = [],
): Promise<Array<Record<string, unknown>>> => {
  const result = await handleReadOnlyExecuteSqlStatement(
    {
      text: query,
      values: params,
    } satisfies PgQueryConfig,
    dbName,
  );
  return result.rows;
};
