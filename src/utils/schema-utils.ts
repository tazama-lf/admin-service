// SPDX-License-Identifier: Apache-2.0
import { type RouteHandlerMethod } from 'fastify';
import { type FastifySchema } from 'fastify/types/schema';

const reposnseSchema = (schemaTransactionName: string): Record<string, unknown> => {
  return {
    '2xx': {
      type: 'object',
      properties: {
        message: {
          type: 'string',
        },
        data: {
          type: 'object',
          $ref: `${schemaTransactionName}#`,
        },
      },
    },
  };
};

const SetOptions = (handler: RouteHandlerMethod, schemaTransactionName: string): { handler: RouteHandlerMethod; schema: FastifySchema } => {
  return {
    handler,
    schema: { body: { $ref: `${schemaTransactionName}#` }, response: reposnseSchema(schemaTransactionName) },
  };
};

export default SetOptions;
