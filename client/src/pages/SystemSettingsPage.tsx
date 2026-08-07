import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Settings,
  Save,
  RefreshCw,
  Power,
  CheckCircle2,
  XCircle,
  LogIn,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Badge } from '../components/ui/badge'
import { DevicesTable } from '../components/device/DevicesTable'
import { dashboard, system } from '../lib/api'
import { getSocket } from '../lib/socket'
import { useAuthStore } from '../store/auth'
import { UserRole, type SystemSettingsData } from '../types'

const REFRESH_INTERVAL_OPTIONS = [
  { label: '1 秒', value: 1000 },
  { label: '2 秒', value: 2000 },
  { label: '5 秒', value: 5000 },
  { label: '10 秒', value: 10000 },
]

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  label: `${i.toString().padStart(2, '0')}:00`,
  value: i,
}))

const TIMEZONE_OPTIONS = [
  { label: '欧洲/维也纳', value: 'Europe/Vienna' },
  { label: '欧洲/柏林', value: 'Europe/Berlin' },
  { label: '中国/上海', value: 'Asia/Shanghai' },
]

const XIAOMI_VERIFICATION_STORAGE_KEY = 'xiaomi_verification_pending'

export function SystemSettingsPage() {
  const queryClient = useQueryClient()
  const { hasPermission, isAuthenticated, token } = useAuthStore()
  const canEdit = hasPermission([UserRole.ADMIN, UserRole.BOSS])
  const canManageXiaomi = hasPermission([UserRole.ADMIN])
  const canQueryProtectedApi = isAuthenticated && !!token

  const [formData, setFormData] = useState<Partial<SystemSettingsData>>({})
  const [saving, setSaving] = useState(false)

  const [xiaomiLogging, setXiaomiLogging] = useState(false)
  const [xiaomiSyncing, setXiaomiSyncing] = useState(false)
  const [xiaomiUsername, setXiaomiUsername] = useState('')
  const [xiaomiPassword, setXiaomiPassword] = useState('')
  const [xiaomiUserId, setXiaomiUserId] = useState('')
  const [xiaomiServiceToken, setXiaomiServiceToken] = useState('')
  const [xiaomiSsecurity, setXiaomiSsecurity] = useState('')
  const [xiaomiRegion, setXiaomiRegion] = useState('cn')
  const [xiaomiEmailCode, setXiaomiEmailCode] = useState('')
  const [verificationPending, setVerificationPending] = useState(false)
  const verificationWindowRef = useRef<Window | null>(null)
  const verificationRetryingRef = useRef(false)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: system.getSettings,
    enabled: canQueryProtectedApi,
    retry: false,
  })

  const { data: xiaomiStatus, refetch: refetchXiaomiStatus } = useQuery({
    queryKey: ['xiaomi-status'],
    queryFn: system.xiaomiStatus,
    enabled: canQueryProtectedApi,
    retry: false,
    refetchInterval: canQueryProtectedApi ? 15000 : false,
  })

  const { data: dashboardSummary } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboard.get,
    enabled: canQueryProtectedApi,
    refetchInterval: canQueryProtectedApi ? 5000 : false,
    refetchIntervalInBackground: true,
    staleTime: 1000 * 10,
  })

  useEffect(() => {
    if (!canQueryProtectedApi) return

    const socket = getSocket()
    const handler = (data: unknown) => {
      queryClient.setQueryData(['dashboard'], data)
    }

    socket.on('dashboard', handler)
    return () => {
      socket.off('dashboard', handler)
    }
  }, [canQueryProtectedApi, queryClient])

  useEffect(() => {
    if (xiaomiStatus?.username && !xiaomiUsername) {
      setXiaomiUsername(xiaomiStatus.username)
    }
  }, [xiaomiStatus?.username, xiaomiUsername])

  useEffect(() => {
    const pendingFromServer = !!xiaomiStatus?.auth?.needsVerification
    const pendingFromStorage =
      typeof window !== 'undefined' &&
      window.sessionStorage.getItem(XIAOMI_VERIFICATION_STORAGE_KEY) === '1'

    if (xiaomiStatus?.loggedIn) {
      setVerificationPending(false)
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(XIAOMI_VERIFICATION_STORAGE_KEY)
      }
      return
    }

    if (pendingFromServer || pendingFromStorage) {
      setVerificationPending(true)
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(XIAOMI_VERIFICATION_STORAGE_KEY, '1')
      }
      return
    }

    setVerificationPending(false)
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(XIAOMI_VERIFICATION_STORAGE_KEY)
    }
  }, [xiaomiStatus?.auth?.needsVerification, xiaomiStatus?.loggedIn])

  useEffect(() => {
    if (!verificationPending) return
    if (xiaomiStatus?.auth?.verificationMethod === 'email_code') return

    const shouldRetryImmediately =
      !verificationWindowRef.current && !!xiaomiStatus?.auth?.needsVerification

    const retryLoginAfterVerification = async () => {
      if (verificationRetryingRef.current) return
      verificationRetryingRef.current = true
      setXiaomiLogging(true)
      try {
        const result = await system.xiaomiContinueLogin()
        if (result.loggedIn) {
          setVerificationPending(false)
          verificationWindowRef.current = null
          if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem(XIAOMI_VERIFICATION_STORAGE_KEY)
          }
          toast.success('米家账号登录成功')
          setXiaomiPassword('')
          void refetchXiaomiStatus()
        }
      } catch {
        const statusResult = await refetchXiaomiStatus()
        if (!statusResult.data?.auth?.needsVerification) {
          setVerificationPending(false)
          if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem(XIAOMI_VERIFICATION_STORAGE_KEY)
          }
        }
      } finally {
        setXiaomiLogging(false)
        verificationRetryingRef.current = false
      }
    }

    const handleFocus = () => {
      void retryLoginAfterVerification()
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void retryLoginAfterVerification()
      }
    }

    const timer = window.setInterval(() => {
      if (verificationWindowRef.current?.closed) {
        void retryLoginAfterVerification()
      }
    }, 1500)

    if (shouldRetryImmediately) {
      void retryLoginAfterVerification()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [verificationPending, refetchXiaomiStatus, xiaomiPassword, xiaomiUsername, xiaomiStatus?.auth?.needsVerification, xiaomiStatus?.auth?.verificationMethod])

  const updateSettingsMutation = useMutation({
    mutationFn: (data: Partial<SystemSettingsData>) =>
      system.updateSettings(data),
    onSuccess: () => {
      toast.success('操作成功')
      queryClient.invalidateQueries({ queryKey: ['system-settings'] })
    },
    onError: (error: Error) => {
      toast.error(error?.message || '操作失败')
    },
    onSettled: () => {
      setSaving(false)
    },
  })

  const getValue = <K extends keyof SystemSettingsData>(
    key: K,
    fallback?: SystemSettingsData[K]
  ): SystemSettingsData[K] | undefined => {
    if (formData[key] !== undefined) {
      return formData[key]
    }
    if (settings) {
      return settings[key]
    }
    return fallback
  }

  const getPercentValue = (
    key: 'alarmRatio80' | 'alarmRatio90' | 'alarmRatio95',
    fallbackRatio: number,
  ) => {
    const ratio = Number(getValue(key, fallbackRatio) ?? fallbackRatio)
    if (Number.isNaN(ratio)) return ''
    return ratio <= 1 ? ratio * 100 : ratio
  }

  const setValue = <K extends keyof SystemSettingsData>(
    key: K,
    value: SystemSettingsData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    if (!settings) return
    const merged: Partial<SystemSettingsData> = { ...settings, ...formData }
    setSaving(true)
    updateSettingsMutation.mutate(merged)
  }

  const handleXiaomiLogin = async () => {
    setXiaomiLogging(true)
    try {
      const result = await system.xiaomiLogin(
        xiaomiUsername.trim() || undefined,
        xiaomiPassword || undefined,
      )
      if (result.loggedIn) {
        toast.success(
          result.usedEnv ? '已使用服务器配置的账号登录成功' : '米家账号登录成功',
        )
        setVerificationPending(false)
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(XIAOMI_VERIFICATION_STORAGE_KEY)
        }
        setXiaomiPassword('')
      } else {
        toast.error('登录失败，请检查账号配置')
      }
      const statusResult = await refetchXiaomiStatus()
      const notificationUrl = statusResult.data?.auth?.notificationUrl
      const verificationMethod = statusResult.data?.auth?.verificationMethod
      if (verificationMethod === 'email_code' && !statusResult.data?.loggedIn) {
        setVerificationPending(true)
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(XIAOMI_VERIFICATION_STORAGE_KEY, '1')
        }
        toast.error('需要邮箱验证码，先点发送验证码，再输入验证码完成登录')
        return
      }
      if (notificationUrl && !statusResult.data?.loggedIn) {
        verificationWindowRef.current = window.open(notificationUrl, 'xiaomi-verification')
        setVerificationPending(true)
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(XIAOMI_VERIFICATION_STORAGE_KEY, '1')
        }
        toast.error('请在验证页完成验证，返回此页后系统会自动继续登录')
      }
    } catch (error: unknown) {
      const err = error as Error & { response?: { data?: { message?: string } } }
      const statusResult = await refetchXiaomiStatus()
      const notificationUrl = statusResult.data?.auth?.notificationUrl
      const verificationMethod = statusResult.data?.auth?.verificationMethod
      if (verificationMethod === 'email_code' && !statusResult.data?.loggedIn) {
        setVerificationPending(true)
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(XIAOMI_VERIFICATION_STORAGE_KEY, '1')
        }
        toast.error('需要邮箱验证码，先点发送验证码，再输入验证码完成登录')
        return
      }
      if (notificationUrl && !statusResult.data?.loggedIn) {
        verificationWindowRef.current = window.open(notificationUrl, 'xiaomi-verification')
        setVerificationPending(true)
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(XIAOMI_VERIFICATION_STORAGE_KEY, '1')
        }
        toast.error('请在验证页完成验证，返回此页后系统会自动继续登录')
        return
      }
      toast.error(err?.response?.data?.message || err?.message || '操作失败')
    } finally {
      setXiaomiLogging(false)
    }
  }

  const handleXiaomiSessionLogin = async () => {
    const sessionInput = {
      userId: xiaomiUserId.trim(),
      serviceToken: xiaomiServiceToken.trim(),
      ssecurity: xiaomiSsecurity.trim(),
      region: xiaomiRegion.trim() || 'cn',
    }

    if (!sessionInput.userId || !sessionInput.serviceToken || !sessionInput.ssecurity) {
      toast.error('请先填完整 userId、serviceToken、ssecurity')
      return
    }

    setXiaomiLogging(true)
    try {
      const result = await system.xiaomiLogin(undefined, undefined, sessionInput)
      if (result.loggedIn) {
        setVerificationPending(false)
        verificationWindowRef.current = null
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(XIAOMI_VERIFICATION_STORAGE_KEY)
        }
        await refetchXiaomiStatus()
        toast.success('米家会话登录成功')
        return
      }
      toast.error('米家会话登录失败')
    } catch (error: unknown) {
      const err = error as Error & { response?: { data?: { message?: string } } }
      toast.error(err?.response?.data?.message || err?.message || '米家会话登录失败')
    } finally {
      setXiaomiLogging(false)
    }
  }

  const handleXiaomiSendEmailCode = async () => {
    setXiaomiLogging(true)
    try {
      const result = await system.xiaomiSendEmailVerificationCode()
      if (result.sent) {
        setVerificationPending(true)
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(XIAOMI_VERIFICATION_STORAGE_KEY, '1')
        }
        await refetchXiaomiStatus()
        toast.success('米家验证码已发送，请查收邮箱')
        return
      }
      toast.error('米家验证码发送失败')
    } catch (error: unknown) {
      const err = error as Error & { response?: { data?: { message?: string } } }
      toast.error(err?.response?.data?.message || err?.message || '米家验证码发送失败')
    } finally {
      setXiaomiLogging(false)
    }
  }

  const handleXiaomiVerifyEmailCode = async () => {
    if (!xiaomiEmailCode.trim()) {
      toast.error('请先输入邮箱验证码')
      return
    }

    setXiaomiLogging(true)
    try {
      const result = await system.xiaomiVerifyEmailCode(xiaomiEmailCode.trim())
      if (result.loggedIn) {
        setVerificationPending(false)
        verificationWindowRef.current = null
        setXiaomiEmailCode('')
        setXiaomiPassword('')
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(XIAOMI_VERIFICATION_STORAGE_KEY)
        }
        await refetchXiaomiStatus()
        toast.success('米家账号登录成功')
        return
      }
      toast.error('米家验证码校验失败')
    } catch (error: unknown) {
      const err = error as Error & { response?: { data?: { message?: string } } }
      toast.error(err?.response?.data?.message || err?.message || '米家验证码校验失败')
      await refetchXiaomiStatus()
    } finally {
      setXiaomiLogging(false)
    }
  }

  const handleXiaomiContinue = async () => {
    setXiaomiLogging(true)
    try {
      const result = await system.xiaomiContinueLogin()
      if (result.loggedIn) {
        setVerificationPending(false)
        verificationWindowRef.current = null
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(XIAOMI_VERIFICATION_STORAGE_KEY)
        }
        setXiaomiPassword('')
        await refetchXiaomiStatus()
        toast.success('米家账号登录成功')
        return
      }
      toast.error('仍未完成米家验证')
    } catch (error: unknown) {
      const err = error as Error & { response?: { data?: { message?: string } } }
      toast.error(err?.response?.data?.message || err?.message || '米家继续登录失败')
      await refetchXiaomiStatus()
    } finally {
      setXiaomiLogging(false)
    }
  }

  const handleXiaomiSync = async () => {
    setXiaomiSyncing(true)
    try {
      await system.xiaomiSync()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['xiaomi-status'] }),
      ])
      toast.success('设备已同步到系统')
    } catch (error: unknown) {
      const err = error as Error
      toast.error(err?.message || '操作失败')
    } finally {
      setXiaomiSyncing(false)
    }
  }

  return (
    <div className="container mx-auto py-4 sm:py-6">
      <h1 className="mb-2 text-xl font-bold sm:text-2xl">
        <Settings className="inline-block mr-2 h-7 w-7" />
        系统设置
      </h1>
      <p className="text-muted-foreground mb-6">
        配置系统运行参数、预警阈值和米家智能设备同步。
      </p>

      {!canQueryProtectedApi ? (
        <div className="rounded-lg border bg-muted/40 p-6 text-sm text-muted-foreground">
          当前登录状态无效，请先重新登录后再进入系统设置。
        </div>
      ) : (

      <Tabs defaultValue="params" className="w-full">
        <TabsList className="mb-6 h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="params" className="text-xs sm:text-sm">系统参数</TabsTrigger>
          <TabsTrigger value="devices" className="text-xs sm:text-sm">已识别设备</TabsTrigger>
          {canManageXiaomi && <TabsTrigger value="xiaomi" className="text-xs sm:text-sm">米家同步</TabsTrigger>}
        </TabsList>

        <TabsContent value="params">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">加载中...</div>
          ) : settings ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">系统参数配置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="alarm80">80% 预警阈值 (%)</Label>
                    <Input
                      id="alarm80"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={getPercentValue('alarmRatio80', 0.8)}
                      onChange={(e) =>
                        setValue('alarmRatio80', (parseFloat(e.target.value) || 0) / 100)
                      }
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="alarm90">90% 预警阈值 (%)</Label>
                    <Input
                      id="alarm90"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={getPercentValue('alarmRatio90', 0.9)}
                      onChange={(e) =>
                        setValue('alarmRatio90', (parseFloat(e.target.value) || 0) / 100)
                      }
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="alarm95">95% 预警阈值 (%)</Label>
                    <Input
                      id="alarm95"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={getPercentValue('alarmRatio95', 0.95)}
                      onChange={(e) =>
                        setValue('alarmRatio95', (parseFloat(e.target.value) || 0) / 100)
                      }
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="refreshInterval">数据刷新间隔</Label>
                    <Select
                      value={String(getValue('refreshInterval', 5000) ?? 5000)}
                      onValueChange={(val) =>
                        setValue('refreshInterval', parseInt(val, 10))
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger id="refreshInterval">
                        <SelectValue placeholder="选择间隔" />
                      </SelectTrigger>
                      <SelectContent>
                        {REFRESH_INTERVAL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="businessTimezone">业务时区</Label>
                    <Select
                      value={String(getValue('businessTimezone', 'Europe/Vienna') ?? 'Europe/Vienna')}
                      onValueChange={(val) =>
                        setValue('businessTimezone', val)
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger id="businessTimezone">
                        <SelectValue placeholder="选择时区" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dailyResetHour">每日清零时间</Label>
                    <Select
                      value={String(getValue('dailyResetHour', 0) ?? 0)}
                      onValueChange={(val) =>
                        setValue('dailyResetHour', parseInt(val, 10))
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger id="dailyResetHour">
                        <SelectValue placeholder="选择时间" />
                      </SelectTrigger>
                      <SelectContent>
                        {HOUR_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pricePerKwh">电价 (欧元/度)</Label>
                    <Input
                      id="pricePerKwh"
                      type="number"
                      min="0"
                      step="0.01"
                      value={getValue('pricePerKwh', 0.6) ?? ''}
                      onChange={(e) =>
                        setValue('pricePerKwh', parseFloat(e.target.value) || 0)
                      }
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  这里选的是系统结算时区。米家云还是走国内服务器，但“今天/昨天/7天/30天/清零时间”都会按这里算。
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={handleSave} disabled={!canEdit || saving}>
                    {saving ? (
                      <Save className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    保存设置
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="p-8 text-center text-muted-foreground">暂无数据</div>
          )}
        </TabsContent>

        <TabsContent value="devices">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">已识别设备</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                当前已识别 <span className="font-semibold text-foreground">{dashboardSummary?.totalDevices ?? 0}</span> 台设备。
                现在默认按 1 台设备 = 1 个独立空间展示。你只需要把名称改成房间名或区域名，不需要再做额外绑定。
              </div>
              <div className="rounded-lg border border-dashed bg-background p-3 text-sm text-muted-foreground">
                直接在下方“空间名称”这一列里，点每一行名称右侧的 <span className="font-medium text-foreground">改名</span> 按钮即可修改。
              </div>
              <DevicesTable
                devices={dashboardSummary?.devices ?? []}
                invalidateOnChange={async () => {
                  await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
                  await queryClient.invalidateQueries({ queryKey: ['xiaomi-status'] })
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {canManageXiaomi && (
        <TabsContent value="xiaomi">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Power className="h-5 w-5" />
                  米家账号状态
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 max-w-2xl">
                <Tabs defaultValue="session" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="session">会话登录</TabsTrigger>
                    <TabsTrigger value="password">密码验证</TabsTrigger>
                  </TabsList>

                  <TabsContent value="session" className="mt-4">
                    <div className="rounded-lg border bg-background p-4 space-y-4">
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="xiaomi-user-id">userId</Label>
                          <Input
                            id="xiaomi-user-id"
                            type="text"
                            placeholder="请输入 userId"
                            value={xiaomiUserId}
                            onChange={(e) => setXiaomiUserId(e.target.value)}
                            disabled={!canManageXiaomi || xiaomiLogging}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="xiaomi-service-token">serviceToken</Label>
                          <Input
                            id="xiaomi-service-token"
                            type="text"
                            placeholder="请输入 serviceToken"
                            value={xiaomiServiceToken}
                            onChange={(e) => setXiaomiServiceToken(e.target.value)}
                            disabled={!canManageXiaomi || xiaomiLogging}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="xiaomi-ssecurity">ssecurity</Label>
                          <Input
                            id="xiaomi-ssecurity"
                            type="text"
                            placeholder="请输入 ssecurity"
                            value={xiaomiSsecurity}
                            onChange={(e) => setXiaomiSsecurity(e.target.value)}
                            disabled={!canManageXiaomi || xiaomiLogging}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="xiaomi-region">region</Label>
                          <Select
                            value={xiaomiRegion}
                            onValueChange={setXiaomiRegion}
                            disabled={!canManageXiaomi || xiaomiLogging}
                          >
                            <SelectTrigger id="xiaomi-region">
                              <SelectValue placeholder="选择区域" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cn">中国大陆（cn）</SelectItem>
                              <SelectItem value="de">德国（de）</SelectItem>
                              <SelectItem value="sg">新加坡（sg）</SelectItem>
                              <SelectItem value="us">美国（us）</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          onClick={handleXiaomiSessionLogin}
                          disabled={!canManageXiaomi || xiaomiLogging}
                        >
                          {xiaomiLogging ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <LogIn className="mr-2 h-4 w-4" />
                          )}
                          会话登录米家
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="password" className="mt-4">
                    <div className="rounded-lg border bg-background p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="xiaomi-username">米家账号</Label>
                          <Input
                            id="xiaomi-username"
                            type="text"
                            placeholder="手机号 / 邮箱"
                            autoComplete="username"
                            value={xiaomiUsername}
                            onChange={(e) => setXiaomiUsername(e.target.value)}
                            disabled={!canManageXiaomi || xiaomiLogging}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="xiaomi-password">米家密码</Label>
                          <Input
                            id="xiaomi-password"
                            type="password"
                            placeholder="请输入米家独立密码"
                            autoComplete="current-password"
                            value={xiaomiPassword}
                            onChange={(e) => setXiaomiPassword(e.target.value)}
                            disabled={!canManageXiaomi || xiaomiLogging}
                          />
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        这条链路现在不稳定。优先用上面的会话登录；这里只保留作备用排查。
                      </p>
                      {verificationPending && xiaomiStatus?.auth?.verificationMethod === 'email_code' ? (
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor="xiaomi-email-code">邮箱验证码</Label>
                            <Input
                              id="xiaomi-email-code"
                              type="text"
                              placeholder="请输入邮箱收到的验证码"
                              value={xiaomiEmailCode}
                              onChange={(e) => setXiaomiEmailCode(e.target.value)}
                              disabled={!canManageXiaomi || xiaomiLogging}
                            />
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleXiaomiSendEmailCode}
                              disabled={!canManageXiaomi || xiaomiLogging}
                            >
                              发送验证码
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={handleXiaomiVerifyEmailCode}
                              disabled={!canManageXiaomi || xiaomiLogging}
                            >
                              提交验证码
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-3 pt-1">
                        <Button
                          onClick={handleXiaomiLogin}
                          disabled={!canManageXiaomi || xiaomiLogging}
                        >
                          {xiaomiLogging ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <LogIn className="mr-2 h-4 w-4" />
                          )}
                          {xiaomiStatus?.loggedIn ? '重新登录米家' : '登录米家账号'}
                        </Button>
                        {xiaomiStatus?.auth?.notificationUrl &&
                        !xiaomiStatus?.loggedIn &&
                        xiaomiStatus?.auth?.verificationMethod !== 'email_code' ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              verificationWindowRef.current = window.open(
                                xiaomiStatus.auth?.notificationUrl,
                                'xiaomi-verification',
                              )
                              setVerificationPending(true)
                              if (typeof window !== 'undefined') {
                                window.sessionStorage.setItem(XIAOMI_VERIFICATION_STORAGE_KEY, '1')
                              }
                            }}
                            disabled={!canManageXiaomi || xiaomiLogging}
                          >
                            打开验证页
                          </Button>
                        ) : null}
                        {verificationPending && !xiaomiStatus?.loggedIn && xiaomiStatus?.auth?.verificationMethod !== 'email_code' ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={handleXiaomiContinue}
                            disabled={!canManageXiaomi || xiaomiLogging}
                          >
                            我已完成验证
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    登录状态：
                  </span>
                  {xiaomiStatus?.loggedIn ? (
                    <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      已登录
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3.5 w-3.5" />
                      未登录
                    </Badge>
                  )}
                  {xiaomiStatus?.username && (
                    <span className="text-sm text-muted-foreground">
                      账号：{xiaomiStatus.username}
                    </span>
                  )}
                  {verificationPending && (
                    <Badge variant="secondary" className="gap-1">
                      <Info className="h-3.5 w-3.5" />
                      验证完成后会自动继续登录
                    </Badge>
                  )}
                </div>

                {xiaomiStatus?.auth && (
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        最近一次登录结果：
                      </span>
                      <Badge variant={xiaomiStatus.auth.needsVerification ? 'secondary' : xiaomiStatus.auth.state === 'logged_in' ? 'default' : 'destructive'}>
                        {xiaomiStatus.auth.state === 'logged_in'
                          ? '已登录成功'
                          : xiaomiStatus.auth.needsVerification
                            ? '需要安全验证'
                            : xiaomiStatus.auth.state === 'error'
                              ? '登录失败'
                              : '等待登录'}
                      </Badge>
                    </div>

                    {xiaomiStatus.auth.message && (
                      <p className="text-sm text-muted-foreground">
                        {xiaomiStatus.auth.message}
                      </p>
                    )}
                    {xiaomiStatus.auth.lastAttemptAt && (
                      <p className="text-xs text-muted-foreground">
                        最近尝试时间：{new Date(xiaomiStatus.auth.lastAttemptAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  同步设备
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  点击下方按钮，立即从米家云端同步所有智能设备状态到本系统。同步后可以在仪表盘中查看最新的用电量数据。
                </p>
                <div>
                  <Button
                    onClick={handleXiaomiSync}
                    disabled={!canManageXiaomi || xiaomiSyncing}
                  >
                    {xiaomiSyncing ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {xiaomiSyncing ? '同步中...' : '立即同步米家设备'}
                  </Button>
                </div>
                <div className="mt-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">适配器信息</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>当前适配器：XiaomiAdapter</li>
                    <li>版本：V1.0</li>
                    <li>说明：只封装官方集成协议，数据安全可靠</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        )}
      </Tabs>
      )}
    </div>
  )
}
