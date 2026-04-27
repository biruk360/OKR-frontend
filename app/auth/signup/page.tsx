'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Mail, Lock, User, Building, Target } from 'lucide-react'
import toast from 'react-hot-toast'

export default function SignUpPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'EMPLOYEE' as const,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success('Account created. Please sign in.')
        router.push('/auth/signin')
      } else {
        toast.error(data.error || 'Failed to create account')
      }
    } catch {
      toast.error('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const inputCls =
    'w-full rounded-[10px] border-0 pl-9 pr-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[color:var(--ap-accent)]'
  const inputStyle = { background: 'rgba(120,120,128,0.06)' } as const

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: 'var(--ap-bg)' }}
    >
      <div
        className="w-full max-w-[420px] rounded-[14px] border bg-card p-8 shadow-lg"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <div className="flex flex-col items-center">
          <div
            className="flex size-11 items-center justify-center rounded-[10px]"
            style={{ background: 'var(--ap-accent-soft)' }}
          >
            <Target className="size-5" style={{ color: 'var(--ap-accent)' }} strokeWidth={2} />
          </div>
          <h1
            className="mt-4 text-[22px] font-semibold leading-tight"
            style={{ letterSpacing: '-0.02em' }}
          >
            Create your account
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Get started with OKR tracking</p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-[12px] font-medium mb-1.5">Full name</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input id="name" name="name" type="text" required value={formData.name} onChange={handleInputChange}
                className={inputCls} style={inputStyle} placeholder="Jane Doe" />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-[12px] font-medium mb-1.5">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input id="email" name="email" type="email" required value={formData.email} onChange={handleInputChange}
                className={inputCls} style={inputStyle} placeholder="you@example.com" />
            </div>
          </div>

          <div>
            <label htmlFor="role" className="block text-[12px] font-medium mb-1.5">Role</label>
            <div className="relative">
              <Building className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <select id="role" name="role" value={formData.role} onChange={handleInputChange}
                className={inputCls} style={inputStyle}>
                <option value="EMPLOYEE">Employee</option>
                <option value="DEPARTMENT_LEAD">Department Lead</option>
                <option value="EXECUTIVE">Executive</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-[12px] font-medium mb-1.5">Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} required
                value={formData.password} onChange={handleInputChange}
                className={inputCls + ' pr-9'} style={inputStyle} placeholder="At least 8 characters" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-[12px] font-medium mb-1.5">Confirm password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input id="confirmPassword" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} required
                value={formData.confirmPassword} onChange={handleInputChange}
                className={inputCls + ' pr-9'} style={inputStyle} placeholder="Re-enter password" />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isLoading}
            className="w-full rounded-[10px] py-2.5 text-[13px] font-semibold text-white transition disabled:opacity-60"
            style={{ background: 'var(--ap-accent)' }}>
            {isLoading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-[12px] text-muted-foreground">
          Already have an account?{' '}
          <Link href="/auth/signin" className="font-semibold hover:underline" style={{ color: 'var(--ap-accent)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
