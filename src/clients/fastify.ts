// SPDX-License-Identifier: Apache-2.0
import Ajv from 'ajv';
import messageIDParamsSchema from '../schemas/paramsSchemas.json';
import entityConditionBodySchema from '../schemas/entityCondition.json';
import accountConditionBodySchema from '../schemas/accountCondition.json';
import Routes from '../router';
import { fastifyCors } from '@fastify/cors';
import { fastifySwagger } from '@fastify/swagger';
import { fastifySwaggerUi } from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';

const paramsMessageSchema = { ...messageIDParamsSchema, $id: 'messageIDSchema' };
const entityConditionMessageSchema = { ...entityConditionBodySchema, $id: 'entityConditionSchema' };
const accountConditionMessageSchema = { ...accountConditionBodySchema, $id: 'accountConditionSchema' };
const fastify = Fastify();
const ajv = new Ajv({
  removeAdditional: 'all',
  useDefaults: true,
  coerceTypes: 'array',
  strictTuples: false,
});

ajv.addSchema(paramsMessageSchema);
ajv.addSchema(entityConditionMessageSchema);
ajv.addSchema(accountConditionMessageSchema);


export default async function initializeFastifyClient(): Promise<FastifyInstance> {
  await fastify.register(fastifySwagger, {
    prefix: '/swagger',
  });
  fastify.addSchema(paramsMessageSchema);
  fastify.addSchema(entityConditionMessageSchema);
  fastify.addSchema(accountConditionMessageSchema);

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
    transformSpecification: (swaggerObject, request, reply) => {
      return swaggerObject;
    },
    transformSpecificationClone: true,
  });

  fastify.setValidatorCompiler(({ schema }) => {
    return ajv.compile(schema);
  });

  await fastify.register(fastifyCors, {
    origin: '*',
    methods: ['GET'],
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
