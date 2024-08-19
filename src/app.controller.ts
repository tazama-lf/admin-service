// SPDX-License-Identifier: Apache-2.0

import { handleGetReportRequestByMsgId, handlePostConditionAccount, handlePostConditionEntity } from './logic.service';
import { type FastifyRequest, type FastifyReply } from 'fastify';
import { loggerService } from '.';
import { type AccountCondition, type EntityCondition } from '@frmscoe/frms-coe-lib/lib/interfaces';

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


export const POSTConditionHandlerEntity = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle saving entity condition request');

  try {
    const condition = req.body as EntityCondition;
    const data = await handlePostConditionEntity(condition);

    reply.status(200);
    reply.send(data);
  } catch (err) {
    reply.status(500);
    reply.send(err);
  } finally {
    loggerService.log('End - Handle saving entity condition request');
  }
};

export const POSTConditionHandlerAccount = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle saving account condition request');
  try {
    const condition = req.body as AccountCondition;
    const data = await handlePostConditionAccount(condition);

    reply.status(200);
    reply.send(data);
  } catch (err) {
    reply.status(500);
    reply.send(err);
  } finally {
    loggerService.log('End - Handle saving account condition request');
  }
};

const handleHealthCheck = async (): Promise<{ status: string }> => {
  return {
    status: 'UP',
  };
};

export { handleHealthCheck };
