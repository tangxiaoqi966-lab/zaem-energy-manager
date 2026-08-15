import { Request, Response, NextFunction } from 'express';
import * as energyService from './energy.service';
import { getOperationActorContextFromRequest } from '../../lib/request-context';

export const getRooms = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const siteId =
      typeof req.query.siteId === 'string' && req.query.siteId.trim()
        ? req.query.siteId.trim()
        : undefined;
    const rooms = await energyService.getRooms(siteId);
    res.json(rooms);
  } catch (err) {
    next(err);
  }
};

export const getRoomDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId } = req.params;
    const detail = await energyService.getRoomDetail(roomId);
    res.json(detail);
  } catch (err) {
    next(err);
  }
};

export const updateLimit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId } = req.params;
    const { dailyLimit, enabled, monthlyCostLimit, costEnabled } = req.body;
    const operatorUserId = req.user!.id;
    if (typeof dailyLimit !== 'number' || Number.isNaN(dailyLimit) || dailyLimit < 0) {
      res.status(400).json({ code: 'INVALID_LIMIT', message: 'dailyLimit 必须是非负数字' });
      return;
    }
    if (
      monthlyCostLimit !== undefined &&
      (typeof monthlyCostLimit !== 'number' || Number.isNaN(monthlyCostLimit) || monthlyCostLimit < 0)
    ) {
      res.status(400).json({ code: 'INVALID_COST_LIMIT', message: 'monthlyCostLimit 必须是非负数字' });
      return;
    }
    const limit = await energyService.updateEnergyLimit(
      roomId,
      dailyLimit,
      operatorUserId,
      enabled,
      monthlyCostLimit,
      costEnabled,
      getOperationActorContextFromRequest(req),
    );
    res.json(limit);
  } catch (err) {
    next(err);
  }
};

export const getLimits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const siteId =
      typeof req.query.siteId === 'string' && req.query.siteId.trim()
        ? req.query.siteId.trim()
        : undefined;
    const limits = await energyService.getEnergyLimits(siteId);
    res.json(limits);
  } catch (err) {
    next(err);
  }
};

export const bulkToggleLimits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { enabled } = req.body as { enabled?: boolean };
    const siteId =
      typeof req.body?.siteId === 'string' && req.body.siteId.trim()
        ? req.body.siteId.trim()
        : undefined;
    const operatorUserId = req.user!.id;
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ code: 'INVALID_ENABLED', message: 'enabled 必须是布尔值' });
      return;
    }
    const result = await energyService.bulkUpdateLimitEnabled(
      enabled,
      operatorUserId,
      getOperationActorContextFromRequest(req),
      siteId,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const bulkUpdateLimits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dailyLimit } = req.body as { dailyLimit?: number };
    const siteId =
      typeof req.body?.siteId === 'string' && req.body.siteId.trim()
        ? req.body.siteId.trim()
        : undefined;
    const operatorUserId = req.user!.id;
    if (typeof dailyLimit !== 'number' || Number.isNaN(dailyLimit) || dailyLimit < 0) {
      res.status(400).json({ code: 'INVALID_LIMIT', message: 'dailyLimit 必须是非负数字' });
      return;
    }
    const result = await energyService.bulkUpdateDailyLimit(
      dailyLimit,
      operatorUserId,
      getOperationActorContextFromRequest(req),
      siteId,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const cutoff = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId } = req.params;
    const operatorUserId = req.user!.id;
    const result = await energyService.cutoffPower(
      roomId,
      operatorUserId,
      false,
      getOperationActorContextFromRequest(req),
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const restore = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId } = req.params;
    const operatorUserId = req.user!.id;
    const result = await energyService.restorePower(
      roomId,
      operatorUserId,
      false,
      getOperationActorContextFromRequest(req),
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const ranking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 14;
    const siteId =
      typeof req.query.siteId === 'string' && req.query.siteId.trim()
        ? req.query.siteId.trim()
        : undefined;
    const result = await energyService.getMonthlyRanking(limit, siteId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
