// SPDX-License-Identifier: Apache-2.0
import 'reflect-metadata';
import { CreateStorageManager } from '@tazama-lf/frms-coe-lib/lib/services/dbManager';
import { DatabaseFactory, DatabaseService } from '@tazama-lf/tcs-lib';
import initializeFastifyClient from './clients/fastify';
import { type AppDatabaseServices, type Configuration, processorConfig } from './config';
import { type DatabaseManagerInstance, LoggerService } from '@tazama-lf/frms-coe-lib';
import { Database } from '@tazama-lf/frms-coe-lib/lib/config/database.config';
import { Cache } from '@tazama-lf/frms-coe-lib/lib/config/redis.config';
import * as util from 'node:util';

export const loggerService: LoggerService = new LoggerService(processorConfig);

let databaseManager: DatabaseManagerInstance<Required<AppDatabaseServices>>;
let configuration: Configuration;

export let databaseService: DatabaseService;

export const dbInit = async (): Promise<void> => {
  await DatabaseFactory.initializeDatabase({
    host: process.env.TCS_DB_HOST ?? 'localhost',
    port: parseInt(process.env.TCS_DB_PORT ?? '5432', 10),
    database: process.env.TCS_DB_NAME ?? 'tcs',
    user: process.env.TCS_DB_USER ?? 'postgres',
    password: process.env.TCS_DB_PASSWORD ?? 'postgres',
  });
  loggerService.log('TCS DatabaseFactory initialized');

  databaseService = new DatabaseService();
  loggerService.log('TCS DatabaseService initialized');

  configuration = processorConfig;

  if (process.env.ENABLE_FRMS_DATABASES === 'true') {
    const { db, config } = await CreateStorageManager(
      [Database.EVENT_HISTORY, Database.CONFIGURATION, Database.EVALUATION, Cache.DISTRIBUTED],
      processorConfig.nodeEnv === 'production',
    );
    databaseManager = db as unknown as DatabaseManagerInstance<Required<AppDatabaseServices>>;
    configuration = { ...config, ...processorConfig };
    loggerService.log(util.inspect(databaseManager.isReadyCheck()));
  } else {
    loggerService.log('FRMS databases disabled - Connection Studio mode');
  }
};

const connect = async (): Promise<void> => {
  const fastify = await initializeFastifyClient();
  fastify.listen({ port: processorConfig.PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      throw Error(err.message);
    }
    loggerService.log(`Fastify listening on ${address}`);
  });
};

(async () => {
  try {
    if (process.env.NODE_ENV !== 'test') {
      await dbInit();
      await connect();
    }
  } catch (err) {
    loggerService.error(`Error while starting server on Worker ${process.pid}`, util.inspect(err));
    loggerService.error(util.inspect(err));
    process.exit(1);
  }
})();

export { databaseManager, configuration };
