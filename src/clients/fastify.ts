// SPDX-License-Identifier: Apache-2.0
import Ajv from 'ajv';
import addFormats from 'ajv-formats'; // <-- add this import
import Routes from '../router';
import { fastifyCors } from '@fastify/cors';
import { fastifySwagger } from '@fastify/swagger';
import { fastifySwaggerUi } from '@fastify/swagger-ui';
import { fastifyRateLimit } from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { configuration } from '..';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { parseQueryString } from './querystringParser';
import { createRateLimitRedisClient } from './rate-limit-redis';
import { rateLimitErrorResponseBuilder, rateLimitKeyGenerator } from '../utils/rate-limit-tiers';

// Single source of truth for the documented API version: read it from package.json at startup so
// the OpenAPI `info.version` cannot drift from the published package version. A missing package.json
// is left to throw loudly (it signals a broken build); a missing/invalid `version` field falls back
// to a neutral value so the generated spec always carries a valid version string.
const parsedPkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')) as {
  version?: unknown;
};
const apiVersion = typeof parsedPkg.version === 'string' && parsedPkg.version.length > 0 ? parsedPkg.version : '0.0.0';

const fastify = Fastify({
  // Lets req.ip resolve to the real client behind a proxy, for the rate limiter's per-IP fallback.
  // Only on when TRUST_PROXY=true, since trusting X-Forwarded-For blindly would let a client spoof
  // its way around rate limiting.
  trustProxy: configuration.TRUST_PROXY?.toLowerCase() === 'true',
  routerOptions: {
    querystringParser: (str) => parseQueryString(str),
  },
});

// The rate-limit Redis client. Created inside initializeFastifyClient(), not here, so it isn't
// opened before configuration.redisConfig is ready.
let rateLimitRedis: ReturnType<typeof createRateLimitRedisClient> | undefined;

const ajv = new Ajv({
  removeAdditional: 'all',
  useDefaults: true,
  coerceTypes: 'array',
  strictTuples: false,
});
addFormats(ajv); // <-- add this line

export default async function initializeFastifyClient(): Promise<FastifyInstance> {
  await fastify.register(fastifySwagger, {
    prefix: '/swagger',
    openapi: {
      info: {
        title: 'Tazama Admin Service API',
        description: 'Administrative API for managing Tazama configuration (network maps, rules and typologies) and related operations.',
        version: apiVersion,
      },
      tags: [
        { name: '/v1/admin/configuration/network_map', description: 'CRUD operations for network map configurations.' },
        { name: '/v1/admin/configuration/rule', description: 'CRUD operations for rule configurations.' },
        { name: '/v1/admin/configuration/typology', description: 'CRUD operations for typology configurations.' },
      ],
    },
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
    // Drop `upgrade-insecure-requests` from the generated CSP. Swagger UI references its assets via
    // same-origin, path-absolute URLs, so they already inherit the document's scheme (HTTP or HTTPS).
    // The directive only ever rewrites explicit http:// subresources to https://, of which there are
    // none here; leaving it in forces asset requests to https on a plain-HTTP deployment, which fails
    // with ERR_SSL_PROTOCOL_ERROR and renders a blank UI. Removal is a no-op when served over HTTPS.
    transformStaticCSP: (header) => header.replace(/\s*upgrade-insecure-requests;?/i, ''),
    transformSpecification: (swaggerObject, request, reply) => swaggerObject,
    transformSpecificationClone: true,
  });

  fastify.setValidatorCompiler(({ schema }) => ajv.compile(schema));

  const methods = configuration.CORS_POLICY?.toLowerCase() === 'demo' ? ['GET', 'POST', 'PUT'] : ['GET'];

  await fastify.register(fastifyCors, {
    origin: '*',
    methods,
    allowedHeaders: '*',
  });

  rateLimitRedis = createRateLimitRedisClient(configuration.redisConfig);

  await fastify.register(fastifyRateLimit, {
    // Opt-in per route: only routes that declare config.rateLimit get limited.
    global: false,
    redis: rateLimitRedis,
    // Fail-open by default: a Redis blip lets requests through instead of causing an outage.
    // Set RATE_LIMIT_FAIL_OPEN=false to fail closed instead.
    skipOnError: configuration.RATE_LIMIT_FAIL_OPEN?.toLowerCase() !== 'false',
    keyGenerator: rateLimitKeyGenerator,
    errorResponseBuilder: rateLimitErrorResponseBuilder,
  });

  fastify.register(Routes);

  await fastify.ready();

  fastify.swagger();

  return await fastify;
}

export async function destroyFasityClient(): Promise<void> {
  await fastify.close();
  await rateLimitRedis?.quit();
}
