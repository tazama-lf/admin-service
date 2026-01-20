// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { QueryResult, QueryResultRow } from 'pg';
import { databaseManager, loggerService } from '..';

export const handlePostExecuteSqlStatement = async <T extends QueryResultRow>(
  queryConfig: PgQueryConfig,
  tenantId: string,
): Promise<QueryResult<T>> => {
  let inTransaction = false;
  const client = await databaseManager._configuration.connect();
  try {
    loggerService.log('Started handling execution of the sql statement');
    await client.query('BEGIN');
    inTransaction = true;
    await client.query('SELECT public.set_tenant_id($1)', [tenantId]);
    const result = await client.query<T>(queryConfig.text, queryConfig.values);
    await client.query('COMMIT');
    inTransaction = false;
    return result;
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        const rollbackErrorMessage = rollbackError as { message: string };
        loggerService.log(`Failed rolling back the transaction: ${rollbackErrorMessage.message}`, 'handlePostExecuteSqlStatement()');
        throw rollbackError;
      }
    }
    const errorMessage = error as { message: string };
    loggerService.log(
      `Failed executing the query from database service with error message: ${errorMessage.message}`,
      'handlePostExecuteSqlStatement()',
    );
    throw new Error(errorMessage.message);
  } finally {
    loggerService.log('Completed handling execution of the query from database service');
    client.release();
  }
};
