// SPDX-License-Identifier: Apache-2.0
import Ajv from 'ajv';
import Routes from '../router';
import { fastifyCors } from '@fastify/cors';
import { fastifySwagger } from '@fastify/swagger';
import { fastifySwaggerUi } from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import { configuration } from '..';

const fastify = Fastify();
const ajv = new Ajv({
  removeAdditional: 'all',
  useDefaults: true,
  coerceTypes: 'array',
  strictTuples: false,
});

export default async function initializeFastifyClient(): Promise<FastifyInstance> {
  await fastify.register(fastifySwagger, {
    prefix: '/swagger',
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
    uiHooks: {
      onRequest: function (request, reply, next) {
        next();
      },
      preHandler: function (request, reply, next) {
        next();
      },
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject, request, reply) => swaggerObject,
    transformSpecificationClone: true,
  });
  fastify.addHook('onRoute', (r) => {
    if (r.url === '/v1/admin/config/networkmap') {
      fastify.log.info({ schema: r?.schema?.response }, '200 schema');
    }
  });

  fastify.setValidatorCompiler(({ schema }) => ajv.compile(schema));

  const methods = configuration.CORS_POLICY?.toLowerCase() === 'demo' ? ['GET', 'POST', 'PUT'] : ['GET'];

  await fastify.register(fastifyCors, {
    origin: '*',
    methods,
    allowedHeaders: '*',
  });

  fastify.register(Routes);

  await fastify.ready();

  fastify.swagger();

  return await fastify;
}

export async function destroyFasityClient(): Promise<void> {
  await fastify.close();
}
