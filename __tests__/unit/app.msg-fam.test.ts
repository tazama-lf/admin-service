// SPDX-License-Identifier: Apache-2.0

import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../src/services/tcs-config.logic.service', () => ({
  handleGetConfigsByMsgFam: jest.fn(),
}));

jest.mock('../../src/handlers/errorHandler', () => ({
  ErrorHandler: {
    sendError: jest.fn(),
  },
}));

jest.mock('../../src', () => ({
  configuration: {},
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

import { getConfigsByMsgFamHandler } from '../../src/app.controller';
import { handleGetConfigsByMsgFam } from '../../src/services/tcs-config.logic.service';
import { ErrorHandler } from '../../src/handlers/errorHandler';

const buildReply = (): Partial<FastifyReply> => ({
  code: jest.fn().mockReturnThis(),
  send: jest.fn(),
});

const buildRequest = (body: unknown): FastifyRequest =>
  ({
    body,
    tenantId: 'tenant-123',
  }) as unknown as FastifyRequest;

describe('getConfigsByMsgFamHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when the request body is absent', async () => {
    const req = buildRequest(undefined);
    const reply = buildReply();

    await getConfigsByMsgFamHandler(req, reply as FastifyReply);

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'msgFam is required in the request body' });
    expect(handleGetConfigsByMsgFam).not.toHaveBeenCalled();
  });

  it('returns 400 when msgFam is missing', async () => {
    const req = buildRequest({ limit: 10, offset: 0 });
    const reply = buildReply();

    await getConfigsByMsgFamHandler(req, reply as FastifyReply);

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'msgFam is required in the request body' });
    expect(handleGetConfigsByMsgFam).not.toHaveBeenCalled();
  });

  it.each([null, 0, 101, 1.5, -1])('returns 400 when limit is invalid (%p)', async (limit) => {
    const req = buildRequest({ msgFam: 'pain', limit });
    const reply = buildReply();

    await getConfigsByMsgFamHandler(req, reply as FastifyReply);

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'limit must be an integer between 1 and 100' });
    expect(handleGetConfigsByMsgFam).not.toHaveBeenCalled();
  });

  it.each([null, -1, 1.5])('returns 400 when offset is invalid (%p)', async (offset) => {
    const req = buildRequest({ msgFam: 'pain', offset });
    const reply = buildReply();

    await getConfigsByMsgFamHandler(req, reply as FastifyReply);

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'offset must be a non-negative integer' });
    expect(handleGetConfigsByMsgFam).not.toHaveBeenCalled();
  });

  it('returns 200 with paginated results on the happy path', async () => {
    (handleGetConfigsByMsgFam as jest.Mock).mockResolvedValue({
      data: ['/api/pain001', '/api/pacs008'],
      total: 2,
      limit: 10,
      offset: 0,
    });
    const req = buildRequest({ msgFam: 'pain', limit: 10, offset: 0 });
    const reply = buildReply();

    await getConfigsByMsgFamHandler(req, reply as FastifyReply);

    expect(handleGetConfigsByMsgFam).toHaveBeenCalledWith('pain', 'tenant-123', 10, 0, undefined);
    expect(reply.code).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({
      success: true,
      data: ['/api/pain001', '/api/pacs008'],
      total: 2,
      limit: 10,
      offset: 0,
      pages: 1,
    });
  });

  it('defaults limit and offset when not provided', async () => {
    (handleGetConfigsByMsgFam as jest.Mock).mockResolvedValue({
      data: [],
      total: 0,
      limit: 10,
      offset: 0,
    });
    const req = buildRequest({ msgFam: 'pain' });
    const reply = buildReply();

    await getConfigsByMsgFamHandler(req, reply as FastifyReply);

    expect(handleGetConfigsByMsgFam).toHaveBeenCalledWith('pain', 'tenant-123', 10, 0, undefined);
    expect(reply.code).toHaveBeenCalledWith(200);
  });

  it('passes transactionType through when provided', async () => {
    (handleGetConfigsByMsgFam as jest.Mock).mockResolvedValue({
      data: ['/api/pain001'],
      total: 1,
      limit: 10,
      offset: 0,
    });
    const req = buildRequest({ msgFam: 'pain', transactionType: 'pain.001' });
    const reply = buildReply();

    await getConfigsByMsgFamHandler(req, reply as FastifyReply);

    expect(handleGetConfigsByMsgFam).toHaveBeenCalledWith('pain', 'tenant-123', 10, 0, 'pain.001');
  });

  it('delegates to ErrorHandler when the service throws', async () => {
    const error = new Error('boom');
    (handleGetConfigsByMsgFam as jest.Mock).mockRejectedValue(error);
    const req = buildRequest({ msgFam: 'pain' });
    const reply = buildReply();

    await getConfigsByMsgFamHandler(req, reply as FastifyReply);

    expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply, error, 'Failed to get configs by msg_fam');
  });
});
