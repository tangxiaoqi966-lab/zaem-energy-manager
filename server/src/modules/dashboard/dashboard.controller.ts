import { Request, Response, NextFunction } from 'express';
import * as dashboardService from './dashboard.service';

export const getDashboardSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await dashboardService.getDashboardSummary();
    res.json(summary);
  } catch (err) {
    next(err);
  }
};
