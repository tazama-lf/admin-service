// SPDX-License-Identifier: Apache-2.0
import { type RouteHandlerMethod } from 'fastify';
import { type FastifySchema } from 'fastify/types/schema';

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
): { handler: RouteHandlerMethod; schema: FastifySchema } => {
  const schema: FastifySchema = { querystring: { $ref: `${paramSchemaName}#` } };

  return {
    handler,
    schema,
  };
};

export const SetOptionsBodyAndParams = (
  handler: RouteHandlerMethod,
  bodySchemaName: string,
  paramSchemaName: string,
): { handler: RouteHandlerMethod; schema: FastifySchema } => {
  const schema: FastifySchema = { querystring: { $ref: `${paramSchemaName}#` }, body: { $ref: `${bodySchemaName}#` } };

  return {
    handler,
    schema,
  };
};
