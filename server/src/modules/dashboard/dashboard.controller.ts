import { Request, Response, NextFunction } from 'express';
import * as dashboardService from './dashboard.service';

export const getDashboardSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const siteId =
      typeof req.query.siteId === 'string' && req.query.siteId.trim()
        ? req.query.siteId.trim()
        : undefined;
    const summary = await dashboardService.getDashboardSummary(siteId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
};

export const getNetworkHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const siteId =
      typeof req.query.siteId === 'string' && req.query.siteId.trim()
        ? req.query.siteId.trim()
        : undefined;
    const result = await dashboardService.getNetworkHistory(siteId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
