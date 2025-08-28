// SPDX-License-Identifier: Apache-2.0
import type { FastifyReply, FastifyRequest, RouteHandlerMethod } from 'fastify';
import type { FastifySchema } from 'fastify/types/schema';
import { configuration, loggerService } from '..';
import { tokenHandler } from '../auth/authHandler';

export type PreHandler = (request: FastifyRequest, reply: FastifyReply) => void;

export const SetOptionsBodyAndParams = (
  handler: RouteHandlerMethod,
  claim: string,
  bodySchemaName?: string,
  paramSchemaName?: string,
): { preHandler?: PreHandler; handler: RouteHandlerMethod; schema: FastifySchema } => {
  loggerService.debug(`Authentication is ${configuration.AUTHENTICATED ? 'ENABLED' : 'DISABLED'} for ${handler.name}`);
  const preHandler = configuration.AUTHENTICATED ? tokenHandler(claim) : undefined;
  const querystring = paramSchemaName ? { querystring: { $ref: `${paramSchemaName}#` } } : undefined;
  const body = bodySchemaName ? { body: { $ref: `${bodySchemaName}#` } } : undefined;
  const schema: FastifySchema = { ...querystring, ...body };

  return {
    preHandler,
    handler,
    schema,
  };
};
