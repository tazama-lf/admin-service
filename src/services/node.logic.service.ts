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

/**
 * Recursively extracts all base table names from a parsed SQL AST.
 * Handles subqueries, joins, CTEs, and unions.
 * Returns unique table names (without aliases), handling dotted identifiers.
 */
function extractTablesFromAST(ast: unknown[]): string[] {
  const tables = new Set<string>();

  function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function extractTableName(node: Record<string, unknown>): string | null {
    const { name } = node;
    if (typeof name === 'string') {
      return name.replace(/['"`]/g, '');
    }
    if (isObject(name) && typeof name.name === 'string') {
      return name.name.replace(/['"`]/g, '');
    }
    return null;
  }

  function handleSelectNode(node: Record<string, unknown>): void {
    if (node.from) traverse(node.from);
    if (node.where) traverse(node.where);
    if (node.columns) traverse(node.columns);
    if (node.groupBy) traverse(node.groupBy);
    if (node.orderBy) traverse(node.orderBy);
  }

  function handleJoinNode(node: Record<string, unknown>): void {
    if (node.from) traverse(node.from);
    if (node.on) traverse(node.on);
  }

  function handleWithNode(node: Record<string, unknown>): void {
    if (node.bind) traverse(node.bind);
    if (node.in) traverse(node.in);
  }

  function handleUnionNode(node: Record<string, unknown>): void {
    if (node.left) traverse(node.left);
    if (node.right) traverse(node.right);
  }

  function traverse(value: unknown): void {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach(traverse);
      return;
    }

    if (!isObject(value)) return;
    const node = value;

    const nodeType = node.type;

    // Handle different node types first
    if (nodeType === 'select') {
      handleSelectNode(node);
      return;
    }

    if (nodeType === 'join' || node.join) {
      handleJoinNode(node);
      return;
    }

    if (nodeType === 'with' || nodeType === 'with recursive') {
      handleWithNode(node);
      return;
    }

    if (nodeType === 'union' || nodeType === 'union all') {
      handleUnionNode(node);
      return;
    }

    // Extract table name from table reference
    if (nodeType === 'table') {
      const tableName = extractTableName(node);
      if (tableName) {
        tables.add(tableName);
      }
      return;
    }

    // Recursively traverse all object properties for unknown node types
    Object.values(node).forEach(traverse);
  }

  traverse(ast);
  return Array.from(tables);
}

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
  //    Capture the AST for subsequent table extraction.
  let ast;
  try {
    ast = validateSelectQuery(normalisedQuery);
  } catch (e) {
    throw new HttpException((e as Error).message, HttpStatus.FORBIDDEN);
  }

  // 2. Extract all base table references from the AST (including subqueries, joins, CTEs)
  //    The extractTablesFromAST function traverses the parsed AST to find all base tables.
  //    This handles complex cases like derived tables and subqueries that the regex misses.
  const tables = extractTablesFromAST(ast);

  let modifiedQuery = normalisedQuery;
  let mutableParams = [...params];

  // Check if query already has a tenant filter to avoid duplicate conditions
  const hasTenantFilter = /\b(tenant_id|tenantid)\s*=\s*\$/i.test(normalisedQuery);

  if (tables.length > 0 && !hasTenantFilter) {
    // 3. Resolve tenant columns for all referenced tables and collect tenant conditions
    const tenantConditions: string[] = [];
    for (const table of tables) {
      const tenantColumn = await resolveTenantColumn(table, dbName);
      const paramIdx = mutableParams.length + 1;
      mutableParams = [...mutableParams, tenantId];

      // Don't prefix table name for simple single-table queries (backwards compatibility)
      tenantConditions.push(`${tenantColumn} = $${paramIdx}`);
    }

    // 4. Inject all tenant conditions into WHERE clause
    const combinedCondition = tenantConditions.join(' AND ');
    if (/\bWHERE\b/i.test(modifiedQuery)) {
      modifiedQuery = modifiedQuery.replace(/\bWHERE\b/i, `WHERE ${combinedCondition} AND`);
    } else {
      const upperCaseQuery = modifiedQuery.toUpperCase();
      // Find the first clause that should come after WHERE (GROUP BY, ORDER BY, LIMIT, OFFSET, or FETCH)
      const clauseIndex = upperCaseQuery.search(/\b(GROUP\s+BY|ORDER\s+BY|LIMIT|OFFSET|FETCH\s+(FIRST|NEXT))\b/);
      if (clauseIndex !== -1) {
        modifiedQuery = `${modifiedQuery.slice(0, clauseIndex)} WHERE ${combinedCondition} ${modifiedQuery.slice(clauseIndex)}`;
      } else {
        modifiedQuery = `${modifiedQuery.trimEnd()} WHERE ${combinedCondition}`;
      }
    }
  }

  // 7. Hard-cap rows — strip any user-supplied LIMIT/OFFSET/FETCH and enforce our own cap
  //    Remove LIMIT with optional OFFSET
  modifiedQuery = modifiedQuery.replace(/\bLIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*$/i, '').trimEnd();
  //    Remove standalone OFFSET clause
  modifiedQuery = modifiedQuery.replace(/\bOFFSET\s+\d+\s*$/i, '').trimEnd();
  //    Remove FETCH FIRST/NEXT variants (PostgreSQL standard syntax)
  modifiedQuery = modifiedQuery.replace(/\bFETCH\s+(FIRST|NEXT)\s+\d+\s+ROWS?\s+ONLY\s*$/i, '').trimEnd();
  modifiedQuery = `${modifiedQuery} LIMIT 10`;

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
    if (result.length > 0) {
      return result[0].column_name as string;
    }
  } catch (e) {
    loggerService.error(`Error resolving tenant column for table ${tableName}`);
  }

  return 'tenant_id'; // default fallback
}
