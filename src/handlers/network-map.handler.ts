import type { FastifyRequest, FastifyReply } from 'fastify';
import { databaseService } from '../index';
import type { AuthenticatedRequest } from '../interface/AuthenticatedRequest';

const sendError = (reply: FastifyReply, status: number, message: string): void => {
  reply.code(status).send({ success: false, message });
};

export const getActiveNetworkMapHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

    const networkMap: unknown = await databaseService.findActiveNetworkMap(tenantId);

    if (!networkMap) {
      sendError(reply, 404, 'No active network map found for this tenant');
      return;
    }

    reply.code(200).send({
      success: true,
      networkMap,
    });
  } catch (error: unknown) {
    // Check if it's the multiple active network maps error
    if (error instanceof Error && error.message.includes('Multiple active network maps')) {
      sendError(reply, 409, error.message);
      return;
    }

    const errorMessage = error instanceof Error ? error.message : 'Failed to get active network map';
    sendError(reply, 500, errorMessage);
  }
};
