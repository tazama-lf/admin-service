import { loggerService } from '..';
import type { Node, QueryParams } from '../interface/node.interface';
import {
  deleteNodeByIdFromDB,
  executeQueryNodeInDb,
  getAllNodes,
  getNodeByName,
  insertNodesIntoDb,
  getNodeByIdFromDb,
} from '../repositories/configuration/node.repository';
import { validateSelectQuery } from '../utils/validateQuery';
import { validateTableName } from '../utils/enrichment-utils';
import { HttpException, HttpStatus } from '../utils/error';
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from './database.logic.service';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extracts all base table names from a parsed SQL AST.
 * Handles subqueries, joins, CTEs, unions. Excludes CTE aliases.
 */
export function extractTablesFromAST(ast: unknown[]): string[] {
  const tables = new Set<string>();
  const cteAliases = new Set<string>();

  function getNameStr(node: Record<string, unknown>): string | null {
    if (typeof node.name === 'string') return node.name.replace(/['"`]/g, '');
    if (isObject(node.name) && typeof node.name.name === 'string') return node.name.name.replace(/['"`]/g, '');
    return null;
  }

  function traverse(value: unknown): void {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(traverse);
      return;
    }
    if (!isObject(value)) return;

    const { type } = value;

    if (type === 'with' || type === 'with recursive') {
      if (Array.isArray(value.bind)) {
        for (const b of value.bind) {
          if (isObject(b) && typeof b.alias === 'string') cteAliases.add(b.alias);
        }
      }
      traverse(value.bind);
      traverse(value.in);
      return;
    }

    if (type === 'table') {
      const name = getNameStr(value);
      if (name && !cteAliases.has(name)) tables.add(name);
      return;
    }

    // For select/join/union/unknown nodes — recurse all child properties
    Object.values(value).forEach(traverse);
  }

  traverse(ast);
  return Array.from(tables);
}

/**
 * Returns ORDER BY column names referenced in the outermost SELECT of the AST.
 */
function extractOrderByColumns(ast: unknown[]): string[] {
  const cols: string[] = [];

  function traverse(value: unknown): void {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(traverse);
      return;
    }
    if (!isObject(value)) return;

    if (Array.isArray(value.orderBy)) {
      for (const item of value.orderBy) {
        if (!isObject(item)) continue;
        if (typeof item.name === 'string') cols.push(item.name.replace(/['"`]/g, ''));
        else if (isObject(item.name) && typeof item.name.name === 'string') cols.push(item.name.name.replace(/['"`]/g, ''));
      }
    }
    Object.values(value).forEach(traverse);
  }

  traverse(ast);
  return cols;
}

/**
 * Checks whether the outermost SELECT's WHERE already references a tenant column.
 * Prevents double-filtering when user already scoped by tenant.
 */
function whereHasTenantCondition(ast: unknown[], tenantCol: string): boolean {
  function findColInNode(node: unknown): boolean {
    if (!node) return false;
    if (Array.isArray(node)) return node.some(findColInNode);
    if (!isObject(node)) return false;
    if (node.type === 'ref') {
      const name = typeof node.name === 'string' ? node.name : isObject(node.name) ? (node.name.name as string) : '';
      if (name.replace(/['"`]/g, '').toLowerCase() === tenantCol.toLowerCase()) return true;
    }
    return Object.values(node).some(findColInNode);
  }

  // Only check the outermost SELECT's WHERE — not subqueries
  const [root] = ast;
  if (!isObject(root)) return false;
  const selectNode = (root.type === 'with' || root.type === 'with recursive') && isObject(root.in) ? root.in : root;
  return isObject(selectNode) && !!selectNode.where && findColInNode(selectNode.where);
}

/**
 * Splices a tenant condition into the query string at the correct position
 * using AST location offsets — safe against subquery/CTE WHERE clauses.
 *
 * Strategy:
 *   - Has WHERE: insert "AND col = $n" right after the WHERE expression ends
 *   - No WHERE:  insert "WHERE col = $n" after the FROM clause ends
 */
function injectTenantCondition(sql: string, ast: unknown[], tenantCol: string, paramIdx: number): string {
  const [root] = ast;
  if (!isObject(root)) return sql;

  // For WITH nodes, the real SELECT is in `.in`
  const selectNode = (root.type === 'with' || root.type === 'with recursive') && isObject(root.in) ? root.in : root;
  if (!isObject(selectNode)) return sql;

  const condition = `${tenantCol} = $${paramIdx}`;

  // Case 1: outermost SELECT has a WHERE — splice AND condition right after the WHERE expression.
  // _location is always present when locationTracking:true is passed to parse(); if it's somehow
  // absent we throw rather than produce double-WHERE malformed SQL.
  if (isObject(selectNode.where)) {
    const loc = selectNode.where._location as { start: number; end: number } | undefined;
    if (!loc) throw new Error('AST WHERE node missing _location — cannot safely inject tenant condition');
    return `${sql.slice(0, loc.end)} AND ${condition}${sql.slice(loc.end)}`;
  }

  // Case 2: no WHERE — find the end of the FROM clause by walking backward from the first
  // trailing clause keyword (GROUP BY / ORDER BY / HAVING / LIMIT / OFFSET / FETCH).
  // This handles aliases and JOINs correctly, unlike using FROM item _location.end which
  // only covers the table-name token and misses alias identifiers.
  const getLocStart = (node: unknown): number | undefined =>
    isObject(node) ? (node._location as { start?: number } | undefined)?.start : undefined;

  // Collect the _location.start of the first token after each trailing clause keyword.
  // These positions are used to anchor a backward scan to find the keyword itself.
  const anchorStarts: number[] = [];
  if (Array.isArray(selectNode.groupBy) && selectNode.groupBy.length > 0) {
    const s = getLocStart(selectNode.groupBy[0]);
    if (s != null) anchorStarts.push(s);
  }
  if (Array.isArray(selectNode.orderBy) && selectNode.orderBy.length > 0) {
    const s = getLocStart(selectNode.orderBy[0]);
    if (s != null) anchorStarts.push(s);
  }
  if (isObject(selectNode.having)) {
    const s = getLocStart(selectNode.having);
    if (s != null) anchorStarts.push(s);
  }
  if (isObject(selectNode.limit)) {
    const s = getLocStart(selectNode.limit);
    if (s != null) anchorStarts.push(s);
  }

  if (anchorStarts.length > 0) {
    // Take the earliest anchor and scan backward to strip the SQL keyword(s) + surrounding
    // whitespace, giving us the true end of the FROM clause content.
    const anchor = Math.min(...anchorStarts);
    const prefix = sql.slice(0, anchor).trimEnd();
    const fromPart = prefix.replace(/\s+(?:group\s+by|order\s+by|having|limit|offset|fetch(?:\s+(?:first|next))?)$/i, '');
    // Everything from fromPart.length to anchor is the keyword + whitespace — preserve it.
    const keywordAndSpace = sql.slice(fromPart.length, anchor).trimStart();
    return `${fromPart} WHERE ${condition} ${keywordAndSpace}${sql.slice(anchor)}`;
  }

  // No trailing clauses — FROM extends to end of statement (e.g. SELECT * FROM users)
  const stmtEnd = (selectNode._location as { end?: number } | undefined)?.end ?? sql.length;
  return `${sql.slice(0, stmtEnd)} WHERE ${condition}${sql.slice(stmtEnd)}`;
}

/**
 * Validates that sortBy column exists in at least one of the query's base tables.
 * Also checks it appears in the ORDER BY clause of the AST (prevents arbitrary column injection).
 */
export const resolveSortColumn = async (tableNames: string[], sortBy: string, dbName: string, ast?: unknown[]): Promise<string | null> => {
  if (!sortBy) return null;

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sortBy)) return null;

  if (ast) {
    const orderByCols = extractOrderByColumns(ast);
    if (orderByCols.length > 0 && !orderByCols.includes(sortBy)) return null;
  }

  for (const tableName of tableNames) {
    try {
      const columnLookup = await handlePostExecuteSqlStatement<{ column_name: string }>(
        {
          text: 'SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1',
          values: [tableName, sortBy],
        } satisfies PgQueryConfig,
        dbName,
      );
      if (columnLookup.rows.length > 0) return sortBy;
    } catch {
      loggerService.error(`Error validating sort column ${sortBy} in table ${tableName}`);
    }
  }

  return null;
};

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

  // 1. Parse and validate — rejects non-SELECT, multiple statements, and invalid SQL.
  //    validateSelectQuery substitutes {{ var }} → $N before parsing; the returned parsedSql
  //    is what the AST _location offsets reference — use it (not normalisedQuery) for splicing.
  let ast: Array<{ type: string }>;
  let parsedSql: string;
  try {
    ({ ast, parsedSql } = validateSelectQuery(normalisedQuery));
  } catch (e) {
    throw new HttpException((e as Error).message, HttpStatus.FORBIDDEN);
  }

  // 2. Extract all base table references from the AST (including subqueries, joins, CTEs)
  //    The extractTablesFromAST function traverses the parsed AST to find all base tables.
  //    This handles complex cases like derived tables and subqueries that the regex misses.
  const tables = extractTablesFromAST(ast);
  if (tables.length === 0) {
    throw new HttpException('Query must reference at least one base table.', HttpStatus.FORBIDDEN);
  }

  // Validate all table names before any database queries (Issue 1: Complete blocklist via validation)
  for (const tableName of tables) {
    try {
      validateTableName(tableName);
    } catch (e) {
      throw new HttpException((e as Error).message, HttpStatus.FORBIDDEN);
    }
  }

  const mutableParams = [...params];

  // 3. For each table that has a tenant column, inject a tenant condition unless
  //    the user's query already filters by that column (detected via AST).
  //    Conditions are appended to the inner query text so the outer LIMIT wrapper
  //    never needs to reference columns that might be absent from the SELECT list.
  // Use parsedSql ({{ var }} → $N substituted) as the base — AST _location offsets
  // reference this string, not normalisedQuery which may still contain {{ }} placeholders.
  let innerQuery = parsedSql;
  for (const tableName of tables) {
    const tenantColumn = await resolveTenantColumn(tableName, dbName);
    if (!tenantColumn) continue;
    if (whereHasTenantCondition(ast, tenantColumn)) continue;

    const paramIdx = mutableParams.length + 1;
    mutableParams.push(tenantId);
    innerQuery = injectTenantCondition(innerQuery, ast, tenantColumn, paramIdx);
  }

  // 4. Wrap in outer SELECT to enforce LIMIT 10. The inner query is already validated
  //    and tenant-scoped, so the outer layer is purely for row capping.
  const modifiedQuery = `SELECT * FROM (${innerQuery}) _q LIMIT 10`;

  return await executeQueryNodeInDb(modifiedQuery, dbName, mutableParams);
};

/**
 * Queries information_schema to find whether this table uses 'tenant_id' or 'tenantId'.
 * tableName is validated before querying; lookup itself uses a bind parameter.
 */
async function resolveTenantColumn(tableName: string, dbName: string): Promise<string | null> {
  try {
    validateTableName(tableName);
  } catch (e) {
    throw new HttpException((e as Error).message, HttpStatus.FORBIDDEN);
  }

  try {
    const result = await executeQueryNodeInDb(
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

  return null;
}
