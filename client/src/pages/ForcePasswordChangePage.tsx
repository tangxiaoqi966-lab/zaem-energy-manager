import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Button } from '../components/ui/button'
import { auth } from '../lib/api'
import { useAuthStore } from '../store/auth'

export function ForcePasswordChangePage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const setAuth = useAuthStore((state) => state.setAuth)

  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    currentPassword: '',
    newUsername: user?.username ?? '',
    newName: user?.name ?? '',
    newPassword: '',
    confirmPassword: '',
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!user?.username) {
      toast.error('当前登录状态异常，请重新登录')
      return
    }

    if (!form.currentPassword || !form.newUsername.trim() || !form.newPassword) {
      toast.error('请先填完整当前密码、新账号和新密码')
      return
    }

    if (form.newPassword.length < 8) {
      toast.error('新密码至少需要 8 位')
      return
    }

    if (form.newPassword !== form.confirmPassword) {
      toast.error('两次输入的新密码不一致')
      return
    }

    setLoading(true)
    try {
      const result = await auth.forceChangePassword({
        username: user.username,
        currentPassword: form.currentPassword,
        newUsername: form.newUsername.trim(),
        newPassword: form.newPassword,
        newName: form.newName.trim() || undefined,
      })

      setAuth(result.token, result.user, false)
      toast.success('超级管理员账号密码已更新')
      navigate('/', { replace: true })
    } catch (error: unknown) {
      const err = error as Error
      toast.error(err?.message || '修改失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-2xl">
            <ShieldAlert className="h-6 w-6 text-amber-500" />
            首次登录请立即修改超级管理员账号
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            当前仍是临时超级管理员凭据。为了后续安全使用，必须先修改账号和密码，修改完成后才允许进入系统。
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">当前密码</Label>
              <Input
                id="current-password"
                type="password"
                value={form.currentPassword}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                }
                autoComplete="current-password"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-username">新用户名</Label>
                <Input
                  id="new-username"
                  value={form.newUsername}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setForm((prev) => ({ ...prev, newUsername: e.target.value }))
                  }
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-name">显示名称</Label>
                <Input
                  id="new-name"
                  value={form.newName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setForm((prev) => ({ ...prev, newName: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-password">新密码</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={form.newPassword}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setForm((prev) => ({ ...prev, newPassword: e.target.value }))
                  }
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">确认新密码</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                  }
                  autoComplete="new-password"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '保存中...' : '确认修改并进入系统'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
