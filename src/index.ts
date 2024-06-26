// SPDX-License-Identifier: Apache-2.0
import initializeFastifyClient from './clients/fastify';
import { configuration } from './config';


const connect = async (): Promise<void> => {
  const fastify = await initializeFastifyClient();
  const { port, host } = configuration.service;
  fastify.listen({ port, host }, (err, address) => {
    if (err) {
      console.error(err);
      throw Error(`${err.message}`);
    }

    console.log(`Fastify listening on ${address}`);
  });
};


process.on('uncaughtException', (err) => {
  console.error('process on uncaughtException error', err, 'index.ts');
});

process.on('unhandledRejection', (err) => {
  console.error(`process on unhandledRejection error: ${JSON.stringify(err) ?? '[NoMetaData]'}`);
});

(async () => {
  try {
    if (process.env.NODE_ENV !== 'test') {
      await connect();
    }
  } catch (err) {
    process.exit(1);
  }
})();


