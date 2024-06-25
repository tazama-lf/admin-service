// SPDX-License-Identifier: Apache-2.0
import Fastify, { type FastifyInstance } from 'fastify';
import { fastifySwagger } from '@fastify/swagger';
import { fastifyCors } from '@fastify/cors';
import Routes from '../router';
import Ajv from 'ajv';
import { fastifySwaggerUi } from '@fastify/swagger-ui';
import messageSchemaPacs002 from '../schemas/reportSchema.json';
import messageIDParamsSchema from '../schemas/paramsSchemas.json';

const paramsMessageSchema = { ...messageIDParamsSchema, $id: 'messageIDSchema' };
const reportResponseSchema = { ...messageSchemaPacs002, $id: 'ReportResponseSchema' };
const fastify = Fastify();

const ajv = new Ajv({
  removeAdditional: 'all',
  useDefaults: true,
  coerceTypes: 'array',
  strictTuples: false,
});

ajv.addSchema(reportResponseSchema);
ajv.addSchema(paramsMessageSchema);

export default async function initializeFastifyClient(): Promise<FastifyInstance> {
  fastify.addSchema(reportResponseSchema);
  fastify.addSchema(paramsMessageSchema);
  await fastify.register(fastifySwagger, {
    specification: {
      path: './build/swagger.yaml',
      postProcessor: function (swaggerObject) {
        return swaggerObject;
      },
      baseDir: '../../',
    },
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
    methods: ['POST', 'GET'],
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
