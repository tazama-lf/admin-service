// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { loggerService } from '..';
import { Pool, type QueryResult, type PoolConfig, type QueryResultRow } from 'pg';

export const handlePostExecuteSqlStatement = async (
  queryString: string | PgQueryConfig,
  databaseName: string,
): Promise<QueryResult<QueryResultRow>> => {
  try {
    loggerService.log('Started handling execution of the sql statement');

    const databaseConfig: PoolConfig = {
      host: 'localhost',
      database: databaseName,
      user: 'postgres',
      password: 'password',
      port: 5432,
    };

    const db = new Pool(databaseConfig);
    return await db.query(queryString);
  } catch (error) {
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
