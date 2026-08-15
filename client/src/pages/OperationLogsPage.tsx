import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Search, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table'
import { logs, system } from '../lib/api'
import { OperationType, ROOM_NUMBERS, type OperationLogResponse } from '../types'
import { useSiteStore } from '../store/site'

const OPERATION_TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: OperationType.LOGIN, label: '登录' },
  { value: OperationType.LOGOUT, label: '登出' },
  { value: OperationType.UPDATE_LIMIT, label: '修改限电' },
  { value: OperationType.CUTOFF_POWER, label: '断电' },
  { value: OperationType.RESTORE_POWER, label: '恢复供电' },
  { value: OperationType.SYNC_DEVICES, label: '同步设备' },
  { value: OperationType.UPDATE_SETTINGS, label: '修改设置' },
  { value: OperationType.UPDATE_ALARM, label: '更新报警' },
  { value: OperationType.CONTROL_DEVICE, label: '控制设备' },
]

const OPERATION_CATEGORY_OPTIONS = [
  { value: 'all', label: '全部分类' },
  { value: 'auth', label: '账号登录' },
  { value: 'room_power', label: '房间电力' },
  { value: 'network', label: '网络设备' },
  { value: 'camera', label: '摄像头' },
  { value: 'room', label: '房间信息' },
  { value: 'alarm', label: '报警处理' },
  { value: 'device_sync', label: '设备同步' },
  { value: 'system', label: '系统设置' },
  { value: 'other', label: '其他' },
]

const getOperationTypeBadge = (type: OperationType): string => {
  switch (type) {
    case OperationType.LOGIN:
    case OperationType.LOGOUT:
      return 'secondary'
    case OperationType.UPDATE_LIMIT:
    case OperationType.CUTOFF_POWER:
    case OperationType.RESTORE_POWER:
    case OperationType.UPDATE_ALARM:
      return 'default'
    case OperationType.SYNC_DEVICES:
    case OperationType.CONTROL_DEVICE:
    case OperationType.UPDATE_SETTINGS:
      return 'outline'
    default:
      return 'outline'
  }
}

const getOperationTypeLabel = (type: OperationType): string => {
  switch (type) {
    case OperationType.LOGIN:
      return '登录'
    case OperationType.LOGOUT:
      return '登出'
    case OperationType.UPDATE_LIMIT:
      return '修改限电'
    case OperationType.CUTOFF_POWER:
      return '断电'
    case OperationType.RESTORE_POWER:
      return '恢复供电'
    case OperationType.SYNC_DEVICES:
      return '同步设备'
    case OperationType.UPDATE_SETTINGS:
      return '修改设置'
    case OperationType.UPDATE_ALARM:
      return '更新报警'
    case OperationType.CONTROL_DEVICE:
      return '控制设备'
    default:
      return type
  }
}

const getResultBadgeVariant = (
  tone?: 'success' | 'failure' | 'warning',
): 'secondary' | 'destructive' | 'warning' => {
  switch (tone) {
    case 'warning':
      return 'warning'
    case 'failure':
      return 'destructive'
    case 'success':
    default:
      return 'secondary'
  }
}

const formatDateTime = (dateStr: string): string => {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

type ParsedOperationDetails = Record<string, unknown>

const parseOperationDetails = (raw: string | null | undefined): ParsedOperationDetails | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ParsedOperationDetails
    }
  } catch {
    return null
  }
  return null
}

const asText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text : null
}

const asNumber = (value: unknown): number | null => {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const asBool = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value
  return null
}

const formatLimitValue = (value: unknown): string | null => {
  const num = asNumber(value)
  if (num == null) return null
  return `${num} kWh/天`
}

const formatCostLimitValue = (value: unknown): string | null => {
  const num = asNumber(value)
  if (num == null) return null
  return `EUR ${num}/月`
}

const cleanSummaryText = (value: string | null): string | null => {
  if (!value) return null
  return value
    .replace(/^说明[:：]\s*/u, '')
    .replace(/^结果[:：]\s*/u, '')
    .replace(/^失败原因[:：]\s*/u, '')
    .trim() || null
}

const formatPercentValue = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/u, '')

const extractLimitPercent = (value: string | null): string | null => {
  if (!value) return null
  const match = value.match(/(\d+(?:\.\d+)?)\s*%\s*限额/u)
  if (!match) return null
  const percent = Number(match[1])
  if (!Number.isFinite(percent)) return null
  return `${formatPercentValue(percent)}%`
}

