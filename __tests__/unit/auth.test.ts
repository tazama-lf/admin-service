// SPDX-License-Identifier: Apache-2.0
import { tenantAwareTokenHandler } from '../../src/auth/authHandler';
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

// Mock the auth-lib validateTokenAndClaims function
jest.mock('@tazama-lf/auth-lib', () => ({
  validateTokenAndClaims: jest.fn(() => ({})),
}));

describe('tenantAwareTokenHandler', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up the mock for validateTokenAndClaims to return a valid object
    const { validateTokenAndClaims } = require('@tazama-lf/auth-lib');
    (validateTokenAndClaims as jest.Mock).mockReturnValue({});

    mockRequest = {
      headers: {},
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
  });

  it('should extract tenant ID from JWT token TENANT_ID claim correctly', async () => {
    // Create a mock JWT token with TENANT_ID claim
    const payload = {
      TENANT_ID: 'tenant123',
      sub: 'user123',
      iat: Date.now(),
    };

    // Create a mock JWT token: header.payload.signature
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = 'mock-signature';
    const mockToken = `${header}.${encodedPayload}.${signature}`;

    mockRequest.headers = {
      authorization: `Bearer ${mockToken}`,
    };

    await tenantAwareTokenHandler()(mockRequest as FastifyRequest, mockReply as FastifyReply);

    // Verify that tenant ID was extracted and set on request
    expect((mockRequest as any).tenantId).toBe('tenant123');
    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should extract tenant ID from legacy tenantId field correctly', async () => {
    // Create a mock JWT token with legacy tenantId field
    const payload = {
      tenantId: 'tenant123',
      sub: 'user123',
      iat: Date.now(),
    };

    // Create a mock JWT token: header.payload.signature
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = 'mock-signature';
    const mockToken = `${header}.${encodedPayload}.${signature}`;

    mockRequest.headers = {
      authorization: `Bearer ${mockToken}`,
    };

    await tenantAwareTokenHandler()(mockRequest as FastifyRequest, mockReply as FastifyReply);

    // Verify that tenant ID was extracted and set on request
    expect((mockRequest as any).tenantId).toBe('tenant123');
    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should reject token with missing TENANT_ID claim and tenantId field', async () => {
    // Create a mock JWT token without TENANT_ID claim or tenantId field
    const payload = {
      sub: 'user123',
      iat: Date.now(),
    };

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = 'mock-signature';
    const mockToken = `${header}.${encodedPayload}.${signature}`;

    mockRequest.headers = {
      authorization: `Bearer ${mockToken}`,
    };

    await tenantAwareTokenHandler()(mockRequest as FastifyRequest, mockReply as FastifyReply);

    // Verify that request was rejected
    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: Tenant ID required' });
  });

  it('should reject token with empty TENANT_ID claim', async () => {
    // Create a mock JWT token with empty TENANT_ID claim
    const payload = {
      TENANT_ID: '',
      sub: 'user123',
      iat: Date.now(),
    };

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = 'mock-signature';
    const mockToken = `${header}.${encodedPayload}.${signature}`;

    mockRequest.headers = {
      authorization: `Bearer ${mockToken}`,
    };

    await tenantAwareTokenHandler()(mockRequest as FastifyRequest, mockReply as FastifyReply);

    // Verify that request was rejected
    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: Tenant ID required' });
  });

  it('should reject malformed JWT token', async () => {
    const malformedToken = 'not.a.valid.jwt.token';

    mockRequest.headers = {
      authorization: `Bearer ${malformedToken}`,
    };

    await tenantAwareTokenHandler()(mockRequest as FastifyRequest, mockReply as FastifyReply);

    // Verify that request was rejected due to malformed token
    expect(mockReply.code).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden: Tenant ID required' });
  });

  it('should use DEFAULT tenant when authentication is disabled', async () => {
    // Mock the configuration module to return AUTHENTICATED as false
    const { configuration } = require('../../src');
    const originalAuthenticated = configuration.AUTHENTICATED;
    configuration.AUTHENTICATED = false;

    await tenantAwareTokenHandler()(mockRequest as FastifyRequest, mockReply as FastifyReply);

    // Verify that DEFAULT tenant was used
    expect((mockRequest as any).tenantId).toBe('DEFAULT');
    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();

    // Restore the original value
    configuration.AUTHENTICATED = originalAuthenticated;
  });
});
