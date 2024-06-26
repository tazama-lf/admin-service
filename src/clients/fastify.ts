// SPDX-License-Identifier: Apache-2.0
import Fastify, { type FastifyInstance } from 'fastify';
import { fastifyCors } from '@fastify/cors';
import Routes from '../router';

const fastify = Fastify();

export default async function initializeFastifyClient(): Promise<FastifyInstance> {
  await fastify.register(fastifyCors, {
    origin: '*',
    methods: ['POST', 'GET'],
    allowedHeaders: '*',
  });
  fastify.register(Routes);

  await fastify.ready();

  return await fastify;
}

export async function destroyFasityClient(): Promise<void> {
  await fastify.close();
}
