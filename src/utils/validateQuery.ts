import { parse } from 'pgsql-ast-parser';

/** Statement type discriminants that are part of the SELECT family */
const SELECT_TYPES = new Set(['select', 'union', 'union all', 'values', 'with', 'with recursive']);

/**
 * Parses the SQL string and asserts it is a single SELECT-family statement.
 * Returns the parsed AST on success so the caller can inspect it further.
 * Throws a descriptive Error on any violation.
 */
export const validateSelectQuery = (query: string): ReturnType<typeof parse> => {
  let ast: ReturnType<typeof parse>;

  // Replace {{ variable }} template placeholders with $N before parsing so the
  // AST parser sees valid parameterised SQL while still validating the structure.
  let paramIndex = 1;
  const normalised = query.replace(/\{\{\s*\w+\s*\}\}/g, () => `$${paramIndex++}`);

  try {
    ast = parse(normalised);
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

  return ast;
};
