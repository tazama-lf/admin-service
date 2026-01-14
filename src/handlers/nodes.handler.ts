import type { FastifyRequest, FastifyReply } from 'fastify';
import { databaseService } from '../index';
import type { AuthenticatedRequest } from '../interface/AuthenticatedRequest';

const sendError = (reply: FastifyReply, status: number, message: string): void => {
  reply.code(status).send({ success: false, message });
};

export const createNodeHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
  const userId = authReq.user?.clientId ?? authReq.user?.sub ?? authReq.user?.preferred_username ?? 'system';

  try {
    const rawBody = req.body;
    if (!Array.isArray(rawBody)) {
      sendError(reply, 400, 'Request body must be an array of nodes');
      return;
    }

    const nodes = rawBody as Array<Record<string, unknown>>;
    const dataToInsert = nodes.map((node: Record<string, unknown>) => ({
      node_json: node,
      tenant_id: tenantId,
      created_by: userId,
    }));

    const result: unknown = await databaseService.createNode(dataToInsert);

    const resultArray = Array.isArray(result) ? (result as unknown[]) : [result];

    reply.code(201).send({
      success: true,
      message: `${resultArray.length} node(s) created successfully`,
      nodes: resultArray,
      count: resultArray.length,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create node';
    sendError(reply, 500, errorMessage);
  }
};

export const getNodeHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const queryParams = req.query as { type?: string; category?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' };

    const nodes = await databaseService.findAllNodes({
      tenantId,
      type: queryParams.type,
      category: queryParams.category,
      sortBy: queryParams.sortBy,
      sortOrder: queryParams.sortOrder,
    });
    reply.code(200).send({
      success: true,
      message: 'Nodes retrieved successfully',
      nodes,
      count: nodes.length,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve nodes';
    sendError(reply, 500, errorMessage);
  }
};

export const deleteNodeById = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const tenantId = authReq.user?.tenantId ?? 'DEFAULT';
    const queryParams = req.query as { nodeId?: string };

    await databaseService.deleteNodeById(Number(queryParams.nodeId), tenantId);
    reply.code(200).send({
      success: true,
      message: 'Node deleted successfully',
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete node';
    sendError(reply, 500, errorMessage);
  }
};
