'use client'

import { useState } from 'react'
import { Search, Calendar, User, Settings } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface AuditLogsViewProps {
  initialLogs: any[]
}

export default function AuditLogsView({ initialLogs }: AuditLogsViewProps) {
  const [logs] = useState(initialLogs)
  const [searchTerm, setSearchTerm] = useState('')

  const filteredLogs = logs.filter(log =>
    log.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.value.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Security and compliance log of admin and system actions.
        </p>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search audit logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 input w-full"
          />
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Key
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredLogs.map((log) => (
              <tr key={log.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    {formatDate(log.updatedAt, 'MMM dd, yyyy HH:mm')}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    <Settings className="h-3 w-3 mr-1" />
                    Settings Change
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {log.key}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {log.value.length > 50 ? `${log.value.substring(0, 50)}...` : log.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredLogs.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Settings className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No audit logs found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm ? 'Try a different search term.' : 'Audit logs will appear here as actions are performed.'}
          </p>
        </div>
      )}
    </div>
  )
}

