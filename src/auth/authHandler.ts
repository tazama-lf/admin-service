import { validateTokenAndClaims } from '@tazama-lf/auth-lib';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { loggerService } from '..';
import jwt from 'jsonwebtoken';

interface DecodedToken {
  claims?: string[];
  realm_access?: {
    roles?: string[];
  };
  clientId?: string;
  sub?: string;
  tenantId?: string;
  tenant_id?: string;
}

interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    claims: string[];
    clientId?: string;
    tenantId?: string;
  };
}

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
      const [, token] = authHeader.split(' ');
      const validated = validateTokenAndClaims(token, [claim]);
      if (!validated[claim]) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      const decoded = jwt.decode(token) as DecodedToken | null;

      if (!decoded) {
        reply.code(401).send({ error: 'Invalid token' });
        return;
      }

      const claims = decoded.claims ?? decoded.realm_access?.roles ?? [];

      const authReq = request as AuthenticatedRequest;
      authReq.user = {
        claims: Array.isArray(claims) ? claims : [],
        clientId: decoded.clientId ?? decoded.sub,
        tenantId: decoded.tenantId ?? decoded.tenant_id,
      };

      loggerService.log(`User claims: ${JSON.stringify(claims)}`, logContext);

      loggerService.log('Authenticated', logContext);
    } catch (error) {
      const err = error as Error;
      loggerService.error(`${err.name}: ${err.message}\n${err.stack ?? ''}`, logContext);
      reply.code(401).send({ error: 'Unauthorized' });
    }
  };
