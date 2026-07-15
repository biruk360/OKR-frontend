'use client'

import { useEffect, useState } from 'react'
import { Search, User } from 'lucide-react'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PortfolioDashboardFilters } from '@/lib/projects/portfolio-dashboard'

interface Props {
  filters: PortfolioDashboardFilters
  onChange: (filters: PortfolioDashboardFilters) => void
}

export function PortfolioFilters({ filters, onChange }: Props) {
  const { users } = useUsersForSelection()
  const [client, setClient] = useState(filters.client ?? '')

  useEffect(() => {
    const t = setTimeout(() => {
      onChange({ ...filters, client: client || undefined })
    }, 300)
    return () => clearTimeout(t)
  }, [client])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-tertiary" />
        <input
          type="text"
          placeholder="Filter by client…"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          className="input h-8 w-48 pl-9 text-sm"
        />
      </div>

      <Select
        value={filters.projectManagerId ?? 'all'}
        onValueChange={(value) => onChange({ ...filters, projectManagerId: value === 'all' ? undefined : value })}
      >
        <SelectTrigger className="h-8 w-48" size="sm">
          <User className="mr-1 size-4 text-ink-tertiary" />
          <SelectValue placeholder="Project manager" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All PMs</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
