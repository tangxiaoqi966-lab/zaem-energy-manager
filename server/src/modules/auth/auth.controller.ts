import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';
import { getOperationActorContextFromRequest } from '../../lib/request-context';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.login(req.body, getOperationActorContextFromRequest(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user) {
      await authService.logout(req.user.id, getOperationActorContextFromRequest(req));
    }
    res.json({ message: '退出成功' });
  } catch (err) {
    next(err);
  }
};

export const getCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new Error('未登录');
    }
    const user = await authService.getCurrentUser(req.user.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
};
