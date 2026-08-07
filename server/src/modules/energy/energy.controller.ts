import { Request, Response, NextFunction } from 'express';
import * as energyService from './energy.service';

export const getRooms = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rooms = await energyService.getRooms();
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
    const { dailyLimit, enabled } = req.body;
    const operatorUserId = req.user!.id;
    const limit = await energyService.updateEnergyLimit(roomId, dailyLimit, operatorUserId, enabled);
    res.json(limit);
  } catch (err) {
    next(err);
  }
};

export const getLimits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limits = await energyService.getEnergyLimits();
    res.json(limits);
  } catch (err) {
    next(err);
  }
};

export const bulkToggleLimits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { enabled } = req.body as { enabled?: boolean };
    const operatorUserId = req.user!.id;
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ code: 'INVALID_ENABLED', message: 'enabled 必须是布尔值' });
      return;
    }
    const result = await energyService.bulkUpdateLimitEnabled(enabled, operatorUserId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const cutoff = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId } = req.params;
    const operatorUserId = req.user!.id;
    const result = await energyService.cutoffPower(roomId, operatorUserId, false);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const restore = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId } = req.params;
    const operatorUserId = req.user!.id;
    const result = await energyService.restorePower(roomId, operatorUserId, false);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const ranking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 14;
    const result = await energyService.getMonthlyRanking(limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
