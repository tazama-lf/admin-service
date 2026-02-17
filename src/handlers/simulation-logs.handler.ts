import type { FastifyReply, FastifyRequest } from 'fastify';
import { databaseService } from '../index';
import type { AuthenticatedRequest } from '../interface/AuthenticatedRequest';
import { ErrorHandler } from './errorHandler';
import type { DecodedToken } from '../interface/DecodedToken';
import jwt from 'jsonwebtoken';

const decodeInnerToken = (headerToken: string): DecodedToken | null => {
  const token = headerToken?.split(' ')[1] ?? '';
  const decodeOuterToken = (jwt.decode(token) as { tokenString: string })?.tokenString;
  const decodeInnerToken = jwt.decode(decodeOuterToken);
  return decodeInnerToken as DecodedToken | null;
};

export const insertSimulationLogsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const userId = authReq.user?.clientId ?? authReq.user?.sub ?? authReq.user?.preferred_username ?? 'system';
    const decodedToken = decodeInnerToken(req.headers.authorization ?? '');

    const payload = req.body as {
      rule_id: string;
      new_data: Record<string, unknown>;
      old_data?: Record<string, unknown>;
      description?: string;
      category: string;
    };

    const simulationLogs = {
      userId,
      tenantId,
      ruleId: payload.rule_id,
      newData: payload.new_data,
      oldData: payload?.old_data ?? {},
      description: payload?.description,
      category: payload.category,
      createdByEmail: decodedToken?.preferred_username ?? userId,
    };

    await databaseService.insertSimulationLogs(simulationLogs);
    reply.code(201).send({
      success: true,
      message: 'Simulation logs inserted successfully',
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to insert simulation logs');
  }
};

export const getSimulationLogsHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const { ruleId } = req.params as { ruleId: string };
    const { category } = req.query as { category: string };

    const result = await databaseService.getSimulationLogs(ruleId, tenantId, category);
    reply.code(200).send({
      success: true,
      message: 'Simulation logs retrieved successfully',
      result,
    });
  } catch (error: unknown) {
    ErrorHandler.sendError(reply, error, 'Failed to get simulation logs');
  }
};
