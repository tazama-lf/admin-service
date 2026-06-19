// SPDX-License-Identifier: Apache-2.0

import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../src/services/txtp-mapping.logic.service', () => ({
  createTxtpMapping: jest.fn(),
  getTxtpMappings: jest.fn(),
  deleteTxtpMapping: jest.fn(),
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

import {
  upsertContextMappingHandler,
  getContextMappingHandler,
  deleteContextMappingHandler,
  upsertTriggerMappingHandler,
  getTriggerMappingHandler,
  deleteTriggerMappingHandler,
} from '../../src/app.controller';
import * as mappingService from '../../src/services/txtp-mapping.logic.service';
import { ErrorHandler } from '../../src/handlers/errorHandler';

const buildReply = (): Partial<FastifyReply> => ({
  status: jest.fn().mockReturnThis(),
  send: jest.fn(),
});

describe('Mapping API Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates context mappings and returns 201', async () => {
    (mappingService.createTxtpMapping as jest.Mock).mockResolvedValue([{ id: 1 }]);
    const req = {
      body: {
        primary_txtp_id: 209,
        related_txtp_id: 210,
        mapping: [{ primary: 'a', related: 'b' }],
      },
    } as unknown as FastifyRequest;
    const reply = buildReply();

    await upsertContextMappingHandler(req, reply as FastifyReply);

    expect(mappingService.createTxtpMapping).toHaveBeenCalledWith(req.body);
    expect(reply.status).toHaveBeenCalledWith(201);
    expect(reply.send).toHaveBeenCalledWith({ success: true, data: [{ id: 1 }] });
  });

  it('returns empty object with 200 when no context mapping exists', async () => {
    (mappingService.getTxtpMappings as jest.Mock).mockResolvedValue([]);
    const req = {
      params: { primaryTxtpId: '209', relatedTxtpId: '210' },
    } as unknown as FastifyRequest;
    const reply = buildReply();

    await getContextMappingHandler(req, reply as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({ success: true, data: {} });
  });

  it('returns context mappings with 200 when found', async () => {
    const data = [{ id: 1 }, { id: 2 }];
    (mappingService.getTxtpMappings as jest.Mock).mockResolvedValue(data);
    const req = {
      params: { primaryTxtpId: '209', relatedTxtpId: '210' },
    } as unknown as FastifyRequest;
    const reply = buildReply();

    await getContextMappingHandler(req, reply as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({ success: true, data });
  });

  it('returns 404 when deleting context mappings and none exist', async () => {
    (mappingService.deleteTxtpMapping as jest.Mock).mockResolvedValue(false);
    const req = {
      params: { primaryTxtpId: '209', relatedTxtpId: '210' },
    } as unknown as FastifyRequest;
    const reply = buildReply();

    await deleteContextMappingHandler(req, reply as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'Context mapping not found' });
  });

  it('creates trigger mappings and returns 201', async () => {
    (mappingService.createTxtpMapping as jest.Mock).mockResolvedValue([{ id: 11 }]);
    const req = {
      body: {
        primary_txtp_id: 209,
        related_txtp_id: 210,
        mapping: [{ primary: 'a', related: 'b' }],
      },
    } as unknown as FastifyRequest;
    const reply = buildReply();

    await upsertTriggerMappingHandler(req, reply as FastifyReply);

    expect(mappingService.createTxtpMapping).toHaveBeenCalledWith(req.body);
    expect(reply.status).toHaveBeenCalledWith(201);
    expect(reply.send).toHaveBeenCalledWith({ success: true, data: [{ id: 11 }] });
  });

  it('returns empty object with 200 when no trigger mapping exists', async () => {
    (mappingService.getTxtpMappings as jest.Mock).mockResolvedValue([]);
    const req = {
      params: { primaryTxtpId: '209', relatedTxtpId: '210' },
    } as unknown as FastifyRequest;
    const reply = buildReply();

    await getTriggerMappingHandler(req, reply as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({ success: true, data: {} });
  });

  it('returns trigger mappings with 200 when found', async () => {
    const data = [{ id: 21 }, { id: 22 }];
    (mappingService.getTxtpMappings as jest.Mock).mockResolvedValue(data);
    const req = {
      params: { primaryTxtpId: '209', relatedTxtpId: '210' },
    } as unknown as FastifyRequest;
    const reply = buildReply();

    await getTriggerMappingHandler(req, reply as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({ success: true, data });
  });

  it('delegates trigger mapping errors to ErrorHandler', async () => {
    const err = new Error('failed');
    (mappingService.getTxtpMappings as jest.Mock).mockRejectedValue(err);
    const req = {
      params: { primaryTxtpId: '209', relatedTxtpId: '210' },
    } as unknown as FastifyRequest;
    const reply = buildReply();

    await getTriggerMappingHandler(req, reply as FastifyReply);

    expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply, err, 'Failed to get trigger mapping');
  });

  it('returns 404 when deleting trigger mappings and none exist', async () => {
    (mappingService.deleteTxtpMapping as jest.Mock).mockResolvedValue(false);
    const req = {
      params: { primaryTxtpId: '209', relatedTxtpId: '210' },
    } as unknown as FastifyRequest;
    const reply = buildReply();

    await deleteTriggerMappingHandler(req, reply as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ success: false, message: 'Trigger mapping not found' });
  });
});
