import { PrismaClient, UserRole, RoomStatus } from '@prisma/client';
import { ROOM_NUMBERS } from '../../shared';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const adminRole = await prisma.role.upsert({
    where: { name: UserRole.admin },
    update: {},
    create: { name: UserRole.admin },
  });

  const bossRole = await prisma.role.upsert({
    where: { name: UserRole.boss },
    update: {},
    create: { name: UserRole.boss },
  });

  const userRole = await prisma.role.upsert({
    where: { name: UserRole.user },
    update: {},
    create: { name: UserRole.user },
  });

  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: adminPassword },
    create: {
      username: 'admin',
      passwordHash: adminPassword,
      name: '系统管理员',
      roleId: adminRole.id,
    },
  });

  const bossPassword = await bcrypt.hash('boss123', 10);
  await prisma.user.upsert({
    where: { username: 'boss' },
    update: { passwordHash: bossPassword },
    create: {
      username: 'boss',
      passwordHash: bossPassword,
      name: '老板',
      roleId: bossRole.id,
    },
  });

  const userPassword = await bcrypt.hash('user123', 10);
  await prisma.user.upsert({
    where: { username: 'user' },
    update: { passwordHash: userPassword },
    create: {
      username: 'user',
      passwordHash: userPassword,
      name: '普通用户',
      roleId: userRole.id,
    },
  });

  for (const roomNumber of ROOM_NUMBERS) {
    const floor = parseInt(roomNumber.charAt(0));
    await prisma.room.upsert({
      where: { roomNumber },
      update: {},
      create: {
        roomNumber,
        name: `${roomNumber}号房间`,
        floor,
        status: RoomStatus.normal,
        energyLimit: {
          create: { dailyLimit: 10, enabled: false },
        },
      },
    });
  }

  const defaultSettings = [
    { key: 'alarm_ratio_80', value: '80', description: '80%预警比例阈值' },
    { key: 'alarm_ratio_90', value: '90', description: '90%预警比例阈值' },
    { key: 'alarm_ratio_95', value: '95', description: '95%预警比例阈值' },
    { key: 'auto_cutoff', value: 'true', description: '是否启用自动断电' },
    { key: 'refresh_interval', value: '5000', description: '数据刷新间隔(毫秒)' },
    { key: 'daily_reset_hour', value: '0', description: '每日清零时间(小时 0-23)' },
    { key: 'price_per_kwh', value: '0.6', description: '电价(元/度)' },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSettings.upsert({
      where: { key: setting.key },
      update: { description: setting.description },
      create: setting,
    });
  }

  console.log('Database seeded successfully!');
  console.log('Default accounts:');
  console.log('  admin / admin123 (管理员)');
  console.log('  boss / boss123 (老板)');
  console.log('  user / user123 (普通用户)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
