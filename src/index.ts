// SPDX-License-Identifier: Apache-2.0
import initializeFastifyClient from './clients/fastify';
import { type AppDatabaseServices, configuration } from './config';
import { type DatabaseManagerInstance, CreateDatabaseManager, LoggerService } from '@tazama-lf/frms-coe-lib';

export const loggerService: LoggerService = new LoggerService(undefined);

// using the 'Required' utility type so autocompletion kicks in only the services we want
let databaseManager: DatabaseManagerInstance<Required<AppDatabaseServices>>;

export const dbInit = async (): Promise<void> => {
  databaseManager = await CreateDatabaseManager(configuration.db);

  loggerService.log(JSON.stringify(databaseManager.isReadyCheck()));
};

const connect = async (): Promise<void> => {
  const fastify = await initializeFastifyClient();
  const { port, host } = configuration.service;
  fastify.listen({ port, host }, (err, address) => {
    if (err) {
      throw Error(`${err.message}`);
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
    loggerService.error(`Error while starting server on Worker ${process.pid}`, err);
    process.exit(1);
  }
})();

export { databaseManager };
