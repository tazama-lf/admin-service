// SPDX-License-Identifier: Apache-2.0

import { handleGetReportRequestByMsgId } from './logic.service';
import { type FastifyRequest, type FastifyReply } from 'fastify';
import { loggerService } from '.';

export const ReportRequestHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle report request');
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
