import type { FastifyReply, FastifyRequest } from 'fastify';
import { configuration, loggerService } from '..';
import jwt from 'jsonwebtoken';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DecodedToken, AuthenticatedUserInfo } from '../interface/DecodedToken';

interface AuthenticatedRequest extends FastifyRequest {
  user?: AuthenticatedUserInfo;
}

let publicKey: string | undefined;

if (configuration.CERT_PATH_PUBLIC) {
  try {
    const certPath = path.resolve(__dirname, '..', configuration.CERT_PATH_PUBLIC);
    publicKey = fs.readFileSync(certPath, 'utf8');
  } catch (error) {
    const err = error as Error;
    loggerService.error(`Failed to load public key: ${err.message}`, 'tokenHandler');
  }
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

      let decoded: DecodedToken;
      if (publicKey) {
        decoded = jwt.verify(token, publicKey, {
          algorithms: ['RS256'],
        }) as DecodedToken;
      } else {
        loggerService.warn('No public key configured, using unsafe jwt.decode', logContext);
        const decodedToken = jwt.decode(token) as DecodedToken | null;
        if (!decodedToken) {
          reply.code(401).send({ error: 'Invalid token' });
          return;
        }
        decoded = decodedToken;
      }

      const claims = decoded.claims ?? decoded.realm_access?.roles ?? [];
      const claimsArray = Array.isArray(claims) ? claims : [];

      if (!claimsArray.includes(claim)) {
        loggerService.warn(`Missing required claim: ${claim}`, logContext);
        reply.code(403).send({ error: 'Forbidden - insufficient permissions' });
        return;
      }

      const tenantId = decoded.tenantId ?? decoded.tenant_id;
      const userId = decoded.clientId ?? decoded.sub;
      const authReq = request as AuthenticatedRequest;
      authReq.user = {
        claims: claimsArray,
        clientId: userId,
        tenantId,
      };

      loggerService.log('Authenticated', logContext);
    } catch (error) {
      const err = error as Error;
      if (err.name === 'TokenExpiredError') {
        loggerService.warn('Token expired', logContext);
        reply.code(401).send({ error: 'Token expired' });
      } else if (err.name === 'JsonWebTokenError') {
        loggerService.warn(`JWT verification failed: ${err.message}`, logContext);
        reply.code(401).send({ error: 'Invalid token' });
      } else {
        loggerService.error(`${err.name}: ${err.message}\n${err.stack ?? ''}`, logContext);
        reply.code(401).send({ error: 'Unauthorized' });
      }
    }
  };
