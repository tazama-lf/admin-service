// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { databaseManager, loggerService } from '..';

export const handlePostExecuteSqlStatement = async <T extends QueryResultRow>(
  queryConfig: PgQueryConfig,
  databaseName: string,
  client?: PoolClient,
): Promise<QueryResult<T>> => {
  try {
    loggerService.log('Started handling execution of the sql statement');

    // When a pinned transaction client is supplied (batch insert, #436), run the
    // statement on THAT client so it joins the open BEGIN/COMMIT rather than borrowing
    // a separate pooled connection - otherwise the batch would not be atomic.
    if (client) {
      return await client.query<T>(queryConfig.text, queryConfig.values);
    }

    switch (databaseName) {
      case 'configuration':
        return await databaseManager._configuration.query<T>(queryConfig.text, queryConfig.values);
      case 'event_history':
        return await databaseManager._eventHistory.query<T>(queryConfig.text, queryConfig.values);
      case 'evaluation':
        return await databaseManager._evaluation.query<T>(queryConfig.text, queryConfig.values);
      case 'raw_history':
        return await databaseManager._rawHistory.query<T>(queryConfig.text, queryConfig.values);
      case 'simulation':
        return await databaseManager._simulation.query<T>(queryConfig.text, queryConfig.values);
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

// Executes a statement on the READ-ONLY pool for the given database. Used for query-node
// user SQL: the lib builds a second pool that connects as a SELECT-only DB role, so the
// database itself rejects any mutation/DDL (defence-in-depth alongside AST validation).
// Fails closed when no readonly pool is configured — query-node must never silently fall
// back to the read/write role.
export const handleReadonlyExecuteSqlStatement = async <T extends QueryResultRow>(
  queryConfig: PgQueryConfig,
  databaseName: string,
): Promise<QueryResult<T>> => {
  try {
    loggerService.log('Started handling read-only execution of the sql statement');

    const readonlyPools: Record<string, Pool | undefined> = {
      configuration: databaseManager._configurationReadonly,
      event_history: databaseManager._eventHistoryReadonly,
      evaluation: databaseManager._evaluationReadonly,
      raw_history: databaseManager._rawHistoryReadonly,
      simulation: databaseManager._simulationReadonly,
    };

    if (!(databaseName in readonlyPools)) {
      throw new Error('Specified database was not found.');
    }

    const pool = readonlyPools[databaseName];
    if (!pool) {
      throw new Error(
        `Read-only pool for '${databaseName}' is not configured. Set ${databaseName.toUpperCase()}_DATABASE_READONLY_USER / _READONLY_PASSWORD.`,
      );
    }

    return await pool.query<T>(queryConfig.text, queryConfig.values);
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.log(
      `Failed executing the read-only query with error message: ${errorMessage.message}`,
      'handleReadonlyExecuteSqlStatement()',
    );
    throw new Error(errorMessage.message);
  } finally {
    loggerService.log('Completed handling read-only execution of the query');
  }
};

// Runs a unit of work inside a single transaction on the configuration pool. A pinned
// client is required because the configuration database manager is a pg.Pool: each
// `.query` would otherwise borrow a different connection, so BEGIN/COMMIT could land on
// separate sessions. This exists for the network-map active-swap, where the demote and
// promote statements must be one atomic transaction (the partial unique index on
// `active = true` is checked per-row, so the demote MUST commit-or-rollback together with
// the promote). The client is always released, and any error triggers a ROLLBACK + rethrow.
export const withConfigurationTransaction = async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await databaseManager._configuration.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // Roll back, but never let a rollback failure (typically a dead connection, which Postgres
    // has already aborted server-side) mask the original cause: log the secondary error and
    // rethrow the original transaction error.
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      loggerService.log(
        `Failed to roll back configuration transaction: ${(rollbackError as { message: string }).message}`,
        'withConfigurationTransaction()',
      );
    }
    throw error;
  } finally {
    client.release();
  }
};
