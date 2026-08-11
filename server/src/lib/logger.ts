import { OperationType, AlarmType, AlarmLevel } from '@prisma/client';
import { prisma } from './prisma';
import {
  OperationDetailsPayload,
  serializeOperationDetails,
} from './operation-log';

export const writeOperation = async (
  userId: string | null,
  type: OperationType,
  roomId: string | null,
  details: string | OperationDetailsPayload,
  success: boolean = true
) => {
  return prisma.operationLog.create({
    data: {
      userId,
      type,
      roomId,
      details: serializeOperationDetails(details),
      success,
    },
  });
};

export const writeAlarm = async (
  type: AlarmType,
  level: AlarmLevel,
  roomId: string | null,
  message: string
) => {
  return prisma.alarmLog.create({
    data: {
      type,
      level,
      roomId,
      message,
    },
  });
};

export const resolveAlarm = async (id: string) => {
  return prisma.alarmLog.update({
    where: { id },
    data: {
      resolved: true,
      resolvedAt: new Date(),
    },
  });
};
