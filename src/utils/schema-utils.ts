// SPDX-License-Identifier: Apache-2.0
import type { FastifyReply, FastifyRequest, RouteHandlerMethod } from 'fastify';
import type { FastifySchema } from 'fastify/types/schema';
import { configuration, loggerService } from '..';
import { tenantAwareTokenHandler } from '../auth/authHandler';

type preHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export const SetOptionsBodyAndParams = (
  handler: RouteHandlerMethod,
  claims?: string[] | string,
  bodySchemaName?: string,
  paramSchemaName?: string,
): { preHandler?: preHandler; handler: RouteHandlerMethod; schema: FastifySchema } => {
  loggerService.debug(`Authentication is ${configuration.AUTHENTICATED ? 'ENABLED' : 'DISABLED'} for ${handler.name}`);
  // Normalize claims to array
  const claimsArray = typeof claims === 'string' ? [claims] : (claims ?? []);
  const preHandler = configuration.AUTHENTICATED ? tenantAwareTokenHandler(claimsArray) : undefined;
  const schema: FastifySchema = {};
  if (paramSchemaName) {
    schema.querystring = { $ref: `${paramSchemaName}#` };
  }
  if (bodySchemaName) {
    schema.body = { $ref: `${bodySchemaName}#` };
  }
  return {
    preHandler,
    handler,
    schema,
  };
};
