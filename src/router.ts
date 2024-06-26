// SPDX-License-Identifier: Apache-2.0
import { handleHealthCheck} from './app.controller';
import { type FastifyInstance } from 'fastify';

async function Routes(fastify: FastifyInstance, options: unknown): Promise<void> {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);
}

export default Routes;
