import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Bell, Check, Search, RefreshCw, Trash2 } from 'lucide-react'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { logs } from '../lib/api'
import { getSocket } from '../lib/socket'
import { useAuthStore } from '../store/auth'
import {
  AlarmType,
  AlarmLevel,
  ROOM_NUMBERS,
  UserRole,
  type AlarmLogResponse,
} from '../types'

const ALARM_TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: AlarmType.LIMIT_80, label: '80% 用电预警' },
  { value: AlarmType.LIMIT_90, label: '90% 用电预警' },
  { value: AlarmType.LIMIT_95, label: '95% 用电预警' },
  { value: AlarmType.LIMIT_REACHED, label: '达到限额' },
  { value: AlarmType.DEVICE_OFFLINE, label: '设备离线' },
  { value: AlarmType.CONTROL_FAILED, label: '控制失败' },
  { value: AlarmType.SYNC_FAILED, label: '同步失败' },
]

const ALARM_LEVEL_OPTIONS = [
  { value: 'all', label: '全部级别' },
  { value: AlarmLevel.INFO, label: '信息' },
  { value: AlarmLevel.WARNING, label: '警告' },
  { value: AlarmLevel.DANGER, label: '危险' },
  { value: AlarmLevel.CRITICAL, label: '严重' },
]

const getAlarmTypeLabel = (type: AlarmType): string => {
  switch (type) {
    case AlarmType.LIMIT_80:
      return '80% 用电预警'
    case AlarmType.LIMIT_90:
      return '90% 用电预警'
    case AlarmType.LIMIT_95:
      return '95% 用电预警'
    case AlarmType.LIMIT_REACHED:
      return '达到限额'
    case AlarmType.DEVICE_OFFLINE:
      return '设备离线'
    case AlarmType.CONTROL_FAILED:
      return '控制失败'
    case AlarmType.SYNC_FAILED:
      return '同步失败'
    default:
      return type
  }
}

const getAlarmLevelBadge = (
  level: AlarmLevel
): 'secondary' | 'default' | 'destructive' => {
  switch (level) {
    case AlarmLevel.INFO:
      return 'secondary'
    case AlarmLevel.WARNING:
      return 'default'
    case AlarmLevel.DANGER:
    case AlarmLevel.CRITICAL:
      return 'destructive'
    default:
      return 'secondary'
  }
}

const getAlarmLevelLabel = (level: AlarmLevel): string => {
  switch (level) {
    case AlarmLevel.INFO:
      return '信息'
    case AlarmLevel.WARNING:
      return '警告'
    case AlarmLevel.DANGER:
      return '危险'
    case AlarmLevel.CRITICAL:
      return '严重'
    default:
      return level
  }
}

const isWarningAlarm = (type: AlarmType): boolean =>
  type === AlarmType.LIMIT_80 ||
  type === AlarmType.LIMIT_90 ||
  type === AlarmType.LIMIT_95

const getAlarmStatusLabel = (item: AlarmLogResponse): string => {
  if (item.resolved) {
    return '已闭环'
  }
  return isWarningAlarm(item.type) ? '待关注' : '待处理'
}

const getAlarmActionLabel = (item: AlarmLogResponse): string => {
  return isWarningAlarm(item.type) ? '标记已读' : '标记处理'
}

