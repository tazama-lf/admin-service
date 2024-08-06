// SPDX-License-Identifier: Apache-2.0
import { type RouteHandlerMethod } from 'fastify';
import { type FastifySchema } from 'fastify/types/schema';

const SetOptions = (
  handler: RouteHandlerMethod,
  paramSchemaName: string,
  bodySchema?: boolean,
): { handler: RouteHandlerMethod; schema: FastifySchema } => {
  let schema: FastifySchema = { querystring: { $ref: `${paramSchemaName}#` } };
  if (bodySchema) {
    schema = { body: { $ref: `${paramSchemaName}#` } };
  }
  return {
    handler,
    schema,
  };
};

export default SetOptions;
