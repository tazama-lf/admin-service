// SPDX-License-Identifier: Apache-2.0
import { CreateDatabaseManager, CreateStorageManager } from '@tazama-lf/frms-coe-lib/lib/services/dbManager';
import type { DBConfig, DatabaseManagerType } from '@tazama-lf/frms-coe-lib/lib/services/dbManager';
import initializeFastifyClient from './clients/fastify';
import { type AppDatabaseServices, type Configuration, processorConfig } from './config';
import { type DatabaseManagerInstance, LoggerService } from '@tazama-lf/frms-coe-lib';

import { Database } from '@tazama-lf/frms-coe-lib/lib/config/database.config';
import { Cache } from '@tazama-lf/frms-coe-lib/lib/config/redis.config';
import * as util from 'node:util';

export const loggerService: LoggerService = new LoggerService(processorConfig);

let databaseManager: DatabaseManagerInstance<Required<AppDatabaseServices>>;
let readonlyDatabaseManager: DatabaseManagerType;
let configuration: Configuration;

const buildReadonlyDbConfig = (prefix: string, roUserEnv: string, roPasswordEnv: string): DBConfig => ({
  databaseName: process.env[prefix] ?? '',
  host: process.env[`${prefix}_HOST`] ?? '',
  port: Number(process.env[`${prefix}_PORT`]) || 5432,
  certPath: process.env[`${prefix}_CERT_PATH`] ?? '',
  user: process.env[roUserEnv] ?? '',
  password: process.env[roPasswordEnv] ?? '',
});

export const dbInit = async (): Promise<void> => {
  const { db, config } = await CreateStorageManager(
    [Database.EVENT_HISTORY, Database.CONFIGURATION, Database.EVALUATION, Database.RAW_HISTORY, Database.SIMULATION, Cache.DISTRIBUTED],
    processorConfig.nodeEnv === 'production',
  );

  databaseManager = db as unknown as DatabaseManagerInstance<Required<AppDatabaseServices>>;
  configuration = { ...config, ...processorConfig };
  loggerService.log(util.inspect(databaseManager.isReadyCheck()));

  readonlyDatabaseManager = await CreateDatabaseManager({
    configuration: buildReadonlyDbConfig(
      'CONFIGURATION_DATABASE',
      'CONFIGURATION_DATABASE_READONLY_USER',
      'CONFIGURATION_DATABASE_READONLY_PASSWORD',
    ),
    eventHistory: buildReadonlyDbConfig(
      'EVENT_HISTORY_DATABASE',
      'EVENT_HISTORY_DATABASE_READONLY_USER',
      'EVENT_HISTORY_DATABASE_READONLY_PASSWORD',
    ),
    evaluation: buildReadonlyDbConfig('EVALUATION_DATABASE', 'EVALUATION_DATABASE_READONLY_USER', 'EVALUATION_DATABASE_READONLY_PASSWORD'),
    rawHistory: buildReadonlyDbConfig(
      'RAW_HISTORY_DATABASE',
      'RAW_HISTORY_DATABASE_READONLY_USER',
      'RAW_HISTORY_DATABASE_READONLY_PASSWORD',
    ),
  });
  loggerService.log('Readonly database pool initialised');
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

export { databaseManager, readonlyDatabaseManager, configuration };
