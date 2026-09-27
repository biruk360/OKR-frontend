'use client'

import { useState } from 'react'
import { Plus, Edit, Trash2, Users, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import CreateTeamModal from './CreateTeamModal'
import EditTeamModal from './EditTeamModal'
import DeleteTeamModal from './DeleteTeamModal'
import { useDepartments } from '@/hooks'
import { Button, EmptyState, PageHeader } from '@/components/ui'

interface TeamsManagementProps {
  initialDepartments: any[]
}

export default function TeamsManagement({ initialDepartments }: TeamsManagementProps) {
  // Share the departments cache with every other consumer (modals, MyOKRsPage, etc.).
  // `initialDepartments` was previously SSR-hydrated local state; we now drive the
  // list through React Query so a mutation here immediately propagates.
  const { departments: hookDepartments, refetch } = useDepartments()
  const departments = hookDepartments.length > 0 ? hookDepartments : initialDepartments

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<any>(null)
  const [deletingTeam, setDeletingTeam] = useState<any>(null)

  const handleTeamCreated = async () => {
    await refetch()
    setIsCreateModalOpen(false)
    toast.success('Team created successfully')
  }

  const handleTeamUpdated = async () => {
    await refetch()
    setEditingTeam(null)
    toast.success('Team updated successfully')
  }

  const handleTeamDeleted = async () => {
    await refetch()
    setDeletingTeam(null)
    toast.success('Team deleted successfully')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title="Team Management"
        description="Create and manage teams (departments) in your organization."
        actions={
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="size-4" />
            Create Team
          </Button>
        }
      />

      {/* Teams List */}
      <div className="bg-card shadow rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Team Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Members
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Objectives
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {departments.map((department) => (
              <tr key={department.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <Building2 className="h-5 w-5 text-muted-foreground mr-2" />
                    <div className="text-sm font-medium text-foreground">{department.name}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Users className="h-4 w-4 mr-1" />
                    {department._count.memberships}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                  {department._count.objectives}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    department.isActive
                      ? 'bg-success-100 text-success-800'
                      : 'bg-muted text-foreground'
                  }`}>
                    {department.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end space-x-2">
                    <button
                      onClick={() => setEditingTeam(department)}
                      aria-label={`Edit ${department.name}`}
                      className="text-primary-600 hover:text-primary-900"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeletingTeam(department)}
                      aria-label={`Delete ${department.name}`}
                      className="text-danger-600 hover:text-danger-900"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {departments.length === 0 && (
        <EmptyState
          icon={Building2}
          title="No teams found"
          description="Get started by creating your first team."
        />
      )}

      {/* Modals */}
      {isCreateModalOpen && (
        <CreateTeamModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onTeamCreated={handleTeamCreated}
        />
      )}

      {editingTeam && (
        <EditTeamModal
          isOpen={!!editingTeam}
          onClose={() => setEditingTeam(null)}
          team={editingTeam}
          onTeamUpdated={handleTeamUpdated}
        />
      )}

      {deletingTeam && (
        <DeleteTeamModal
          isOpen={!!deletingTeam}
          onClose={() => setDeletingTeam(null)}
          team={deletingTeam}
          onTeamDeleted={handleTeamDeleted}
        />
      )}
    </div>
  )
}

