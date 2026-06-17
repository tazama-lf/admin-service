// SPDX-License-Identifier: Apache-2.0
import { CreateStorageManager } from '@tazama-lf/frms-coe-lib/lib/services/dbManager';
import initializeFastifyClient from './clients/fastify';
import { type AppDatabaseServices, type Configuration, processorConfig } from './config';
import { type DatabaseManagerInstance, LoggerService } from '@tazama-lf/frms-coe-lib';
import { Database } from '@tazama-lf/frms-coe-lib/lib/config/database.config';
import { Cache } from '@tazama-lf/frms-coe-lib/lib/config/redis.config';
import { StartupFactory } from '@tazama-lf/frms-coe-startup-lib';
import { setTimeout } from 'node:timers/promises';
import * as util from 'node:util';

export const loggerService: LoggerService = new LoggerService(processorConfig);

export let databaseManager: DatabaseManagerInstance<Required<AppDatabaseServices>>;
export let configuration: Configuration;
export let serviceChannelProducer: StartupFactory | undefined;
let producerConnected = false;

export const isServiceChannelConnected = (): boolean => producerConnected;

export const dbInit = async (): Promise<void> => {
  const { db, config } = await CreateStorageManager(
    [Database.EVENT_HISTORY, Database.CONFIGURATION, Database.EVALUATION, Database.RAW_HISTORY, Database.SIMULATION, Cache.DISTRIBUTED],
    processorConfig.nodeEnv === 'production',
  );

  databaseManager = db as DatabaseManagerInstance<Required<AppDatabaseServices>>;
  configuration = { ...config, ...processorConfig };
  loggerService.log(util.inspect(databaseManager.isReadyCheck()));
};

const connect = async (): Promise<void> => {
  serviceChannelProducer = new StartupFactory();
  producerConnected = false;

  for (let retryCount = 0; retryCount < 10; retryCount++) {
    loggerService.log('Connecting service-channel producer...');
    if (await serviceChannelProducer.initServiceChannelProducer(loggerService)) {
      producerConnected = true;
      loggerService.log('Service-channel producer connected');
      break;
    }
    await setTimeout(5000);
  }

  if (!producerConnected) {
    loggerService.warn('Service-channel producer unavailable after 10 retries; continuing without broadcast dispatch.');
  }

  const fastify = await initializeFastifyClient();
  const address = await fastify.listen({ port: processorConfig.PORT, host: '0.0.0.0' });
  loggerService.log(`Fastify listening on ${address}`);
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
