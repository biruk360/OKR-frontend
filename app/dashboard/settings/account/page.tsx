'use client'

import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { Download, Trash2, Key } from 'lucide-react'

export default function AccountSettingsPage() {
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleChangePassword = async () => {
    setIsChangingPassword(true)
    // TODO: Implement password change functionality
    setTimeout(() => {
      setIsChangingPassword(false)
      toast.success('Password change functionality coming soon')
    }, 1000)
  }

  const handleExportData = async () => {
    setIsExporting(true)
    // TODO: Implement data export functionality
    setTimeout(() => {
      setIsExporting(false)
      toast.success('Data export functionality coming soon')
    }, 1000)
  }

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return
    }
    
    setIsDeleting(true)
    // TODO: Implement account deletion functionality
    setTimeout(() => {
      setIsDeleting(false)
      toast.error('Account deletion functionality coming soon')
    }, 1000)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Account Actions
          </h3>
          <div className="space-y-3">
            <button
              onClick={handleChangePassword}
              disabled={isChangingPassword}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Key className="mr-2 h-4 w-4" />
              {isChangingPassword ? 'Changing...' : 'Change Password'}
            </button>
            <button
              onClick={handleExportData}
              disabled={isExporting}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? 'Exporting...' : 'Export Data'}
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeleting ? 'Deleting...' : 'Delete Account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

