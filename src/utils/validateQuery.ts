import { parse } from 'pgsql-ast-parser';

/** Minimal structural type for a parsed SQL statement. */
interface SqlStatement {
  type: string;
}

export interface ValidatedQuery {
  ast: SqlStatement[];
  /** Query string that was actually parsed — {{ var }} placeholders replaced with $N.
   *  AST _location offsets reference this string, not the original input. */
  parsedSql: string;
}

/**
 * Parses the SQL string and asserts it is a single statement.
 * Returns the parsed AST and the normalised SQL string (with {{ }} → $N substitution applied).
 * Callers must use parsedSql — not the original input — when slicing by AST _location offsets.
 *
 * Write/DDL rejection is NOT done here: query-node executes on a read-only DB role
 * (see readonly pool), so the database itself rejects any non-SELECT. We only enforce
 * single-statement + parseable here, which the downstream AST table/tenant logic relies on.
 * Throws a descriptive Error on any violation.
 */
export const validateSelectQuery = (query: string): ValidatedQuery => {
  let ast: SqlStatement[];

  // Replace {{ variable }} template placeholders with $N before parsing so the
  // AST parser sees valid parameterised SQL while still validating the structure.
  let paramIndex = 1;
  const parsedSql = query.replace(/\{\{\s*\w+\s*\}\}/g, () => `$${paramIndex++}`);

  try {
    ast = parse(parsedSql, { locationTracking: true });
  } catch (e) {
    throw new Error(`Invalid SQL syntax: ${(e as Error).message}`);
  }

  if (ast.length === 0) {
    throw new Error('Empty query is not allowed.');
  }

  if (ast.length > 1) {
    throw new Error('Only a single statement is allowed — multiple statements detected.');
  }

  return { ast, parsedSql };
};
