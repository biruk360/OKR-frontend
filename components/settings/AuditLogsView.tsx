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
        <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Security and compliance log of admin and system actions.
        </p>
      </div>

      {/* Search */}
      <div className="bg-card p-4 rounded-lg border border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
      <div className="bg-card shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Key
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Value
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {filteredLogs.map((log) => (
              <tr key={log.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
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
                <td className="px-6 py-4 text-sm text-foreground">
                  {log.key}
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {log.value.length > 50 ? `${log.value.substring(0, 50)}...` : log.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredLogs.length === 0 && (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <Settings className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-medium text-foreground">No audit logs found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchTerm ? 'Try a different search term.' : 'Audit logs will appear here as actions are performed.'}
          </p>
        </div>
      )}
    </div>
  )
}

