import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, Zap } from 'lucide-react'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table'
import { energy } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { UserRole } from '../types'

interface EnergyLimitRow {
  roomId: string
  roomNumber: string
  dailyLimit: number
  name: string
  displayName?: string
}

type LocalLimits = Record<string, number>

export function EnergyLimitsPage() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuthStore()
  const canEdit = hasPermission([UserRole.ADMIN, UserRole.BOSS])

  const [localLimits, setLocalLimits] = useState<LocalLimits>({})
  const [bulkValue, setBulkValue] = useState<string>('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [bulkSaving, setBulkSaving] = useState(false)

  const { data: limits, isLoading } = useQuery({
    queryKey: ['energy-limits'],
    queryFn: () => energy.getLimits() as Promise<EnergyLimitRow[]>,
  })

  const updateLimitMutation = useMutation({
    mutationFn: ({ roomId, dailyLimit }: { roomId: string; dailyLimit: number }) =>
      energy.updateLimit(roomId, dailyLimit),
    onSuccess: () => {
      toast.success('操作成功')
      queryClient.invalidateQueries({ queryKey: ['energy-limits'] })
    },
    onError: (error: Error) => {
      toast.error(error?.message || '操作失败')
    },
    onSettled: () => {
      setSavingId(null)
    },
  })

  const getLimitValue = (item: EnergyLimitRow): number => {
    if (localLimits[item.roomId] !== undefined) {
      return localLimits[item.roomId]
    }
    return item.dailyLimit ?? 0
  }

  const handleLimitChange = (roomId: string, value: string) => {
    const num = parseFloat(value)
    if (!isNaN(num) && num >= 0) {
      setLocalLimits((prev) => ({ ...prev, [roomId]: num }))
    } else if (value === '') {
      setLocalLimits((prev) => ({ ...prev, [roomId]: 0 }))
    }
  }

  const handleSave = (roomId: string) => {
    const currentLimit = limits?.find((l) => l.roomId === roomId)
    if (!currentLimit) return
    const dailyLimit = getLimitValue(currentLimit)
    setSavingId(roomId)
    updateLimitMutation.mutate({ roomId, dailyLimit })
  }

  const handleBulkApply = async () => {
    if (!limits || limits.length === 0) return
    const num = parseFloat(bulkValue)
    if (isNaN(num) || num < 0) {
      toast.error('请输入有效的数字')
      return
    }
    setBulkSaving(true)
    try {
      const promises = limits.map((item) => energy.updateLimit(item.roomId, num))
      await Promise.all(promises)
      toast.success('操作成功')
      queryClient.invalidateQueries({ queryKey: ['energy-limits'] })
      setLocalLimits({})
    } catch (error: unknown) {
      const err = error as Error
      toast.error(err?.message || '操作失败')
    } finally {
      setBulkSaving(false)
    }
  }

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-2">
        <Zap className="inline-block mr-2 h-7 w-7" />
        每日限电设置
      </h1>
      <p className="text-muted-foreground mb-6">
        设置每个房间每日用电量上限，超过限额将自动断电。保存后立即生效。
      </p>

      {!canEdit && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <p className="text-amber-800 text-sm">
              ⚠️ 当前账号无权限修改限电设置，请联系管理员或老板。
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 max-w-sm">
              <Label htmlFor="bulk-limit">一键应用到全部房间</Label>
              <Input
                id="bulk-limit"
                type="number"
                step="0.1"
                min="0"
                placeholder="输入电量上限"
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                disabled={!canEdit || bulkSaving}
              />
            </div>
            <Button
              onClick={handleBulkApply}
              disabled={!canEdit || !bulkValue || bulkSaving}
            >
              {bulkSaving ? (
                <>
                  <Save className="mr-2 h-4 w-4 animate-spin" />
                  批量保存中...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  一键应用
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">加载中...</div>
          ) : limits && limits.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>空间名称</TableHead>
                  <TableHead className="w-32">编号</TableHead>
                  <TableHead className="w-64">每日限额</TableHead>
                  <TableHead className="w-40">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {limits.map((item) => (
                  <TableRow key={item.roomId}>
                    <TableCell className="font-medium">
                      {item.displayName || item.name || item.roomNumber}
                    </TableCell>
                    <TableCell>{item.roomNumber}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={getLimitValue(item)}
                        onChange={(e) => handleLimitChange(item.roomId, e.target.value)}
                        disabled={!canEdit}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => handleSave(item.roomId)}
                        disabled={!canEdit || savingId === item.roomId}
                      >
                        {savingId === item.roomId ? (
                          <Save className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        <span className="ml-2">保存</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-8 text-center text-muted-foreground">暂无数据</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
