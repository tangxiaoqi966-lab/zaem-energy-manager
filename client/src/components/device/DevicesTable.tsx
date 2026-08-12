import { useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { toast } from 'sonner';
import { Cpu, Pencil, Power, PowerOff } from 'lucide-react';
import * as api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { UserRole, DeviceStatus as DS } from '@/types';
import type { DeviceItem, DeviceStatus } from '@/types';
import { ValueWithUnit } from '../ui/value-with-unit';

const statusVariant: Record<DeviceStatus, 'success' | 'danger' | 'default'> = {
  [DS.ONLINE]: 'success',
  [DS.OFFLINE]: 'danger',
  [DS.UNKNOWN]: 'default',
};

const statusText: Record<DeviceStatus, string> = {
  [DS.ONLINE]: '在线',
  [DS.OFFLINE]: '离线',
  [DS.UNKNOWN]: '未知',
};

interface DevicesTableProps {
  devices: DeviceItem[];
  invalidateOnChange?: () => Promise<void> | void;
  compact?: boolean;
}

const powerFormatter = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const numberFormatter2 = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPower(value: number) {
  return (
    <ValueWithUnit
      value={powerFormatter.format(value)}
      unit="W"
      valueClassName="font-mono font-semibold"
    />
  );
}

function formatEnergy(value: number) {
  return (
    <ValueWithUnit
      value={numberFormatter2.format(value)}
      unit="kWh"
      valueClassName="font-mono font-semibold"
    />
  );
}

export function DevicesTable({ devices, invalidateOnChange, compact = false }: DevicesTableProps) {
  const role = useAuthStore((s) => s.role);
  const canControl = role === UserRole.ADMIN || role === UserRole.BOSS;
  const canRename = canControl;
  const [editingDid, setEditingDid] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const onControl = async (d: DeviceItem, action: 'on' | 'off') => {
    if (!canControl) {
      toast.error('当前用户没有设备操作权限');
      return;
    }
    try {
      await api.system.controlDevice(d.did, action);
      toast.success(action === 'on' ? '设备已开启' : '设备已关闭');
      if (invalidateOnChange) await invalidateOnChange();
    } catch (e) {
      toast.error(action === 'on' ? '开启设备失败' : '关闭设备失败');
    }
  };

  const startRename = (device: DeviceItem) => {
    setEditingDid(device.did);
    setDraftName(device.name);
  };

  const cancelRename = () => {
    setEditingDid(null);
    setDraftName('');
  };

  const submitRename = async (device: DeviceItem) => {
    const nextName = draftName.trim();
    if (!nextName) {
      toast.error('名称不能为空');
      return;
    }

    try {
      setSavingName(true);
      await api.system.renameDevice(device.did, nextName);
      toast.success('名称已更新');
      cancelRename();
      if (invalidateOnChange) await invalidateOnChange();
    } catch {
      toast.error('修改名称失败');
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div>
      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm gap-2">
          <Cpu className="w-8 h-8 opacity-40" />
          <div>暂无设备数据，请到 系统设置 → 米家同步 → 立即同步米家设备</div>
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {devices.map((d) => (
              <div key={d.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {editingDid === d.did ? (
                      <div className="space-y-2">
                        <Input
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          className="h-8"
                          placeholder="输入设备名称"
                          disabled={savingName}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-8 flex-1 text-xs"
                            onClick={() => submitRename(d)}
                            disabled={savingName}
                          >
                            保存
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 flex-1 text-xs"
                            onClick={cancelRename}
                            disabled={savingName}
                          >
                            取消
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{d.name}</span>
                        {canRename && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            onClick={() => startRename(d)}
                            title="修改设备名称"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">{d.model}</div>
                  </div>
                  <Badge variant={statusVariant[d.status]}>{statusText[d.status]}</Badge>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="text-xs text-muted-foreground">实时功率</div>
                    <div className="mt-1 font-mono">{d.powerW != null ? formatPower(d.powerW) : '-'}</div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="text-xs text-muted-foreground">累计电量</div>
                    <div className="mt-1 font-mono">{d.totalKwh != null ? formatEnergy(d.totalKwh) : '-'}</div>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <div className="truncate" title={d.did}>DID：{d.did}</div>
                  <div>默认独立空间</div>
                </div>

                {canControl && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={d.status !== 'online'}
                      onClick={() => onControl(d, 'on')}
                      className="h-9 gap-1 text-xs"
                    >
                      <Power className="w-3.5 h-3.5 text-green-600" /> 开启
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={d.status !== 'online'}
                      onClick={() => onControl(d, 'off')}
                      className="h-9 gap-1 text-xs"
                    >
                      <PowerOff className="w-3.5 h-3.5 text-red-600" /> 关闭
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={compact ? 'hidden md:block' : 'hidden rounded-md border md:block'}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>空间名称</TableHead>
                  <TableHead>空间类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>型号</TableHead>
                  <TableHead>DID</TableHead>
                  <TableHead className="text-right">实时功率</TableHead>
                  <TableHead className="text-right">累计电量</TableHead>
                  {canControl && <TableHead className="text-right">操作</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {editingDid === d.did ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            className="h-8 max-w-[220px]"
                          placeholder="输入设备名称"
                            disabled={savingName}
                          />
                          <Button
                            size="sm"
                            variant="default"
                            className="h-8 px-3 text-xs"
                            onClick={() => submitRename(d)}
                            disabled={savingName}
                          >
                            保存
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3 text-xs"
                            onClick={cancelRename}
                            disabled={savingName}
                          >
                            取消
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{d.name}</span>
                          {canRename && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => startRename(d)}
                              title="修改设备名称"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div>{d.name}</div>
                        <div className="text-xs text-muted-foreground">默认独立空间</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[d.status]}>{statusText[d.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.model}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[180px] truncate" title={d.did}>{d.did}</TableCell>
                    <TableCell className="text-right font-mono">{d.powerW != null ? formatPower(d.powerW) : '-'}</TableCell>
                    <TableCell className="text-right font-mono">{d.totalKwh != null ? formatEnergy(d.totalKwh) : '-'}</TableCell>
                    {canControl && (
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1.5 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={d.status !== 'online'}
                            onClick={() => onControl(d, 'on')}
                            className="h-8 gap-1 px-2 text-xs"
                          >
                            <Power className="w-3.5 h-3.5 text-green-600" /> 开启
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={d.status !== 'online'}
                            onClick={() => onControl(d, 'off')}
                            className="h-8 gap-1 px-2 text-xs"
                          >
                            <PowerOff className="w-3.5 h-3.5 text-red-600" /> 关闭
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

export default DevicesTable;
