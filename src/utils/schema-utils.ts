// SPDX-License-Identifier: Apache-2.0
import { type FastifyReply, type FastifyRequest, type RouteHandlerMethod } from 'fastify';
import { type FastifySchema } from 'fastify/types/schema';
import { loggerService } from '..';
import { configuration } from '../config';
import { tokenHandler } from '../auth/authHandler';

type preHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export const SetOptionsBodyAndParams = (
  handler: RouteHandlerMethod,
  claim: string,
  bodySchemaName?: string,
  paramSchemaName?: string,
): { preHandler?: preHandler; handler: RouteHandlerMethod; schema: FastifySchema } => {
  loggerService.debug(`Authentication is ${configuration.authentication ? 'ENABLED' : 'DISABLED'} for ${handler.name}`);
  const preHandler = configuration.authentication ? tokenHandler(claim) : undefined;
  const querystring = paramSchemaName ? { querystring: { $ref: `${paramSchemaName}#` } } : undefined;
  const body = bodySchemaName ? { body: { $ref: `${bodySchemaName}#` } } : undefined;
  const schema: FastifySchema = { ...querystring, ...body };

  return {
    preHandler,
    handler,
    schema,
  };
};
