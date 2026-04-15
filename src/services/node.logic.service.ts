import { loggerService } from '..';
import type { Node, QueryParams } from '../interface/node.interface';
import {
  deleteNodeByIdFromDB,
  executeQueryNodeInDbReadOnly,
  getAllNodes,
  getNodeByName,
  insertNodesIntoDb,
  getNodeByIdFromDb,
} from '../repositories/configuration/node.repository';
import { validateSelectQuery } from '../utils/validateQuery';
import { HttpException, HttpStatus } from '../utils/error';

export const getNodeById = async (nodeId: number, tenantId: string): Promise<Node[] | null> => {
  const queryRes = await getNodeByIdFromDb(nodeId, tenantId);
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
  // 0. Strip trailing semicolons before any processing
  const normalisedQuery = query.replace(/\s*;\s*$/, '').trim();

  // 1. Parse and validate — rejects non-SELECT, multiple statements, and invalid SQL
  //    The AST parser handles comments internally so no pre-stripping is needed here.
  try {
    validateSelectQuery(normalisedQuery);
  } catch (e) {
    throw new HttpException((e as Error).message, HttpStatus.FORBIDDEN);
  }

  // 2. Extract table name for tenant column resolution
  const tableMatch = /FROM\s+([a-zA-Z0-9_".]+)/gi.exec(normalisedQuery);
  const tableName = tableMatch ? tableMatch[1].replace(/['"`]/g, '').split('.').pop() : null;

  let modifiedQuery = normalisedQuery;
  let mutableParams = [...params];
  if (tableName) {
    // 3. Resolve which tenant column this table uses (tenant_id vs tenantId).
    //    Column name is safe to interpolate — it comes from information_schema, not user input.
    //    The tenantId value is passed as a bind parameter ($N).
    const tenantColumn = await resolveTenantColumn(tableName, dbName);
    const paramIdx = mutableParams.length + 1;
    const tenantIdCondition = `${tenantColumn} = $${paramIdx}`;
    mutableParams = [...mutableParams, tenantId];

    // 4. Inject tenant condition into WHERE clause using word boundary match
    if (/\bWHERE\b/i.test(modifiedQuery)) {
      modifiedQuery = modifiedQuery.replace(/\bWHERE\b/i, `WHERE ${tenantIdCondition} AND`);
    } else {
      const upperCaseQuery = modifiedQuery.toUpperCase();
      const groupByIndex = upperCaseQuery.search(/\b(GROUP\s+BY|ORDER\s+BY|LIMIT)\b/);
      if (groupByIndex !== -1) {
        modifiedQuery = `${modifiedQuery.slice(0, groupByIndex)} WHERE ${tenantIdCondition} ${modifiedQuery.slice(groupByIndex)}`;
      } else {
        modifiedQuery = `${modifiedQuery.trimEnd()} WHERE ${tenantIdCondition}`;
      }
    }
  }

  // 7. Hard-cap rows — strip any user-supplied LIMIT/OFFSET and enforce our own cap
  modifiedQuery = modifiedQuery.replace(/\bLIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*$/i, '').trimEnd();
  modifiedQuery = `${modifiedQuery} LIMIT 10`;

  // 8. Execute via the readonly connection pool
  loggerService.log(`Executing query: ${modifiedQuery}`);
  loggerService.log(`With params: ${JSON.stringify(mutableParams)}`);
  return await executeQueryNodeInDbReadOnly(modifiedQuery, dbName, mutableParams);
};

/**
 * Queries information_schema to find whether this table uses 'tenant_id' or 'tenantId'.
 * tableName is extracted from information_schema (not echoed back as a value) so it is
 * safe to use as an identifier in the query text. The lookup itself uses a bind parameter.
 */
async function resolveTenantColumn(tableName: string, dbName: string): Promise<string> {
  try {
    const result = await executeQueryNodeInDbReadOnly(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = $1 AND column_name IN ('tenant_id', 'tenantId') LIMIT 1`,
      dbName,
      [tableName],
    );
    if (result && result.length > 0) {
      return result[0].column_name as string;
    }
  } catch (e) {
    loggerService.error(`Error resolving tenant column for table ${tableName}`);
  }

  return 'tenant_id'; // default fallback
}
