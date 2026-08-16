import { type SystemSettingsData } from '../../types';
import { REFRESH_INTERVAL_OPTIONS, TIMEZONE_OPTIONS, HOUR_OPTIONS } from '../../lib/system-settings-options';
import { formatShortDateTime } from '../../lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Badge } from '../ui/badge';
import { RefreshCw, Save } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SettingsParamsValueBag {
  getValue: <K extends keyof SystemSettingsData>(key: K, fallback?: SystemSettingsData[K]) => SystemSettingsData[K] | undefined;
  getPercentValue: (key: 'alarmRatio80' | 'alarmRatio90' | 'alarmRatio95', fallbackRatio: number) => string | number | '';
  setValue: <K extends keyof SystemSettingsData>(key: K, value: SystemSettingsData[K]) => void;
}

export interface SettingsParamsCallbacks {
  canEdit: boolean;
  saving: boolean;
  bulkLimitSaving: boolean;
  formatDateTimeShort: (value: string | undefined) => string;
  onSave: () => void;
  onApplyDefaultDailyLimit: () => void;
  onRefreshReferencePrice: () => void;
}

export interface SettingsParamsProps extends SettingsParamsValueBag, SettingsParamsCallbacks {}

export function SettingsParamsTab(props: SettingsParamsProps) {
  const {
    getValue,
    getPercentValue,
    setValue,
    canEdit,
    saving,
    bulkLimitSaving,
    formatDateTimeShort,
    onSave,
    onApplyDefaultDailyLimit,
    onRefreshReferencePrice,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">系统参数配置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="refreshInterval">前端刷新间隔</Label>
            <Select
              value={String(getValue('refreshInterval', 5000) ?? 5000)}
              onValueChange={(v) => setValue('refreshInterval', Number(v) as any)}
              disabled={!canEdit}
            >
              <SelectTrigger id="refreshInterval">
                <SelectValue placeholder="请选择前端刷新间隔" />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_INTERVAL_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={String(item.value)}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="businessTimezone">业务时区</Label>
            <Select
              value={String(getValue('businessTimezone', 'Europe/Vienna') ?? 'Europe/Vienna')}
              onValueChange={(v) => setValue('businessTimezone', v as any)}
              disabled={!canEdit}
            >
              <SelectTrigger id="businessTimezone">
                <SelectValue placeholder="请选择业务时区" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={String(item.value)}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pricePerKwh">电价（每 kWh，单位 EUR）</Label>
            <Input
              id="pricePerKwh"
              type="number"
              step="0.001"
              min="0"
              value={Number(getValue('pricePerKwh', 0.25) ?? 0.25)}
              onChange={(e) => setValue('pricePerKwh', Number(e.target.value) as any)}
              disabled={!canEdit}
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
                <Label className="flex items-center gap-1 cursor-pointer">
                  <Switch
                    checked={Boolean(getValue('priceAutoEnabled', false))}
                    onCheckedChange={(v) => setValue('priceAutoEnabled', !!v as any)}
                    disabled={!canEdit}
                  />
                  自动从公共数据源同步参考电价
                </Label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onRefreshReferencePrice}
                  disabled={!canEdit}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  立刻刷新参考电价
                </Button>
                {getValue('priceAutoLastUpdatedAt') ? (
                  <Badge variant="secondary" className="self-start">
                    最近一次：{formatDateTimeShort(String(getValue('priceAutoLastUpdatedAt')))}
                  </Badge>
                ) : null}
                {getValue('priceAutoSource') ? (
                  <Badge variant="outline" className="self-start">
                    数据源：{String(getValue('priceAutoSource'))}
                  </Badge>
                ) : null}
                {getValue('priceAutoRegion') ? (
                  <Badge variant="outline" className="self-start">
                    区域：{String(getValue('priceAutoRegion'))}
                  </Badge>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="priceAutoRegion">自动同步区域</Label>
                  <Input
                    id="priceAutoRegion"
                    type="text"
                    placeholder="例如：AT / DE / EU"
                    value={String(getValue('priceAutoRegion', '') ?? '')}
                    onChange={(e) => setValue('priceAutoRegion', e.target.value as any)}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="priceFallbackLabel">最终落地值说明</Label>
                  <div
                    id="priceFallbackLabel"
                    className="h-9 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground flex items-center"
                  >
                    {`取参考电价：${Number(getValue('pricePerKwh', 0.25) ?? 0.25).toFixed(3)} EUR / kWh`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 pt-2 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="alarmRatio80">80% 预警阈值（按百分比填 0-100）</Label>
            <Input
              id="alarmRatio80"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={getPercentValue('alarmRatio80', 0.8)}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (Number.isNaN(raw)) return;
                const ratio = raw <= 1 ? raw : raw / 100;
                setValue('alarmRatio80', ratio as any);
              }}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alarmRatio90">90% 预警阈值（按百分比填 0-100）</Label>
            <Input
              id="alarmRatio90"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={getPercentValue('alarmRatio90', 0.9)}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (Number.isNaN(raw)) return;
                const ratio = raw <= 1 ? raw : raw / 100;
                setValue('alarmRatio90', ratio as any);
              }}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alarmRatio95">95% 预警阈值（按百分比填 0-100）</Label>
            <Input
              id="alarmRatio95"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={getPercentValue('alarmRatio95', 0.95)}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (Number.isNaN(raw)) return;
                const ratio = raw <= 1 ? raw : raw / 100;
                setValue('alarmRatio95', ratio as any);
              }}
              disabled={!canEdit}
            />
          </div>
        </div>

        <Card className="border-dashed border-l-4 border-l-blue-400 bg-blue-50/20 dark:bg-blue-950/10">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-base font-medium">通用日限额（kWh）</div>
                <div className="text-xs text-muted-foreground">
                  按当前房间的用电习惯，默认给"今天的额度"。
                  启用"按星期 / 节假日"规则时，优先用规则计算。
                  关闭规则时，点"批量应用到全部空开"会把当前通用值直接写入每台设备。
                </div>
              </div>
              <Button
                type="button"
                variant="default"
                onClick={onApplyDefaultDailyLimit}
                disabled={!canEdit || bulkLimitSaving}
              >
                <Save className="w-4 h-4" />
                {bulkLimitSaving ? '保存中...' : '保存限额规则 / 批量应用到全部空开'}
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="defaultDailyLimitKwh">通用日限额（kWh）</Label>
                <Input
                  id="defaultDailyLimitKwh"
                  type="number"
                  min="0"
                  step="0.1"
                  value={Number(getValue('defaultDailyLimitKwh', 10) ?? 10)}
                  onChange={(e) => setValue('defaultDailyLimitKwh', Number(e.target.value) as any)}
                  disabled={!canEdit}
                />
              </div>
              <div className="col-span-1 md:col-span-2 lg:col-span-2">
                <div className="flex items-center gap-2 pt-1.5">
                  <Label
                    className="flex items-center gap-1 cursor-pointer"
                    htmlFor="defaultDailyLimitUseWeeklyRules"
                  >
                    <Switch
                      id="defaultDailyLimitUseWeeklyRules"
                      checked={Boolean(getValue('defaultDailyLimitUseWeeklyRules', false))}
                      onCheckedChange={(v) => {
                        setValue('defaultDailyLimitUseWeeklyRules', !!v as any);
                        setValue('defaultDailyLimitUseHolidayRules', !!v as any);
                      }}
                      disabled={!canEdit}
                    />
                    启用按星期 / 节假日拆分限额
                  </Label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="defaultDailyLimitWeekdayKwh">工作日限额（周一至周五）</Label>
                <Input
                  id="defaultDailyLimitWeekdayKwh"
                  type="number"
                  min="0"
                  step="0.1"
                  value={Number(
                    getValue(
                      'defaultDailyLimitWeekdayKwh',
                      Number(getValue('defaultDailyLimitKwh', 10) ?? 10),
                    ) ?? Number(getValue('defaultDailyLimitKwh', 10) ?? 10),
                  )}
                  onChange={(e) => setValue('defaultDailyLimitWeekdayKwh', Number(e.target.value) as any)}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="defaultDailyLimitSaturdayKwh">周六限额</Label>
                <Input
                  id="defaultDailyLimitSaturdayKwh"
                  type="number"
                  min="0"
                  step="0.1"
                  value={Number(
                    getValue(
                      'defaultDailyLimitSaturdayKwh',
                      Number(getValue('defaultDailyLimitKwh', 10) ?? 10),
                    ) ?? Number(getValue('defaultDailyLimitKwh', 10) ?? 10),
                  )}
                  onChange={(e) => setValue('defaultDailyLimitSaturdayKwh', Number(e.target.value) as any)}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="defaultDailyLimitSundayKwh">周日限额</Label>
                <Input
                  id="defaultDailyLimitSundayKwh"
                  type="number"
                  min="0"
                  step="0.1"
                  value={Number(
                    getValue(
                      'defaultDailyLimitSundayKwh',
                      Number(getValue('defaultDailyLimitKwh', 10) ?? 10),
                    ) ?? Number(getValue('defaultDailyLimitKwh', 10) ?? 10),
                  )}
                  onChange={(e) => setValue('defaultDailyLimitSundayKwh', Number(e.target.value) as any)}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="defaultDailyLimitHolidayKwh">公共节假日限额</Label>
                <Input
                  id="defaultDailyLimitHolidayKwh"
                  type="number"
                  min="0"
                  step="0.1"
                  value={Number(
                    getValue(
                      'defaultDailyLimitHolidayKwh',
                      Number(getValue('defaultDailyLimitKwh', 10) ?? 10),
                    ) ?? Number(getValue('defaultDailyLimitKwh', 10) ?? 10),
                  )}
                  onChange={(e) => setValue('defaultDailyLimitHolidayKwh', Number(e.target.value) as any)}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2 lg:col-span-2">
                <Label htmlFor="defaultDailyLimitHolidayDates">
                  公共节假日（MM-DD 逗号分隔，例如 10-26,11-01,12-25）
                </Label>
                <Input
                  id="defaultDailyLimitHolidayDates"
                  type="text"
                  placeholder="10-26,11-01,12-25"
                  value={String(getValue('defaultDailyLimitHolidayDates', '') ?? '')}
                  onChange={(e) => setValue('defaultDailyLimitHolidayDates', e.target.value as any)}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed border-l-4 border-l-amber-400 bg-amber-50/20 dark:bg-amber-950/10">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-base font-medium">每日拉闸 / 自动恢复</div>
                <div className="text-xs text-muted-foreground">
                  到达"每日限额"后，系统自动切断所有可控空开（电表 / 总闸等）避免超额。
                  拉闸 / 恢复时间可按当地作息自定义。
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 cursor-pointer" htmlFor="autoCutoff">
                  <Switch
                    id="autoCutoff"
                    checked={Boolean(getValue('autoCutoff', false))}
                    onCheckedChange={(v) => setValue('autoCutoff', !!v as any)}
                    disabled={!canEdit}
                  />
                  启用每日到达限额后自动拉闸
                </Label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dailyResetHour">
                  如果仍未恢复，则在每日此时间再次确认并拉闸（兜底时间点）
                </Label>
                <Select
                  value={String(getValue('dailyResetHour', 18) ?? 18)}
                  onValueChange={(v) => setValue('dailyResetHour', Number(v) as any)}
                  disabled={!canEdit}
                >
                  <SelectTrigger id="dailyResetHour">
                    <SelectValue placeholder="请选择兜底时间点" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUR_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={String(item.value)}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="autoRestorePower">
                  次日自动恢复（如果被自动拉闸，重新合闸）
                </Label>
                <div
                  className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
                >
                  {Boolean(getValue('autoRestorePower', true)) ? '自动恢复已启用' : '自动恢复未启用'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className={cn('flex items-center justify-end gap-2', !canEdit && 'pointer-events-none opacity-70')}>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? '保存中...' : '保存设置'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { formatShortDateTime };

