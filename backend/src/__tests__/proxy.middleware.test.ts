import type { Request, Response, NextFunction } from 'express';
import { requireProxy } from '../middleware/proxy.middleware';

jest.mock('../config', () => ({
  config: { proxySharedSecret: 'proxy-secret-for-test', isProduction: true },
}));

describe('requireProxy', () => {
  const response = () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    return res;
  };

  it('accepts requests carrying the configured proxy secret', () => {
    const req = { method: 'GET', originalUrl: '/api/v1/files', get: jest.fn().mockReturnValue('proxy-secret-for-test') } as unknown as Request;
    const res = response();
    const next = jest.fn() as NextFunction;

    requireProxy(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('accepts valid API-key-authenticated direct API requests without a proxy secret', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/uploads/initiate',
      apiKeyUserId: 'user-1',
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as Request;
    const res = response();
    const next = jest.fn() as NextFunction;

    requireProxy(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/uploads/file-id',
    '/api/v1/uploads/session-id/chunks/0',
  ])('allows only token-guarded upload PUT path %s past the proxy gate', (originalUrl) => {
    const req = { method: 'PUT', originalUrl, get: jest.fn().mockReturnValue(undefined) } as unknown as Request;
    const res = response();
    const next = jest.fn() as NextFunction;

    requireProxy(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('still requires the proxy for non-transfer upload operations', () => {
    const req = { method: 'POST', originalUrl: '/api/v1/uploads', get: jest.fn().mockReturnValue(undefined) } as unknown as Request;
    const res = response();
    const next = jest.fn() as NextFunction;

    requireProxy(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([undefined, 'incorrect-secret'])('rejects an absent or invalid proxy secret', (secret) => {
    const req = { method: 'GET', originalUrl: '/api/v1/files', get: jest.fn().mockReturnValue(secret) } as unknown as Request;
    const res = response();
    const next = jest.fn() as NextFunction;

    requireProxy(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'PROXY_REQUIRED', message: 'This API is available through the application proxy only' },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
