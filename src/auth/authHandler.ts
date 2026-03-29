import { validateTokenAndClaims } from '@tazama-lf/auth-lib';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { loggerService } from '..';

export const tokenHandler =
  (claim: string) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const logContext = 'tokenHandler()';
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ') || !claim) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    try {
      const token = authHeader.split(' ')[1];
      const validated = validateTokenAndClaims(token, [claim]);
      if (!validated[claim]) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
      loggerService.log('Authenticated', logContext);
    } catch (error) {
      const err = error as Error;
      loggerService.error(`${err.name}: ${err.message}\n${err.stack}`, logContext);
      reply.code(401).send({ error: 'Unauthorized' });
    }
  };
