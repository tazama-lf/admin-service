// import { validateTokenAndClaims } from '@tazama-lf/auth-lib';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { loggerService, userEmailCache } from '..';
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
      // const validated = validateTokenAndClaims(token, [claim]);
      // if (!validated[claim]) {
      //   reply.code(401).send({ error: 'Unauthorized' });
      //   return;
      // }

      const decoded = jwt.decode(token) as DecodedToken | null;

      if (!decoded) {
        reply.code(401).send({ error: 'Invalid token' });
        return;
      }

      const claims = decoded.claims ?? decoded.realm_access?.roles ?? [];
      const tenantId = decoded.tenantId ?? decoded.tenant_id;
      const userId = decoded.clientId ?? decoded.sub;
      const email = decoded.preferred_username ?? decoded.email;
      const authReq = request as AuthenticatedRequest;
      authReq.user = {
        claims: Array.isArray(claims) ? claims : [],
        clientId: userId,
        tenantId,
      };

      if (tenantId && userId && email) {
        const rolesArray = Array.isArray(claims) ? claims : [];
        try {
          userEmailCache.cacheUser(tenantId, userId, email, rolesArray);
          loggerService.log(`User cached: ${email} (tenant: ${tenantId}, userId: ${userId})`, logContext);
        } catch (err) {
          const error = err as Error;
          loggerService.error(`Failed to cache user email: ${error.message}`, logContext);
        }
      } else {
        loggerService.warn(`Incomplete user data - NOT cached: tenantId=${tenantId}, userId=${userId}, email=${email}`, logContext);
      }

      loggerService.log(`User claims: ${JSON.stringify(claims)}`, logContext);

      loggerService.log('Authenticated', logContext);
    } catch (error) {
      const err = error as Error;
      loggerService.error(`${err.name}: ${err.message}\n${err.stack ?? ''}`, logContext);
      reply.code(401).send({ error: 'Unauthorized' });
    }
  };
