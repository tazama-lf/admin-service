// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { QueryResult, QueryResultRow } from 'pg';
import { databaseManager, loggerService } from '..';

export const handlePostExecuteSqlStatement = async <T extends QueryResultRow>(
  queryConfig: PgQueryConfig,
  tenantId: string,
): Promise<QueryResult<T>> => {
  try {
    loggerService.log('Started handling execution of the sql statement');

    await databaseManager._configuration.query('BEGIN');
    await databaseManager._configuration.query('SELECT public.set_tenant_id($1)', [tenantId]);
    const result = await databaseManager._configuration.query<T>(queryConfig.text, queryConfig.values);
    await databaseManager._configuration.query('COMMIT');
    return result;
  } catch (error) {
    await databaseManager._configuration.query('ROLLBACK');
    const errorMessage = error as { message: string };
    loggerService.log(
      `Failed executing the query from database service with error message: ${errorMessage.message}`,
      'handlePostExecuteSqlStatement()',
    );
    throw new Error(errorMessage.message);
  } finally {
    loggerService.log('Completed handling execution of the query from database service');
  }
};
