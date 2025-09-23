// SPDX-License-Identifier: Apache-2.0
import { validateTenantMiddleware } from '../../src/middleware/tenantMiddleware';
import type { FastifyRequest, FastifyReply } from 'fastify';

// Mock logger and configuration
jest.mock('../../src', () => ({
  loggerService: {
    debug: jest.fn(),
    error: jest.fn(),
  },
  configuration: {
    AUTHENTICATED: true,
  },
}));

// Mock the auth-lib functions
const extractTenantMock = jest.fn();
jest.mock('@tazama-lf/auth-lib', () => ({
  validateTokenAndClaims: jest.fn(() => ({})),
  extractTenant: (...args: any[]) => extractTenantMock(...args),
}));

describe('validateTenantMiddleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      headers: {},
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
  });

  it('should extract tenant ID from JWT token correctly', async () => {
    // Mock extractTenant to return a valid tenantId
    extractTenantMock.mockReturnValueOnce({ success: true, tenantId: 'tenant123' });
    mockRequest.headers = {
      authorization: 'Bearer sometoken',
    };

    await validateTenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
    // Debug log
    // eslint-disable-next-line no-console
    console.log('Request after middleware:', mockRequest);
    expect(Object.prototype.hasOwnProperty.call(mockRequest, 'tenantId')).toBe(true);
    expect((mockRequest as any).tenantId).toBe('tenant123');
    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should reject invalid token', async () => {
    mockRequest.headers = {
      authorization: `Bearer invalid.token`,
    };

    await validateTenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('should reject token with empty tenant ID', async () => {
    // Create a JWT token with empty tenantId
    const payload = { tenantId: '', sub: 'user123' };
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const mockToken = `header.${base64Payload}.signature`;

    mockRequest.headers = {
      authorization: `Bearer ${mockToken}`,
    };

    await validateTenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('should reject request without authorization header', async () => {
    mockRequest.headers = {};

    await validateTenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(mockReply.code).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });
});
