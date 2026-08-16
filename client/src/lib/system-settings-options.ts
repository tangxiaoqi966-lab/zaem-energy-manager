import { UserRole } from '../types';

export const REFRESH_INTERVAL_OPTIONS = [
  { label: '5 秒', value: 5000 },
  { label: '10 秒', value: 10000 },
  { label: '15 秒', value: 15000 },
  { label: '30 秒', value: 30000 },
] as const;

export const HOUR_OPTIONS: ReadonlyArray<{ label: string; value: number }> = Array.from(
  { length: 24 },
  (_, i) => ({
    label: `${i.toString().padStart(2, '0')}:00`,
    value: i,
  }),
);

export const TIMEZONE_OPTIONS = [
  { label: '欧洲/维也纳', value: 'Europe/Vienna' },
  { label: '欧洲/柏林', value: 'Europe/Berlin' },
  { label: '中国/上海', value: 'Asia/Shanghai' },
] as const;

export const ROLE_OPTIONS: ReadonlyArray<{
  label: string;
  value: UserRole;
}> = [
  { label: '超级管理员', value: UserRole.ADMIN },
  { label: '管理员', value: UserRole.BOSS },
  { label: '用户', value: UserRole.USER },
];

export const DEVICE_PROVIDER_OPTIONS = [
  { label: '米家', value: 'xiaomi' },
  { label: '涂鸦', value: 'tuya' },
] as const;

export const API_SYNC_OPTIONS = [
  { label: '涂鸦云', value: 'tuya_cloud' },
  { label: '阿里云 IoT', value: 'aliyun_iot' },
  { label: '华为云 IoT', value: 'huawei_iot' },
  { label: '腾讯云 IoT', value: 'tencent_iot' },
  { label: '其他云厂商', value: 'other_cloud' },
] as const;

export const LAN_DISCOVERY_OPTIONS = [
  { label: '局域网扫描', value: 'miot_lan' },
] as const;

export const LAN_DISCOVERY_GUIDE = {
  miot_lan: {
    fieldLabel: '扫描网段',
    placeholder: '可填一个或多个网段，例如 192.168.41.0/24,192.168.8.0/24',
    helper:
      '最简单填法：先看你电脑现在的 IPv4（如 192.168.41.168），把最后一段改成 0，再补 /24。\n现在已经是后端真实扫描；如果现场不止一个号段，可以用英文逗号把多个网段一起填进去。',
    emptyError: '请先填写扫描网段',
    status: (value: string) => `准备扫描 ${value}，支持用逗号一次扫多个网段`,
    title: '局域网扫描说明',
    steps: [
      '先确认本机和目标设备在同一个局域网，比如都连在同一个路由器下面。',
      '看你自己电脑的 IP 是多少，然后把最后一个数字改成 0 就行。比如电脑 IP 是 192.168.1.23，就填 192.168.1.0/24；如果电脑 IP 是 192.168.41.168，就填 192.168.41.0/24；如果电脑 IP 是 10.0.0.55，就填 10.0.0.0/24。',
      '如果你现场不止一个号段，可以直接一起填，多个网段用英文逗号隔开，例如 192.168.41.0/24, 192.168.8.0/24。',
      '这里的 0 不是说只扫到 0，也不是 0 到 24。这个 0 只是表示"这一整段地址的起点写法"，真正扫描时看的是整段。',
      '这里的 /24 也不是 24 个号段。你可以把它先简单理解成：前面三段固定，只扫描最后一段。比如 192.168.41.0/24，实际通常会去看 192.168.41.1 到 192.168.41.254 这一整段。',
      '如果你不懂网络，先不要改 /24。大多数普通家用网络，按上面这个规则填就够了。',
      '【重要说明】本页面现在已经切换为后端真实扫描：前端只负责填网段 + 展示结果，真正的 ping 扫网段 / 读 ARP 表 / MAC OUI 查厂商 这些动作全部由后端服务器执行。如果服务器和你要扫的设备不在同一网段 / 跨 VLAN / 跨路由器，会扫不到部分设备（这是物理网络拓扑限制，不是软件 bug）。',
      '【主路由器 / 信号放大器（AP）/ 4G 流量卡路由器（CPE）怎么区分】真实后端扫描时会用这几个特征综合判断：1）谁是当前网段的默认网关（.1 或你 DHCP 里拿到的网关 IP）基本就是主路由器；2）SSDP/LLDP/设备管理端口（80/443 打开是管理后台）返回品牌判断；3）MAC OUI 查厂商，比如"CMCC/FiberHome/华为带移动光猫特征；4）流量卡 CPE 常见 OUI 一般是华为/中兴/烽火移动系；5）信号放大器（AP/中继）在 ARP 表里一般没有独立 IP 或和主路由在同一网段，但管理 IP 通常是.2 .3 .4 这种；6）如果你的 4G 流量卡路由器是单独拉出来另一个号段（比如它自己当主路由发 192.168.8.x，主路由又是 192.168.1.x），现在可以直接在输入框写成 192.168.1.0/24,192.168.8.0/24 一次合并扫描。',
      '【你感觉识别的不对怎么办】真实扫描分两种情况：1）设备没开机/没接网线/WiFi 休眠了，ARP 表里没有它，所以扫不到，正常；2）设备跨 VLAN / 跨网段 / 在另一个路由器下，当前扫不到，需要后端扫描器所在的机器同时接两个号段（或者开路由可达）；3）你有移动流量卡路由器当备用网络的时候，要确认它是"AP 模式"（和主路由同号段）还是"路由模式"（自己发号段），两种模式扫出来是两个完全不同的清单。',
      '填好之后点"开始识别"，后端会并发 ping 该网段 254 个 IP 并读取系统 ARP 表 + MAC OUI 厂商表返回真实结果（Windows 上 arp -a，Linux 上 ip neigh show）。',
    ],
  },
} as const;

export function getRoleLabel(role: UserRole) {
  return ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}

export const XIAOMI_VERIFICATION_STORAGE_KEY = 'xiaomi_verification_pending' as const;

export function readXiaomiVerificationPending(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.sessionStorage.getItem(XIAOMI_VERIFICATION_STORAGE_KEY) === '1'
  );
}

export function writeXiaomiVerificationPending(pending: boolean) {
  if (typeof window === 'undefined') return;
  if (pending) {
    window.sessionStorage.setItem(XIAOMI_VERIFICATION_STORAGE_KEY, '1');
  } else {
    window.sessionStorage.removeItem(XIAOMI_VERIFICATION_STORAGE_KEY);
  }
}
