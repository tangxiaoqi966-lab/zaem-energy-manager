import { Request, Response, NextFunction } from 'express';
import { OperationType, AlarmType, AlarmLevel } from '@prisma/client';
import { logsService } from './logs.service';

function parseQueryInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseQueryBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === 'true';
}

export const getOperationLogs = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const page = parseQueryInt(req.query.page as string | undefined, 1);
    const pageSize = parseQueryInt(req.query.pageSize as string | undefined, 20);
    const type = req.query.type as OperationType | undefined;
    const userId = req.query.userId as string | undefined;
    const roomId = req.query.roomId as string | undefined;
    const startDate = req.query.start as string | undefined;
    const endDate = req.query.end as string | undefined;

    const result = await logsService.getOperationLogs({
      page,
      pageSize,
      type,
      userId,
      roomId,
      startDate,
      endDate,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getAlarmLogs = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const page = parseQueryInt(req.query.page as string | undefined, 1);
    const pageSize = parseQueryInt(req.query.pageSize as string | undefined, 20);
    const type = req.query.type as AlarmType | undefined;
    const level = req.query.level as AlarmLevel | undefined;
    const roomId = req.query.roomId as string | undefined;
    const resolved = parseQueryBool(req.query.resolved as string | undefined);
    const startDate = req.query.start as string | undefined;
    const endDate = req.query.end as string | undefined;

    const result = await logsService.getAlarmLogs({
      page,
      pageSize,
      type,
      level,
      roomId,
      resolved,
      startDate,
      endDate,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const resolveAlarm = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const operatorUserId = req.user!.id;
    const success = await logsService.resolveAlarm(id, operatorUserId);
    res.json({ resolved: success });
  } catch (error) {
    next(error);
  }
};
