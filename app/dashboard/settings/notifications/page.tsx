'use client'

import { useState } from 'react'
import { toast } from 'react-hot-toast'

export default function NotificationsSettingsPage() {
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [inAppNotifications, setInAppNotifications] = useState(true)
  const [weeklyReports, setWeeklyReports] = useState(false)

  const handleToggle = async (setting: string, value: boolean) => {
    // TODO: Implement API call to save notification preferences
    toast.success(`${setting} ${value ? 'enabled' : 'disabled'}`)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Notification Preferences
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">Email Notifications</div>
                <div className="text-sm text-gray-500">Receive notifications via email</div>
              </div>
              <button
                onClick={() => {
                  const newValue = !emailNotifications
                  setEmailNotifications(newValue)
                  handleToggle('Email notifications', newValue)
                }}
                className={`
                  relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                  ${emailNotifications ? 'bg-blue-600' : 'bg-gray-200'}
                `}
              >
                <span
                  className={`
                    inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                    ${emailNotifications ? 'translate-x-5' : 'translate-x-0'}
                  `}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">In-App Notifications</div>
                <div className="text-sm text-gray-500">Receive notifications in the application</div>
              </div>
              <button
                onClick={() => {
                  const newValue = !inAppNotifications
                  setInAppNotifications(newValue)
                  handleToggle('In-app notifications', newValue)
                }}
                className={`
                  relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                  ${inAppNotifications ? 'bg-blue-600' : 'bg-gray-200'}
                `}
              >
                <span
                  className={`
                    inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                    ${inAppNotifications ? 'translate-x-5' : 'translate-x-0'}
                  `}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">Weekly Reports</div>
                <div className="text-sm text-gray-500">Receive weekly OKR progress reports</div>
              </div>
              <button
                onClick={() => {
                  const newValue = !weeklyReports
                  setWeeklyReports(newValue)
                  handleToggle('Weekly reports', newValue)
                }}
                className={`
                  relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                  ${weeklyReports ? 'bg-blue-600' : 'bg-gray-200'}
                `}
              >
                <span
                  className={`
                    inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                    ${weeklyReports ? 'translate-x-5' : 'translate-x-0'}
                  `}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

