import type { Node, QueryParams } from '../interface/node.interface';
import {
  deleteNodeByIdFromDB,
  executeQueryNodeInDb,
  getAllNodes,
  getNodeByName,
  insertNodesIntoDb,
} from '../repositories/configuration/node.repository';
import { HttpException, HttpStatus } from '../utils/error';
import { validateSystemFunctions } from '../utils/validateQuery';

export const getNodeById = async (nodeId: number, tenantId: string): Promise<Node[] | null> => {
  const queryRes = await getNodeById(nodeId, tenantId);
  const resultArray = queryRes && queryRes.length > 0 ? queryRes : null;
  return resultArray;
};

export const createNode = async (
  nodeData: Array<{
    tenant_id: string;
    node_json: Record<string, unknown>;
    created_by: string;
    order: number;
  }>,
): Promise<Node[]> => {
  const nodes = Array.isArray(nodeData) ? nodeData : [nodeData];

  const validationPromises = nodes.map(async (node) => {
    const nodeName = node.node_json.name as string;
    const existingNode = await getNodeByName(nodeName, node.tenant_id);

    if (existingNode && existingNode.length > 0) {
      throw new HttpException(`Node with name "${nodeName}" already exists for tenant "${node.tenant_id}"`, HttpStatus.CONFLICT);
    }
  });
  await Promise.all(validationPromises);

  const result = await insertNodesIntoDb(nodes);

  if (result.length === 0) {
    throw new HttpException('Failed to create node(s): No data returned', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  return result;
};

export const deleteNodeById = async (nodeId: number, tenantId: string): Promise<void> => {
  await deleteNodeByIdFromDB(nodeId, tenantId);
};

export const findAllNodes = async (tenantId: string, query: QueryParams = {}): Promise<Node[]> => {
  const whereClauses: string[] = [];
  const queryParams: unknown[] = [];
  let paramIndex = 1;

  if (tenantId) {
    whereClauses.push(`tenant_id IN ($${paramIndex}, $${paramIndex + 1})`);
    queryParams.push('default', tenantId);
    paramIndex += 2;
  } else {
    whereClauses.push(`tenant_id = $${paramIndex}`);
    queryParams.push('default');
    paramIndex += 1;
  }

  if (query.type) {
    whereClauses.push(`node_json->>'type' = $${paramIndex}`);
    queryParams.push(query.type);
    paramIndex += 1;
  }

  if (query.category) {
    whereClauses.push(`node_json->>'category' = $${paramIndex}`);
    queryParams.push(query.category);
    paramIndex += 1;
  }

  const whereClause = `WHERE ${whereClauses.join(' AND ')}`;

  const sortBy = query.sortBy ?? 'created_at';
  const sortOrder = query.sortOrder ?? 'desc';

  const result = await getAllNodes(whereClause, queryParams, sortBy, sortOrder);
  return result;
};

export const executeSelectQuery = async (
  { query, dbName, params = [] }: { query: string; dbName: string; params?: unknown[] },
  tenantId: string,
): Promise<Array<Record<string, unknown>>> => {
  const upperCaseQuery = query.trim().toUpperCase();

  const forbiddenKeywords = ['INSERT', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE'];
  if (forbiddenKeywords.some((keyword) => upperCaseQuery.includes(keyword))) {
    throw new Error('Only SELECT queries are allowed.');
  }

  if (validateSystemFunctions(query)) {
    throw new Error('System-level functions are not allowed in SELECT queries.');
  }

  const fromOrJoinRegex = /\b(?:FROM|JOIN)\s+([a-zA-Z0-9_."]+)/gi;
  let modifiedQuery = query;
  let match;
  const tables = new Set<string>();
  while ((match = fromOrJoinRegex.exec(query)) !== null) {
    tables.add(match[1]);
  }

  if (tables.size > 0) {
    if (upperCaseQuery.includes('WHERE')) {
      modifiedQuery = modifiedQuery.replace(/WHERE/gi, `WHERE tenant_id = '${tenantId}' AND`);
    } else {
      const lastFromOrJoin = Math.max(...Array.from(tables).map((table) => query.lastIndexOf(table)));
      const tableEndPosition = lastFromOrJoin + Array.from(tables).pop()!.length;
      const nextClausePosition = query.substring(tableEndPosition).search(/\b(GROUP|ORDER|LIMIT)\b/i);

      if (nextClausePosition === -1) {
        modifiedQuery = `${query} WHERE tenant_id = '${tenantId}'`;
      } else {
        const insertionPoint = tableEndPosition + nextClausePosition;
        modifiedQuery = `${query.slice(0, insertionPoint)}WHERE tenant_id = '${tenantId}' ${query.slice(insertionPoint)}`;
      }
    }
  }

  if (!upperCaseQuery.includes('LIMIT')) {
    const hadSemicolon = modifiedQuery.endsWith(';');
    if (hadSemicolon) {
      modifiedQuery = modifiedQuery.slice(0, -1);
    }
    modifiedQuery = `${modifiedQuery} LIMIT 5`;
    if (hadSemicolon) {
      modifiedQuery = `${modifiedQuery};`;
    }
  }

  try {
    const result = await executeQueryNodeInDb(modifiedQuery, tenantId, dbName, params);
    return result;
  } catch (error) {
    const err = error as Error;
    throw new HttpException(`Failed to execute query: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR, { cause: error });
  }
};
