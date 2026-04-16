import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

type ValidationSchemas = {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
};

export const validateRequest = (schemas: ValidationSchemas) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }

      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }

      next();
    } catch (error: any) {
      res.status(400).json({
        message: 'Validation failed',
        issues: error?.issues || error?.message,
      });
    }
  };
};
