import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';

export const findAllTransactionTypesFromDb = async (tenantId: string): Promise<string[]> => {
  const query = `
      SELECT DISTINCT transaction_type
      FROM config
      WHERE tenant_id = $1
        AND (
          (status = 'STATUS_04_APPROVED') 
          OR 
          (status = 'STATUS_06_EXPORTED')
        )
      ORDER BY transaction_type
    `;

  const result = await handlePostExecuteSqlStatement<{ transaction_type: string }>(
    {
      text: query,
      values: [tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows.map((row) => row.transaction_type);
};

export const findJsonPayloadByTransactionType = async (transactionType: string, tenantId: string): Promise<unknown> => {
  const JsonQuery = `
      SELECT payload_json
      FROM config
      WHERE transaction_type = $1 AND tenant_id = $2
      LIMIT 1
    `;

  const result = await handlePostExecuteSqlStatement(
    {
      text: JsonQuery,
      values: [transactionType, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows[0]?.payload_json ?? null;
};

export const findXmlPayloadByTransactionType = async (transactionType: string, tenantId: string): Promise<unknown> => {
  const XMLQuery = `
      SELECT payload_xml
      FROM config
      WHERE transaction_type = $1 AND tenant_id = $2
      LIMIT 1
    `;
  const result = await handlePostExecuteSqlStatement(
    {
      text: XMLQuery,
      values: [transactionType, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows[0]?.payload_xml ?? null;
};

export async function getSchemaByTransactionTypeFromDb(
  transactionType: string,
  tenantId: string,
): Promise<{ schema: unknown; mapping: unknown }> {
  const query = `
      SELECT schema, mapping
      FROM config
      WHERE transaction_type = $1 AND tenant_id = $2
    `;

  const result = await handlePostExecuteSqlStatement(
    {
      text: query,
      values: [transactionType, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  return { schema: result.rows[0].schema, mapping: result.rows[0].mapping };
}
