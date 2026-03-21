'use client'

import { useState } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Mail, Lock, Info, ChevronDown, ChevronUp } from 'lucide-react'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showTestAccounts, setShowTestAccounts] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid email or password')
      } else {
        // Get the updated session to check user role
        const session = await getSession()
        if (session) {
          router.push('/dashboard')
          router.refresh()
        }
      }
    } catch (error) {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-primary-100">
            <Lock className="h-6 w-6 text-primary-600" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link
              href="/auth/signup"
              className="font-medium text-primary-600 hover:text-primary-500"
            >
              create a new account
            </Link>
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-md">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-10"
                  placeholder="Enter your email"
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10 pr-10"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                Remember me
              </label>
            </div>

            <div className="text-sm">
              <a href="#" className="font-medium text-primary-600 hover:text-primary-500">
                Forgot your password?
              </a>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Signing in...
                </div>
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        </form>

        {/* Test Account Credentials */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowTestAccounts(!showTestAccounts)}
            className="w-full flex items-center justify-between p-3 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
          >
            <div className="flex items-center">
              <Info className="h-4 w-4 mr-2 text-blue-500" />
              <span className="font-medium">Test Account Credentials</span>
            </div>
            {showTestAccounts ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showTestAccounts && (
            <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs font-semibold text-blue-900 mb-3">All test accounts use password: <code className="bg-blue-100 px-1 py-0.5 rounded">admin123</code></p>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 bg-white rounded border border-blue-100">
                  <div>
                    <span className="font-medium text-gray-900">Admin</span>
                    <span className="text-gray-500 ml-2">admin@company.com</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('admin@company.com')
                      setPassword('admin123')
                    }}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Use
                  </button>
                </div>
                <div className="flex items-center justify-between p-2 bg-white rounded border border-blue-100">
                  <div>
                    <span className="font-medium text-gray-900">CEO (Executive)</span>
                    <span className="text-gray-500 ml-2">ceo@company.com</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('ceo@company.com')
                      setPassword('admin123')
                    }}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Use
                  </button>
                </div>
                <div className="flex items-center justify-between p-2 bg-white rounded border border-blue-100">
                  <div>
                    <span className="font-medium text-gray-900">Engineering Lead</span>
                    <span className="text-gray-500 ml-2">engineering.lead@company.com</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('engineering.lead@company.com')
                      setPassword('admin123')
                    }}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Use
                  </button>
                </div>
                <div className="flex items-center justify-between p-2 bg-white rounded border border-blue-100">
                  <div>
                    <span className="font-medium text-gray-900">Marketing Lead</span>
                    <span className="text-gray-500 ml-2">marketing.lead@company.com</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('marketing.lead@company.com')
                      setPassword('admin123')
                    }}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Use
                  </button>
                </div>
                <div className="flex items-center justify-between p-2 bg-white rounded border border-blue-100">
                  <div>
                    <span className="font-medium text-gray-900">Sales Lead</span>
                    <span className="text-gray-500 ml-2">sales.lead@company.com</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('sales.lead@company.com')
                      setPassword('admin123')
                    }}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Use
                  </button>
                </div>
                <div className="flex items-center justify-between p-2 bg-white rounded border border-blue-100">
                  <div>
                    <span className="font-medium text-gray-900">Employee</span>
                    <span className="text-gray-500 ml-2">engineer1@company.com</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('engineer1@company.com')
                      setPassword('admin123')
                    }}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Use
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
