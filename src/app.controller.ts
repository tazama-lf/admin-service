
// SPDX-License-Identifier: Apache-2.0
import { type FastifyRequest, type FastifyReply } from 'fastify';
import { handleGetReportRequestByMsgId } from './logic.service';

export const ReportRequestHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    const request = req.query as { msgid: string };
    const data = await handleGetReportRequestByMsgId(request.msgid);
    const body = {
      message: 'Report was found',
      data,
    };
    reply.status(data ? 200 : 204);
    reply.send(body);
  } catch (err) {
    const failMessage = `Failed to process execution request. \n${JSON.stringify(err, null, 4)}`;
    reply.status(500);
    reply.send(failMessage);
  }
};

const handleHealthCheck = async (): Promise<{ status: string }> => {
  return {
    status: 'UP',
  };
};

export { handleHealthCheck };
