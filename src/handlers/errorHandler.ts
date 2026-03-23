import type { FastifyReply } from 'fastify';
import type { HttpError } from '../interface/common.interface';

const statusMessages: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

function normalizeError(error: unknown, defaultMessage: string): HttpError {
  if (typeof error === 'object' && error !== null) {
    const err = error as HttpError;

    // Handle NestJS HttpException format and similar structures
    const response = err.response as { message?: string; statusCode?: number } | undefined;
    const status = err.status ?? err.statusCode ?? response?.statusCode;
    const message = typeof response === 'string' ? response : (response?.message ?? err.message);

    return {
      name: err.name ?? 'Error',
      status: status ?? 500,
      message: message ?? defaultMessage,
      stack: err.stack,
      response: err.response,
    };
  }

  return {
    name: 'InternalServerError',
    status: 500,
    message: defaultMessage,
  };
}

export const ErrorHandler = {
  sendError(reply: FastifyReply, error: unknown, defaultMessage: string): void {
    const err = normalizeError(error, defaultMessage);
    const status = err.status ?? 500;

    reply.code(status).send({
      success: false,
      message: err.message ?? statusMessages[status] ?? 'An unexpected error occurred',
      error: err.name,
      statusCode: status,
      details: err.response?.message ?? err.message,
    });
  },
};