const buildAlarmReasonSummary = (
  action: string | null | undefined,
  note: string | null,
  error: string | null,
  message: string | null,
  detailsText: string | null,
  deletedCount: number | null,
): string | null => {
  if (action === 'clear' && deletedCount != null) {
    return `已清除 ${deletedCount} 条报警记录`
  }
  if (action === 'room_offline_detected') {
    const offlineCount = detailsText?.match(/离线设备\s*(\d+)\s*台/u)?.[1]
    return offlineCount ? `检测到网络或供电异常，离线设备 ${offlineCount} 台` : '检测到网络或供电异常'
  }
  if (action === 'room_offline_recovered') {
    return '网络或供电异常已恢复'
  }

  const alarmText = [note, error, message, detailsText].filter(Boolean).join(' ')
  const limitPercent = extractLimitPercent(alarmText)
  const isRead = /已标记已读/u.test(alarmText)

  if (limitPercent) {
    return `电量限额超出 ${limitPercent}，已${isRead ? '标记已读' : '处理'}`
  }
  if (/超出日限额/u.test(alarmText)) {
    return `电量超出日限额，已${isRead ? '标记已读' : '处理'}`
  }
  if (/网络或供电异常|离线/u.test(alarmText)) {
    return `网络或供电异常，已${isRead ? '标记已读' : '处理'}`
  }
  if (deletedCount != null) {
    return `已清除 ${deletedCount} 条报警记录`
  }

  return note || error || message
}

