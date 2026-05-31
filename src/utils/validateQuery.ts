import { parse } from 'pgsql-ast-parser';

/** Minimal structural type for a parsed SQL statement. */
interface SqlStatement {
  type: string;
}

/** Statement type discriminants that are part of the SELECT family */
const SELECT_TYPES = new Set(['select', 'union', 'union all', 'values', 'with', 'with recursive']);

export interface ValidatedQuery {
  ast: SqlStatement[];
  /** Query string that was actually parsed — {{ var }} placeholders replaced with $N.
   *  AST _location offsets reference this string, not the original input. */
  parsedSql: string;
}

/**
 * Parses the SQL string and asserts it is a single SELECT-family statement.
 * Returns the parsed AST and the normalised SQL string (with {{ }} → $N substitution applied).
 * Callers must use parsedSql — not the original input — when slicing by AST _location offsets.
 * Throws a descriptive Error on any violation.
 */
export const validateSelectQuery = (query: string): ValidatedQuery => {
  let ast: SqlStatement[];

  // Replace {{ variable }} template placeholders with $N before parsing so the
  // AST parser sees valid parameterised SQL while still validating the structure.
  let paramIndex = 1;
  const parsedSql = query.replace(/\{\{\s*\w+\s*\}\}/g, () => `$${paramIndex++}`);

  try {
    ast = parse(parsedSql, { locationTracking: true }) as SqlStatement[];
  } catch (e) {
    throw new Error(`Invalid SQL syntax: ${(e as Error).message}`);
  }

  if (ast.length === 0) {
    throw new Error('Empty query is not allowed.');
  }

  if (ast.length > 1) {
    throw new Error('Only a single SELECT statement is allowed — multiple statements detected.');
  }

  if (!SELECT_TYPES.has(ast[0].type)) {
    throw new Error(`Only SELECT queries are allowed. Got: ${ast[0].type}`);
  }

  return { ast, parsedSql };
};
