// SPDX-License-Identifier: Apache-2.0
import type { FastifyReply, FastifyRequest, RouteHandlerMethod } from 'fastify';
import type { FastifySchema } from 'fastify/types/schema';
import { validateTenantMiddleware } from '../middleware/tenantMiddleware';
import { tokenHandler } from '../auth/authHandler';
import { loggerService, configuration } from '../index';
import type { TSchema } from '@sinclair/typebox';
import type { Claim } from '../interface/claim.interface';

type preHandler = (request: FastifyRequest, reply: FastifyReply) => void | Promise<void>;

export const SetOptionsBodyAndParams = (
  handler: RouteHandlerMethod,
  claim: Claim,
  bodySchemaName?: TSchema,
  querySchemaName?: TSchema,
  paramsSchemaName?: TSchema,
): { preHandler?: preHandler[]; handler: RouteHandlerMethod; schema: FastifySchema } => {
  loggerService.debug(`Authentication is ${configuration.AUTHENTICATED ? 'ENABLED' : 'DISABLED'} for ${handler.name}`);
  const preHandlers: preHandler[] = configuration.AUTHENTICATED
    ? [validateTenantMiddleware, tokenHandler(claim)]
    : [validateTenantMiddleware];
  const querystring = querySchemaName ? { querystring: querySchemaName } : undefined;
  const params = paramsSchemaName ? { params: paramsSchemaName } : undefined;
  const body = bodySchemaName ? { body: bodySchemaName } : undefined;
  const schema: FastifySchema = { ...querystring, ...params, ...body };
  return {
    preHandler: preHandlers,
    handler,
    schema,
  };
};

export default SetOptionsBodyAndParams;
