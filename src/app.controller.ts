// SPDX-License-Identifier: Apache-2.0
import { loggerService } from '.';
import { handleGetReportRequestByMsgId } from './logic.service';
import { type FastifyRequest, type FastifyReply } from 'fastify';


export const ReportRequestHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle report request');
  try {
    const request = req.query as { msgId: string };
    const report = await handleGetReportRequestByMsgId(request.msgId);

    const body = {
      message: 'Report was found',
      data: report,
    };
    reply.status(200);
    reply.send(body);
  } catch (err) {
    const failMessage = `Failed to process execution request. \n${JSON.stringify(err, null, 4)}`;
    loggerService.error(failMessage, 'ApplicationService');
    reply.status(500);
    reply.send(failMessage);
  } finally {
    loggerService.log('End - Handle report request');
  }
};



const handleHealthCheck = async (): Promise<{ status: string }> => {
  return {
    status: 'UP',
  };
};

export { handleHealthCheck };