const getAlarmStatusVariant = (
  item: AlarmLogResponse
): 'secondary' | 'default' | 'destructive' => {
  if (item.resolved) {
    return 'secondary'
  }
  return isWarningAlarm(item.type) ? 'default' : 'destructive'
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

interface Filters {
  type: string
  level: string
  roomNumber: string
  startDate: string
  endDate: string
}

const DEFAULT_FILTERS: Filters = {
  type: 'all',
  level: 'all',
  roomNumber: 'all',
  startDate: '',
  endDate: '',
}

interface PaginatedResponse {
  items: AlarmLogResponse[]
  total: number
  page: number
  pageSize: number
}

export function AlarmCenterPage() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuthStore()
  const canResolve = hasPermission([UserRole.ADMIN, UserRole.BOSS])

  const [activeTab, setActiveTab] = useState<'all' | 'unresolved' | 'resolved'>('all')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [isClearing, setIsClearing] = useState(false)

  const resolvedParam: boolean | undefined =
    activeTab === 'all' ? undefined : activeTab === 'resolved'

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'alarms',
      page,
      pageSize,
      appliedFilters,
      activeTab,
    ],
    queryFn: () =>
      logs.alarms({
        page,
        pageSize,
        type: appliedFilters.type !== 'all' ? (appliedFilters.type as AlarmType) : undefined,
        level: appliedFilters.level !== 'all' ? (appliedFilters.level as AlarmLevel) : undefined,
        roomNumber: appliedFilters.roomNumber !== 'all' ? appliedFilters.roomNumber : undefined,
        startDate: appliedFilters.startDate || undefined,
        endDate: appliedFilters.endDate || undefined,
        resolved: resolvedParam,
      }) as Promise<PaginatedResponse>,
  })

  const resolveMutation = useMutation({
    mutationFn: (id: string) => logs.resolveAlarm(id),
    onSuccess: () => {
      toast.success('操作成功')
      queryClient.invalidateQueries({ queryKey: ['alarms'] })
    },
    onError: (error: Error) => {
      toast.error(error?.message || '操作失败')
    },
    onSettled: () => {
      setResolvingId(null)
    },
  })

  const clearMutation = useMutation({
    mutationFn: (payload: {
      type?: AlarmType
      level?: AlarmLevel
      roomNumber?: string
      startDate?: string
      endDate?: string
      resolved?: boolean
    }) => logs.clearAlarms(payload),
    onSuccess: (result) => {
      const deletedCount = Number(result?.deletedCount ?? 0)
      toast.success(
        deletedCount > 0 ? `已清除 ${deletedCount} 条报警记录` : '没有可清除的报警记录'
      )
      queryClient.invalidateQueries({ queryKey: ['alarms'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-unresolved-alarms'] })
      queryClient.invalidateQueries({ queryKey: ['sidebar-alarm-summary'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
    onError: (error: Error) => {
      toast.error(error?.message || '清除失败')
    },
    onSettled: () => {
      setIsClearing(false)
    },
  })

  useEffect(() => {
    const socket = getSocket()
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['alarms'] })
    }
    socket.on('alarm:new', handler)
    return () => {
      socket.off('alarm:new', handler)
    }
  }, [queryClient])

  const handleTabChange = (val: string) => {
    setActiveTab(val as 'all' | 'unresolved' | 'resolved')
    setPage(1)
  }

  const handleSearch = () => {
    setPage(1)
    setAppliedFilters({ ...filters })
  }

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS)
    setAppliedFilters(DEFAULT_FILTERS)
    setPage(1)
  }

  const handleResolve = (id: string) => {
    setResolvingId(id)
    resolveMutation.mutate(id)
  }

  const handleClear = () => {
    const scopeLabel =
      activeTab === 'all'
        ? '当前筛选下的全部报警记录'
        : activeTab === 'unresolved'
          ? '当前筛选下的待处理报警记录'
          : '当前筛选下的已闭环报警记录'

    if (!window.confirm(`确认清除${scopeLabel}吗？此操作不可恢复。`)) {
      return
    }

    setIsClearing(true)
    clearMutation.mutate({
      type: appliedFilters.type !== 'all' ? (appliedFilters.type as AlarmType) : undefined,
      level: appliedFilters.level !== 'all' ? (appliedFilters.level as AlarmLevel) : undefined,
      roomNumber: appliedFilters.roomNumber !== 'all' ? appliedFilters.roomNumber : undefined,
      startDate: appliedFilters.startDate || undefined,
      endDate: appliedFilters.endDate || undefined,
      resolved: resolvedParam,
    })
  }

  const handlePrev = () => {
    if (page > 1) setPage(page - 1)
  }

  const handleNext = () => {
    setPage(page + 1)
  }

  const list: AlarmLogResponse[] = data?.items ?? []
  const total: number = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const renderAlarmTable = () => {
    if (isLoading) {
      return (
        <div className="p-8 text-center text-muted-foreground">加载中...</div>
      )
    }

    if (list.length === 0) {
      return (
        <div className="p-8 text-center text-muted-foreground">暂无数据</div>
      )
    }

    return (
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">时间</TableHead>
              <TableHead className="w-36">类型</TableHead>
              <TableHead className="w-24">级别</TableHead>
              <TableHead className="w-24">房间</TableHead>
              <TableHead>消息</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead className="w-32">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatDateTime(item.createdAt)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {getAlarmTypeLabel(item.type)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={getAlarmLevelBadge(item.level)}>
                    {getAlarmLevelLabel(item.level)}
                  </Badge>
                </TableCell>
                <TableCell>{item.displayName ?? item.roomNumber ?? '-'}</TableCell>
                <TableCell className="text-sm">{item.message}</TableCell>
                <TableCell>
                  <Badge variant={getAlarmStatusVariant(item)}>
                    {getAlarmStatusLabel(item)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {!item.resolved ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResolve(item.id)}
                      disabled={!canResolve || resolvingId === item.id}
                    >
                      {resolvingId === item.id ? (
                        <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="mr-1 h-3 w-3" />
                      )}
                      {getAlarmActionLabel(item)}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between px-6 py-4 border-t">
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
    )
  }

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-2">
        <Bell className="inline-block mr-2 h-7 w-7" />
        报警中心
      </h1>
      <p className="text-muted-foreground mb-6">
        这里记录的是预警与异常状态。80% / 90% / 95% 属于预警提醒；达到限额并且系统已自动断电后，会自动闭环，不再要求手工处理。
      </p>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <div className="flex min-w-max items-end gap-4">
              <div className="w-40 space-y-2">
              <Label htmlFor="alarm-type">报警类型</Label>
              <Select
                value={filters.type}
                onValueChange={(val) =>
                  setFilters((prev) => ({ ...prev, type: val }))
                }
              >
                <SelectTrigger id="alarm-type">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  {ALARM_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>

              <div className="w-36 space-y-2">
              <Label htmlFor="alarm-level">报警级别</Label>
              <Select
                value={filters.level}
                onValueChange={(val) =>
                  setFilters((prev) => ({ ...prev, level: val }))
                }
              >
                <SelectTrigger id="alarm-level">
                  <SelectValue placeholder="选择级别" />
                </SelectTrigger>
                <SelectContent>
                  {ALARM_LEVEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>

              <div className="w-32 space-y-2">
              <Label htmlFor="alarm-room">房间号</Label>
              <Select
                value={filters.roomNumber}
                onValueChange={(val) =>
                  setFilters((prev) => ({ ...prev, roomNumber: val }))
                }
              >
                <SelectTrigger id="alarm-room">
                  <SelectValue placeholder="选择房间" />
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

              <div className="w-40 space-y-2">
              <Label htmlFor="alarm-start">开始日期</Label>
              <Input
                id="alarm-start"
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, startDate: e.target.value }))
                }
              />
              </div>

              <div className="w-40 space-y-2">
              <Label htmlFor="alarm-end">结束日期</Label>
              <Input
                id="alarm-end"
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, endDate: e.target.value }))
                }
              />
              </div>

              {canResolve ? (
                <Button
                  variant="destructive"
                  onClick={handleClear}
                  disabled={isFetching || isClearing}
                  className="shrink-0"
                >
                  {isClearing ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  清除记录
                </Button>
              ) : null}

              <Button variant="outline" onClick={handleReset} className="shrink-0">
                重置
              </Button>
              <Button onClick={handleSearch} disabled={isFetching} className="shrink-0">
                {isFetching ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                查询
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="w-full"
          >
            <div className="px-6 pt-4">
              <TabsList>
                <TabsTrigger value="all">全部</TabsTrigger>
                <TabsTrigger value="unresolved">待关注/待处理</TabsTrigger>
                <TabsTrigger value="resolved">已闭环</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="all" className="mt-0">
              {renderAlarmTable()}
            </TabsContent>
            <TabsContent value="unresolved" className="mt-0">
              {renderAlarmTable()}
            </TabsContent>
            <TabsContent value="resolved" className="mt-0">
              {renderAlarmTable()}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
