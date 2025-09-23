// SPDX-License-Identifier: Apache-2.0
import type { FastifyReply, FastifyRequest, RouteHandlerMethod } from 'fastify';
import type { FastifySchema } from 'fastify/types/schema';
import { validateTenantMiddleware } from '../middleware/tenantMiddleware';
import { tokenHandler } from '../auth/authHandler';
import { loggerService, configuration } from '../index';

type preHandler = (request: FastifyRequest, reply: FastifyReply) => void | Promise<void>;

export const SetOptionsBodyAndParams = (
  handler: RouteHandlerMethod,
  claim: string,
  bodySchemaName?: string,
  paramSchemaName?: string,
): { preHandler?: preHandler[]; handler: RouteHandlerMethod; schema: FastifySchema } => {
  loggerService.debug(`Authentication is ${configuration.AUTHENTICATED ? 'ENABLED' : 'DISABLED'} for ${handler.name}`);
  const preHandlers: preHandler[] = configuration.AUTHENTICATED
    ? [validateTenantMiddleware, tokenHandler(claim)]
    : [validateTenantMiddleware];
  const querystring = paramSchemaName ? { querystring: { $ref: `${paramSchemaName}#` } } : undefined;
  const body = bodySchemaName ? { body: { $ref: `${bodySchemaName}#` } } : undefined;
  const schema: FastifySchema = { ...querystring, ...body };
  return {
    preHandler: preHandlers,
    handler,
    schema,
  };
};

export default SetOptionsBodyAndParams;
