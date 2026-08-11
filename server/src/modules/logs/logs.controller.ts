import { Request, Response, NextFunction } from 'express';
import { OperationType, AlarmType, AlarmLevel } from '@prisma/client';
import { logsService } from './logs.service';
import { getOperationActorContextFromRequest } from '../../lib/request-context';

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
    const roomNumber = req.query.roomNumber as string | undefined;
    const keyword = req.query.keyword as string | undefined;
    const startDate =
      (req.query.startDate as string | undefined) ??
      (req.query.start as string | undefined);
    const endDate =
      (req.query.endDate as string | undefined) ??
      (req.query.end as string | undefined);

    const result = await logsService.getOperationLogs({
      page,
      pageSize,
      type,
      userId,
      roomId,
      roomNumber,
      keyword,
      startDate,
      endDate,
    });

    res.json({
      ...result,
      list: result.items,
    });
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
    const roomNumber = req.query.roomNumber as string | undefined;
    const resolved = parseQueryBool(req.query.resolved as string | undefined);
    const startDate =
      (req.query.startDate as string | undefined) ??
      (req.query.start as string | undefined);
    const endDate =
      (req.query.endDate as string | undefined) ??
      (req.query.end as string | undefined);

    const result = await logsService.getAlarmLogs({
      page,
      pageSize,
      type,
      level,
      roomNumber,
      resolved,
      startDate,
      endDate,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const clearAlarmLogs = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const type = req.body?.type as AlarmType | undefined;
    const level = req.body?.level as AlarmLevel | undefined;
    const roomNumber = req.body?.roomNumber as string | undefined;
    const resolved =
      typeof req.body?.resolved === 'boolean' ? req.body.resolved : undefined;
    const startDate = req.body?.startDate as string | undefined;
    const endDate = req.body?.endDate as string | undefined;
    const operatorUserId = req.user!.id;

    const result = await logsService.clearAlarmLogs(
      {
        type,
        level,
        roomNumber,
        resolved,
        startDate,
        endDate,
      },
      operatorUserId,
      getOperationActorContextFromRequest(req),
    );

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
    const success = await logsService.resolveAlarm(
      id,
      operatorUserId,
      getOperationActorContextFromRequest(req),
    );
    res.json({ resolved: success });
  } catch (error) {
    next(error);
  }
};
