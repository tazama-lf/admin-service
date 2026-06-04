// SPDX-License-Identifier: Apache-2.0

import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../src/services/faker-semantic-data.logic.service', () => ({
  getFakerSymmetricData: jest.fn(),
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

import { getFakerSymmetricDataHandler } from '../../src/app.controller';
import * as fakerSemanticService from '../../src/services/faker-semantic-data.logic.service';
import { ErrorHandler } from '../../src/handlers/errorHandler';

describe('Faker Semantic Data API Handler', () => {
  const buildReply = (): Partial<FastifyReply> => ({
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 with faker symmetric data list', async () => {
    const rows = [
      { id: 1, name: 'name' },
      { id: 2, name: 'address' },
    ];
    (fakerSemanticService.getFakerSymmetricData as jest.Mock).mockResolvedValue(rows);

    const req = {} as FastifyRequest;
    const reply = buildReply();

    await getFakerSymmetricDataHandler(req, reply as FastifyReply);

    expect(fakerSemanticService.getFakerSymmetricData).toHaveBeenCalledTimes(1);
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({ success: true, data: rows });
  });

  it('should return 200 with empty list', async () => {
    (fakerSemanticService.getFakerSymmetricData as jest.Mock).mockResolvedValue([]);

    const req = {} as FastifyRequest;
    const reply = buildReply();

    await getFakerSymmetricDataHandler(req, reply as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({ success: true, data: [] });
  });

  it('should delegate errors to ErrorHandler', async () => {
    const error = new Error('db failed');
    (fakerSemanticService.getFakerSymmetricData as jest.Mock).mockRejectedValue(error);

    const req = {} as FastifyRequest;
    const reply = buildReply();

    await getFakerSymmetricDataHandler(req, reply as FastifyReply);

    expect(ErrorHandler.sendError).toHaveBeenCalledWith(reply, error, 'Failed to get faker symmetric data');
  });
});
