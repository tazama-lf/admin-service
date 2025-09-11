// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { QueryResult, QueryResultRow } from 'pg';
import { databaseManager, loggerService } from '..';

export const handlePostExecuteSqlStatement = async <T extends QueryResultRow>(
  queryConfig: PgQueryConfig,
  databaseName: string,
): Promise<QueryResult<T>> => {
  try {
    loggerService.log('Started handling execution of the sql statement');

    switch (databaseName) {
      case 'configuration':
        return await databaseManager._configuration.query<T>(queryConfig.text, queryConfig.values);
      case 'event_history':
        return await databaseManager._eventHistory.query<T>(queryConfig.text, queryConfig.values);
      case 'evaluation':
        return await databaseManager._evaluation.query<T>(queryConfig.text, queryConfig.values);
      default:
        throw new Error('Specified database was not found.');
    }
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
