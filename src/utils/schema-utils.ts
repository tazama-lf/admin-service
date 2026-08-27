// SPDX-License-Identifier: Apache-2.0
import type { FastifyReply, FastifyRequest, RouteHandlerMethod } from 'fastify';
import type { FastifySchema } from 'fastify/types/schema';
import { validateTenantMiddleware } from '../middleware/tenantMiddleware';
import { tokenHandler } from '../auth/authHandler';
import { loggerService, configuration } from '../index';
import type { TSchema } from '@sinclair/typebox';
import type { Claim } from '../interface/claim.interface';
import { rateLimitResponses, type RateLimitTierConfig } from './rate-limit-tiers';

type preHandler = (request: FastifyRequest, reply: FastifyReply) => void | Promise<void>;

export const SetOptionsBodyAndParams = (
  handler: RouteHandlerMethod,
  claim: Claim,
  bodySchemaName?: TSchema,
  querySchemaName?: TSchema,
  paramsSchemaName?: TSchema,
  // Opt-in: leave unset and the route is not rate limited at all.
  rateLimit?: RateLimitTierConfig,
): { preHandler?: preHandler[]; handler: RouteHandlerMethod; schema: FastifySchema; config?: { rateLimit: RateLimitTierConfig } } => {
  loggerService.debug(`Authentication is ${configuration.AUTHENTICATED ? 'ENABLED' : 'DISABLED'} for ${handler.name}`);
  const preHandlers: preHandler[] = configuration.AUTHENTICATED
    ? [validateTenantMiddleware, tokenHandler(claim)]
    : [validateTenantMiddleware];
  const querystring = querySchemaName ? { querystring: querySchemaName } : undefined;
  const params = paramsSchemaName ? { params: paramsSchemaName } : undefined;
  const body = bodySchemaName ? { body: bodySchemaName } : undefined;
  // Only rate-limited routes document (and serialize) a 429 — an unlimited route can never return one.
  const response = rateLimit ? { response: rateLimitResponses } : undefined;
  const schema: FastifySchema = { ...querystring, ...params, ...body, ...response };
  return {
    preHandler: preHandlers,
    handler,
    schema,
    ...(rateLimit ? { config: { rateLimit } } : {}),
  };
};

export default SetOptionsBodyAndParams;
