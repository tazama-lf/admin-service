import type { FastifyRequest, FastifyReply } from 'fastify';
import { databaseService } from '../index';
import type { AuthenticatedRequest } from '../interface/AuthenticatedRequest';

interface NodeInput {
  tenant_id: string;
  created_by: string;
  name: string;
  description: string;
  type: string;
  color: string;
  label: string;
  category: string;
  code_template: string;
  default_data?: Record<string, unknown>;
}

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

    const nodes = rawBody as NodeInput[];
    const dataToInsert = nodes.map((node: NodeInput) => ({
      ...node,
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
    const queryParams = req.query as { type?: string; category?: string };

    const nodes = await databaseService.findAll(tenantId, {
      tenantId,
      type: queryParams.type,
      category: queryParams.category,
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
