export const RESERVED_KEYWORDS = new Set([
  'select',
  'insert',
  'update',
  'delete',
  'create',
  'drop',
  'table',
  'from',
  'where',
  'join',
  'user',
  'group',
  'order',
  'by',
  'limit',
]);

export function validateTableName(tableName: string): void {
  if (!/^[A-Z_]\w*$/i.test(tableName)) {
    throw new Error(
      `Invalid table name "${tableName}". Only letters, numbers, and underscores are allowed, and it must start with a letter or underscore.`,
    );
  }

  if (tableName.length > 63) {
    throw new Error(`Invalid table name "${tableName}". Must not exceed 63 characters.`);
  }

  if (RESERVED_KEYWORDS.has(tableName.toLowerCase())) {
    throw new Error(`Invalid table name "${tableName}". It is a reserved SQL keyword.`);
  }
}

export function validateColumnKeys(keys: string[], allowedColumns: ReadonlySet<string>, context: string): void {
  const invalid = keys.filter((k) => !allowedColumns.has(k));
  if (invalid.length > 0) {
    throw new Error(`Invalid field(s) for ${context}: ${invalid.join(', ')}`);
  }
}
