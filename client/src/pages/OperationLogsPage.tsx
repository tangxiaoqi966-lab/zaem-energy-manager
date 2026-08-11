import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Search, RefreshCw } from 'lucide-react'
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
import { logs } from '../lib/api'
import { OperationType, ROOM_NUMBERS, type OperationLogResponse } from '../types'

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
  keyword: string
  roomNumber: string
  startDate: string
  endDate: string
}

const DEFAULT_FILTERS: Filters = {
  type: 'all',
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
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['operation-logs', page, pageSize, appliedFilters],
    queryFn: () =>
      logs.operations({
        page,
        pageSize,
        type: appliedFilters.type !== 'all' ? (appliedFilters.type as OperationType) : undefined,
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
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-2">
        <FileText className="inline-block mr-2 h-7 w-7" />
        操作日志
      </h1>
      <p className="text-muted-foreground mb-6">
        查看系统内所有用户的操作记录，包括登录、限电修改、断电/恢复、设备同步等。
      </p>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <div className="flex min-w-max items-end gap-4">
              <div className="w-40 space-y-2">
              <Label htmlFor="filter-type">操作类型</Label>
              <Select
                value={filters.type}
                onValueChange={(val) =>
                  setFilters((prev) => ({ ...prev, type: val }))
                }
              >
                <SelectTrigger id="filter-type">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  {OPERATION_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>

              <div className="w-48 space-y-2">
              <Label htmlFor="filter-keyword">关键字 (详情)</Label>
              <Input
                id="filter-keyword"
                type="text"
                placeholder="搜索详情内容"
                value={filters.keyword}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, keyword: e.target.value }))
                }
              />
              </div>

              <div className="w-32 space-y-2">
              <Label htmlFor="filter-room">房间号</Label>
              <Select
                value={filters.roomNumber}
                onValueChange={(val) =>
                  setFilters((prev) => ({ ...prev, roomNumber: val }))
                }
              >
                <SelectTrigger id="filter-room">
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
              <Label htmlFor="filter-start">开始日期</Label>
              <Input
                id="filter-start"
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, startDate: e.target.value }))
                }
              />
              </div>

              <div className="w-40 space-y-2">
              <Label htmlFor="filter-end">结束日期</Label>
              <Input
                id="filter-end"
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, endDate: e.target.value }))
                }
              />
              </div>

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
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">加载中...</div>
          ) : list.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">时间</TableHead>
                    <TableHead className="w-32">类型</TableHead>
                    <TableHead className="w-32">操作人</TableHead>
                    <TableHead className="w-24">房间</TableHead>
                    <TableHead>详情</TableHead>
                    <TableHead className="w-24">结果</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDateTime(item.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
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
                      <TableCell>{item.actorLabel ?? item.username ?? '-'}</TableCell>
                      <TableCell>{item.displayName ?? item.roomNumber ?? '-'}</TableCell>
                      <TableCell className="max-w-md whitespace-pre-line text-sm text-muted-foreground">
                        {item.detailsText ?? item.details}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.success ? 'secondary' : 'destructive'}>
                          {item.success ? '成功' : '失败'}
                        </Badge>
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
          ) : (
            <div className="p-8 text-center text-muted-foreground">暂无数据</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
