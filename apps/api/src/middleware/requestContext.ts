import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';

export const requestContext = (req: Request, _res: Response, next: NextFunction) => {
  req.requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.tenantId = req.headers['x-tenant-id'] as string | undefined;
  next();
};
