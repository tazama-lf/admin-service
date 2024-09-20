// SPDX-License-Identifier: Apache-2.0
import { type FastifyReply, type FastifyRequest, type RouteHandlerMethod } from 'fastify';
import { type FastifySchema } from 'fastify/types/schema';
import { loggerService } from '..';
import { configuration } from '../config';
import { tokenHandler } from '../auth/authHandler';

type preHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export const SetOptionsBody = (
  handler: RouteHandlerMethod,
  bodySchemaName: string,
): { handler: RouteHandlerMethod; schema: FastifySchema } => {
  const schema: FastifySchema = { body: { $ref: `${bodySchemaName}#` } };

  return {
    handler,
    schema,
  };
};

export const SetOptionsParams = (
  handler: RouteHandlerMethod,
  paramSchemaName: string,
  claim: string,
): { preHandler?: preHandler; handler: RouteHandlerMethod; schema: FastifySchema } => {
  loggerService.debug(`Authentication is ${configuration.authentication ? 'ENABLED' : 'DISABLED'} for ${handler.name}`);
  const preHandler = configuration.authentication ? tokenHandler(claim) : undefined;
  const schema: FastifySchema = { querystring: { $ref: `${paramSchemaName}#` } };

  return {
    preHandler,
    handler,
    schema,
  };
};

export const SetOptionsBodyAndParams = (
  handler: RouteHandlerMethod,
  bodySchemaName: string,
  paramSchemaName: string,
  claim: string,
): { preHandler?: preHandler; handler: RouteHandlerMethod; schema: FastifySchema } => {
  loggerService.debug(`Authentication is ${configuration.authentication ? 'ENABLED' : 'DISABLED'} for ${handler.name}`);
  const preHandler = configuration.authentication ? tokenHandler(claim) : undefined;
  const schema: FastifySchema = { querystring: { $ref: `${paramSchemaName}#` }, body: { $ref: `${bodySchemaName}#` } };

  return {
    preHandler,
    handler,
    schema,
  };
};