const getOperationDetailSummary = (item: OperationLogResponse): string => {
  const parsed = parseOperationDetails(item.details)
  const action = asText(parsed?.action)?.toLowerCase()
  const note = cleanSummaryText(asText(parsed?.note) ?? asText(parsed?.actionResult))
  const error = cleanSummaryText(asText(parsed?.error) ?? asText(parsed?.reason))
  const message = cleanSummaryText(asText(parsed?.message))
  const detailsText = cleanSummaryText(String(item.detailsText ?? '').replace(/\s+/gu, ' ').trim() || null)
  const dailyLimit = formatLimitValue(parsed?.dailyLimit)
  const limitEnabled = asBool(parsed?.limitEnabled)
  const monthlyCostLimit = formatCostLimitValue(parsed?.monthlyCostLimit)
  const costLimitEnabled = asBool(parsed?.costLimitEnabled)
  const deletedCount = asNumber(parsed?.deletedCount)
  const totalCount = asNumber(parsed?.totalCount)
  const failedCount = asNumber(parsed?.failedCount)
  const skippedCount = asNumber(parsed?.skippedCount)

  if (action === 'auto_cutoff') {
    return note || error || '超出日限额，执行自动断电'
  }
  if (action === 'manual_cutoff') {
    return error || '手动执行断电'
  }
  if (action === 'auto_restore') {
    return error || '进入恢复时段，执行自动恢复供电'
  }
  if (action === 'manual_restore') {
    return error || '手动恢复供电'
  }
  if (action === 'auto_cutoff_skipped' || action === 'auto_restore_skipped') {
    return note || error || (item.resultLabel ? `已${item.resultLabel}` : '本次未执行')
  }
  if (action === 'update_limit') {
    if (dailyLimit && limitEnabled != null) {
      if (monthlyCostLimit && costLimitEnabled != null) {
        return `日限额改为 ${dailyLimit}，费用限额改为 ${monthlyCostLimit}，限额断电已${limitEnabled ? '开启' : '关闭'}，费用断电已${costLimitEnabled ? '开启' : '关闭'}`
      }
      return `日限额改为 ${dailyLimit}，限额断电已${limitEnabled ? '开启' : '关闭'}`
    }
    if (monthlyCostLimit && costLimitEnabled != null) {
      return `费用限额改为 ${monthlyCostLimit}，费用断电已${costLimitEnabled ? '开启' : '关闭'}`
    }
    if (dailyLimit) return `日限额改为 ${dailyLimit}`
    if (monthlyCostLimit) return `费用限额改为 ${monthlyCostLimit}`
    if (limitEnabled != null) return `限额断电已${limitEnabled ? '开启' : '关闭'}`
    if (costLimitEnabled != null) return `费用断电已${costLimitEnabled ? '开启' : '关闭'}`
  }
  if (action === 'bulk_update_limit' && dailyLimit) {
    return totalCount != null
      ? `批量将 ${totalCount} 个房间的日限额改为 ${dailyLimit}`
      : `批量将日限额改为 ${dailyLimit}`
  }
  if (action === 'bulk_limit_enabled' && limitEnabled != null) {
    return totalCount != null
      ? `批量为 ${totalCount} 个房间${limitEnabled ? '开启' : '关闭'}限额断电`
      : `批量${limitEnabled ? '开启' : '关闭'}限额断电`
  }
  if (action === 'resolve_alarm' || item.type === OperationType.UPDATE_ALARM) {
    const alarmSummary = buildAlarmReasonSummary(
      action,
      note,
      error,
      message,
      detailsText,
      deletedCount,
    )
    if (alarmSummary) return alarmSummary
  }
  if (item.type === OperationType.LOGIN || item.type === OperationType.LOGOUT) {
    return note || error || (item.success ? '登录状态已更新' : '登录失败')
  }
  if (item.type === OperationType.SYNC_DEVICES) {
    if (error) return error
    if (failedCount || skippedCount) {
      return `同步完成，失败 ${failedCount ?? 0}，跳过 ${skippedCount ?? 0}`
    }
    if (totalCount != null) return `已同步 ${totalCount} 个设备`
  }
  if (item.type === OperationType.UPDATE_SETTINGS) {
    if (note) return note
    if (action === 'refresh_reference_price') return '已自动获取参考电价'
    return '系统设置已更新'
  }

  if (note) return note
  if (error) return error
  if (message) return message

  const lines = String(item.detailsText ?? item.details ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const usefulLines = lines.filter(
    (line) =>
      !['动作：', '来源：', '房间：', '结果：', '操作人：', '分类：', '类型：'].some((prefix) =>
        line.startsWith(prefix),
      ),
  )
  const firstUseful = cleanSummaryText(usefulLines[0] ?? null)
  if (firstUseful) return firstUseful

  return item.success ? '已执行该操作' : '执行失败'
}

const getOperationRoomLabel = (item: OperationLogResponse): string => {
  const displayName = asText(item.displayName)
  const roomNumber = asText(item.roomNumber)

  if (displayName && roomNumber) {
    if (displayName === roomNumber) return roomNumber
    if (displayName.includes(roomNumber)) return displayName
    return `${displayName} (${roomNumber})`
  }

  return displayName || roomNumber || '-'
}

interface Filters {
  type: string
  category: string
  keyword: string
  roomNumber: string
  startDate: string
  endDate: string
}

const DEFAULT_FILTERS: Filters = {
  type: 'all',
  category: 'all',
  keyword: '',
  roomNumber: 'all',
  startDate: '',
  endDate: '',
}

interface PaginatedResponse {
  items: OperationLogResponse[]
  list?: OperationLogResponse[]
  total: number
  page: number
  pageSize: number
}

export function OperationLogsPage() {
  const selectedSiteId = useSiteStore((state) => state.selectedSiteId)
  const setSelectedSiteId = useSiteStore((state) => state.setSelectedSiteId)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS)

  const { data: sites = [] } = useQuery({
    queryKey: ['system-sites'],
    queryFn: system.getSites,
    staleTime: 1000 * 60,
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['operation-logs', selectedSiteId ?? 'all', page, pageSize, appliedFilters],
    queryFn: () =>
      logs.operations({
        siteId: selectedSiteId ?? undefined,
        page,
        pageSize,
        type: appliedFilters.type !== 'all' ? (appliedFilters.type as OperationType) : undefined,
        category: appliedFilters.category !== 'all' ? appliedFilters.category : undefined,
        keyword: appliedFilters.keyword || undefined,
        roomNumber: appliedFilters.roomNumber !== 'all' ? appliedFilters.roomNumber : undefined,
        startDate: appliedFilters.startDate || undefined,
        endDate: appliedFilters.endDate || undefined,
      }) as Promise<PaginatedResponse>,
  })

  const handleSearch = () => {
    setPage(1)
    setAppliedFilters({ ...filters })
  }

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS)
    setAppliedFilters(DEFAULT_FILTERS)
    setPage(1)
  }

  const handlePrev = () => {
    if (page > 1) setPage(page - 1)
  }

  const handleNext = () => {
    setPage(page + 1)
  }

  const list: OperationLogResponse[] = data?.items ?? data?.list ?? []
  const total: number = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="app-page app-page-stack">
      <div className="app-page-header">
        <h1 className="text-2xl font-bold">
          <FileText className="mr-2 inline-block h-7 w-7" />
          操作日志
        </h1>
        <Select
          value={selectedSiteId ?? 'all'}
          onValueChange={(value) => {
            setSelectedSiteId(value === 'all' ? null : value)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="选择区域" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部区域</SelectItem>
            {sites.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-max flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Select
              value={filters.type}
              onValueChange={(val) =>
                setFilters((prev) => ({ ...prev, type: val }))
              }
            >
              <SelectTrigger id="filter-type" className="h-9 w-[120px]">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                {OPERATION_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.category}
              onValueChange={(val) =>
                setFilters((prev) => ({ ...prev, category: val }))
              }
            >
              <SelectTrigger id="filter-category" className="h-9 w-[120px]">
                <SelectValue placeholder="全部分类" />
              </SelectTrigger>
              <SelectContent>
                {OPERATION_CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.roomNumber}
              onValueChange={(val) =>
                setFilters((prev) => ({ ...prev, roomNumber: val }))
              }
            >
              <SelectTrigger id="filter-room" className="h-9 w-[108px]">
                <SelectValue placeholder="全部房间" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部房间</SelectItem>
                {ROOM_NUMBERS.map((room) => (
                  <SelectItem key={room} value={room}>
                    {room}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Input
              id="filter-keyword"
              type="text"
              placeholder="关键字"
              className="h-9 w-[148px]"
              value={filters.keyword}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, keyword: e.target.value }))
              }
            />
            <div className="flex h-9 items-center gap-1.5 rounded-md border bg-background px-2.5">
              <span className="text-xs text-muted-foreground">开始</span>
              <Input
                id="filter-start"
                type="date"
                className="h-7 w-[124px] border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, startDate: e.target.value }))
                }
              />
              <span className="text-xs text-muted-foreground">/</span>
              <span className="text-xs text-muted-foreground">结束</span>
              <Input
                id="filter-end"
                type="date"
                className="h-7 w-[124px] border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, endDate: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={handleReset} className="h-9 shrink-0 px-3">
              重置
            </Button>
            <Button onClick={handleSearch} disabled={isFetching} className="h-9 shrink-0 px-3">
              {isFetching ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              查询
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">加载中...</div>
          ) : list.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[88px] whitespace-nowrap">操作人</TableHead>
                    <TableHead className="min-w-[80px] whitespace-nowrap">来源</TableHead>
                    <TableHead className="min-w-[96px] whitespace-nowrap">分类</TableHead>
                    <TableHead className="min-w-[92px] whitespace-nowrap">房间号</TableHead>
                    <TableHead className="min-w-[96px] whitespace-nowrap">类型</TableHead>
                    <TableHead>详情</TableHead>
                    <TableHead className="w-24">结果</TableHead>
                    <TableHead className="w-44">时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {item.actorLabel ?? item.username ?? '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {item.sourceLabel ?? '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className="whitespace-nowrap">
                          {item.categoryLabel ?? '未分类'}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="min-w-[92px] whitespace-nowrap text-sm"
                        title={getOperationRoomLabel(item)}
                      >
                        {getOperationRoomLabel(item)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge
                          className="whitespace-nowrap"
                          variant={
                            getOperationTypeBadge(item.type) as
                              | 'default'
                              | 'secondary'
                              | 'outline'
                          }
                        >
                          {getOperationTypeLabel(item.type)}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="max-w-[220px] truncate text-sm text-muted-foreground"
                        title={getOperationDetailSummary(item)}
                      >
                        {getOperationDetailSummary(item)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getResultBadgeVariant(item.resultTone)}>
                          {item.resultLabel ?? (item.success ? '成功' : '失败')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDateTime(item.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between border-t px-3 py-3">
                <div className="text-sm text-muted-foreground">
                  第 {page} / {totalPages} 页，共 {total} 条记录
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrev}
                    disabled={page <= 1 || isFetching}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNext}
                    disabled={isFetching || page >= totalPages}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-4 text-center text-muted-foreground">暂无数据</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
