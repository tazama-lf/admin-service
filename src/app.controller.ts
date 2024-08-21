// SPDX-License-Identifier: Apache-2.0

import {
  handleGetConditionsForEntity,
  handleGetReportRequestByMsgId,
  handlePostConditionEntity,
  handlePostConditionAccount,
} from './logic.service';
import { type FastifyRequest, type FastifyReply } from 'fastify';
import { loggerService } from '.';
import { type GetEntityConditions } from './interface/query';
import { type AccountCondition, type EntityCondition } from '@tazama-lf/frms-coe-lib/lib/interfaces';

export const reportRequestHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
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

export const postConditionHandlerEntity = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.log('Start - Handle report request');
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

export const postConditionHandlerAccount = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
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

export const handleHealthCheck = async (): Promise<{ status: string }> => {
  return {
    status: 'UP',
  };
};

export const getConditionHandler = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
  loggerService.trace('getting conditions for an entity');
  try {
    const data = await handleGetConditionsForEntity(req.query as GetEntityConditions);
    if (data) {
      reply.status(200);
      reply.send(data);
    } else {
      reply.status(404);
    }
  } catch (err) {
    reply.status(500);
  } finally {
    loggerService.trace('End - get condition for an entity');
  }
};
