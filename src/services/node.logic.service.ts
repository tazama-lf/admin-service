import { loggerService } from '..';
import type { Node, QueryParams } from '../interface/node.interface';
import {
  deleteNodeByIdFromDB,
  executeQueryNodeInDb,
  getAllNodes,
  getNodeByName,
  insertNodesIntoDb,
} from '../repositories/configuration/node.repository';
import { HttpException, HttpStatus } from '../utils/error';

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

  // 1. Basic Security Filter
  const forbiddenKeywords = ['INSERT', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE'];
  if (forbiddenKeywords.some((keyword) => upperCaseQuery.includes(keyword))) {
    throw new Error('Only SELECT queries are allowed.');
  }

  // 2. Extract the Table Name
  // This regex looks for the word after FROM or JOIN, ignoring quotes
  const tableMatch = /FROM\s+([a-zA-Z0-9_".]+)/gi.exec(query);
  const tableName = tableMatch ? tableMatch[1].replace(/['"`]/g, '').split('.').pop() : null;

  let modifiedQuery = query;

  if (tableName) {
    // 3. Determine which column name to use (Dynamic Check)
    const tenantColumn = await resolveTenantColumn(tableName, dbName, tenantId);
    const tenantIdCondition = `${tenantColumn} = '${tenantId}'`;

    // 4. Inject into WHERE clause
    if (upperCaseQuery.includes('WHERE')) {
      modifiedQuery = modifiedQuery.replace(/WHERE/i, `WHERE ${tenantIdCondition} AND`);
    } else {
      const groupByIndex = upperCaseQuery.search(/\b(GROUP\s+BY|ORDER\s+BY|LIMIT)\b/);
      if (groupByIndex !== -1) {
        modifiedQuery = `${query.slice(0, groupByIndex)} WHERE ${tenantIdCondition} ${query.slice(groupByIndex)}`;
      } else {
        modifiedQuery = `${query} WHERE ${tenantIdCondition}`;
      }
    }
  }

  // 5. Apply Safety Limit
  if (!upperCaseQuery.includes('LIMIT')) {
    modifiedQuery = modifiedQuery.replace(/;?$/, ' LIMIT 5;');
  }

  return await executeQueryNodeInDb(modifiedQuery, tenantId, dbName, params);
};

/**
 * Helper: Queries the Database Schema to find the correct column name
 */
async function resolveTenantColumn(tableName: string, dbName: string, tenantId: string): Promise<string> {
  const schemaQuery = `
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = '${tableName}' 
    AND column_name IN ('tenant_id', 'tenantid')
    LIMIT 1;
  `;

  try {
    // We execute this against the DB to see which one exists
    const result = await executeQueryNodeInDb(schemaQuery, tenantId, dbName, []);
    if (result && result.length > 0) {
      return result[0].column_name as string;
    }
  } catch (e) {
    loggerService.error(`Error resolving tenant column for table ${tableName}: ${e.message}`, e.stack, 'NodeLogicService');
  }

  return 'tenant_id'; // Default fallback
}
