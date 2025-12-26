import type { FastifyRequest, FastifyReply } from 'fastify';
import { databaseService } from '../index';
import type { AuthenticatedRequest } from '../interface/AuthenticatedRequest';

const sendError = (reply: FastifyReply, status: number, message: string): void => {
  reply.code(status).send({ success: false, message });
};

export const getAllRulesHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const body = authReq.body as Record<string, string>;
    const { offset = '0', limit = '10' } = req.params as { offset?: string; limit?: string };
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    const result = await databaseService.findRulesWithFilters(parsedLimit, parsedOffset, body, tenantId);
    reply.code(200).send({
      success: true,
      rules: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      pages: Math.ceil(result.total / result.limit),
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get configs';
    sendError(reply, 500, errorMessage);
  }
};

export const getRulesByIdHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const rulesId = parseInt(id);
    if (isNaN(rulesId)) {
      sendError(reply, 400, `Invalid rules ID: ${id}. Must be a valid number.`);
      return;
    }
    const rules = await databaseService.findRuleById(rulesId, tenantId);
    if (!rules) {
      sendError(reply, 404, `Rules with id ${id} not found`);
      return;
    }
    reply.code(200).send({ success: true, rules });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get rules';
    sendError(reply, 500, errorMessage);
  }
};

export const countRulesByStatusHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';

    const count = await databaseService.countRulesByStatus(tenantId);
    reply.code(200).send({ success: true, count });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to count rules';
    sendError(reply, 500, errorMessage);
  }
};
