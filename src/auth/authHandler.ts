import { validateTokenAndClaims } from '@tazama-lf/auth-lib';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { loggerService } from '..';
import { type Claim, normalizeClaims, hasAnyClaim } from '../utils/claim-utils';

export const tokenHandler =
  (claim: Claim) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const logContext = 'tokenHandler()';
    const authHeader = request.headers.authorization;
    const claims = normalizeClaims(claim);
    if (!authHeader?.startsWith('Bearer ') || claims.length === 0) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    try {
      const token = authHeader.split(' ')[1];
      const validated = validateTokenAndClaims(token, claims);
      if (!hasAnyClaim(claims, validated)) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
      loggerService.log('Authenticated', logContext);
    } catch (error) {
      const err = error as Error;
      loggerService.error(`${err.name}: ${err.message}\n${err.stack}`, logContext);
      reply.code(401).send({ error: 'Unauthorized' });
    }
  };
