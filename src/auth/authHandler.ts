// import { validateTokenAndClaims } from '@tazama-lf/auth-lib';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { loggerService } from '..';
import jwt from 'jsonwebtoken';
import type { DecodedToken, AuthenticatedUserInfo } from '../interface/DecodedToken';

interface AuthenticatedRequest extends FastifyRequest {
  user?: AuthenticatedUserInfo;
}

export const tokenHandler =
  (claim: string) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const logContext = 'tokenHandler';
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ') || !claim) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    try {
      const [, token] = authHeader.split(' ');

      const decoded = jwt.decode(token) as DecodedToken | null;

      if (!decoded) {
        reply.code(401).send({ error: 'Invalid token' });
        return;
      }

      const claims = decoded.claims ?? decoded.realm_access?.roles ?? [];
      const tenantId = decoded.tenantId ?? decoded.tenant_id;
      const userId = decoded.clientId ?? decoded.sub;
      const authReq = request as AuthenticatedRequest;
      authReq.user = {
        claims: Array.isArray(claims) ? claims : [],
        clientId: userId,
        tenantId,
      };

      loggerService.log('Authenticated', logContext);
    } catch (error) {
      const err = error as Error;
      loggerService.error(`${err.name}: ${err.message}\n${err.stack ?? ''}`, logContext);
      reply.code(401).send({ error: 'Unauthorized' });
    }
  };
