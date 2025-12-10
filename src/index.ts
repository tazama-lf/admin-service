// SPDX-License-Identifier: Apache-2.0
import { CreateStorageManager } from '@tazama-lf/frms-coe-lib/lib/services/dbManager';
import initializeFastifyClient from './clients/fastify';
import { type AppDatabaseServices, type Configuration, processorConfig } from './config';
import { type DatabaseManagerInstance, LoggerService } from '@tazama-lf/frms-coe-lib';
import { Database } from '@tazama-lf/frms-coe-lib/lib/config/database.config';
import { Cache } from '@tazama-lf/frms-coe-lib/lib/config/redis.config';
import * as util from 'node:util';
import { type IStartupService, StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
import { setTimeout } from 'node:timers/promises';

export const loggerService: LoggerService = new LoggerService(processorConfig);

let databaseManager: DatabaseManagerInstance<Required<AppDatabaseServices>>;
let configuration: Configuration;
let server: IStartupService;

export const dbInit = async (): Promise<void> => {
  const { db, config } = await CreateStorageManager(
    [Database.EVENT_HISTORY, Database.CONFIGURATION, Database.EVALUATION, Cache.DISTRIBUTED],
    processorConfig.nodeEnv === 'production',
  );

  databaseManager = db as DatabaseManagerInstance<Required<AppDatabaseServices>>;
  configuration = { ...config, ...processorConfig };
  loggerService.log(util.inspect(databaseManager.isReadyCheck()));
};

const commandChannelInit = async (): Promise<void> => {
  loggerService.log('Command channel initialized.');
  server = new StartupFactory();
  let isConnected = false;
  for (let retryCount = 0; retryCount < 10; retryCount++) {
    loggerService.log('Connecting to nats server...');
    if (server.initCommandChannelProducer) {
      if (!(await server.initCommandChannelProducer())) {
        await setTimeout(1000);
      } else {
        loggerService.log('Connected to nats');
        isConnected = true;
        break;
      }
    }
  }

  if (!isConnected) {
    throw new Error('Unable to connect to nats after 10 retries');
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
      await commandChannelInit();
    }
  } catch (err) {
    loggerService.error(`Error while starting server on Worker ${process.pid}`, util.inspect(err));
    loggerService.error(util.inspect(err));
    process.exit(1);
  }
})();

export { databaseManager, configuration, server };
