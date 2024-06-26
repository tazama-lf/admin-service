// SPDX-License-Identifier: Apache-2.0
import initializeFastifyClient from './clients/fastify';
import { configuration } from './config';
import { type DatabaseManagerInstance, CreateDatabaseManager } from '@frmscoe/frms-coe-lib';

let databaseManager: DatabaseManagerInstance<typeof configuration.db>;

export const dbInit = async (): Promise<void> => {
  databaseManager =  await CreateDatabaseManager(configuration.db);
};

const connect = async (): Promise<void> => {
  const fastify = await initializeFastifyClient();
  const { port, host } = configuration.service;
  fastify.listen({ port, host }, (err, address) => {
    if (err) {
      throw Error(`${err.message}`);
    }
  });
};

(async () => {
  try {
    if (process.env.NODE_ENV !== 'test') {
      await connect();
    }
  } catch (err) {
    process.exit(1);
  }
})();

export { databaseManager };


