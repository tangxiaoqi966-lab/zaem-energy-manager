import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      ...(err.details !== undefined && { details: err.details }),
    });
  }

  console.error('[errorHandler] unexpected error:', err?.stack || err);

  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: '服务器内部错误',
  });
};

export const notFound = (_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(404, 'NOT_FOUND', '资源未找到'));
};
