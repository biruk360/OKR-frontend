'use client'

import { useState } from 'react'
import { Plus, Edit, Trash2, Users, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import CreateTeamModal from './CreateTeamModal'
import EditTeamModal from './EditTeamModal'
import DeleteTeamModal from './DeleteTeamModal'

interface TeamsManagementProps {
  initialDepartments: any[]
}

export default function TeamsManagement({ initialDepartments }: TeamsManagementProps) {
  const [departments, setDepartments] = useState(initialDepartments)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<any>(null)
  const [deletingTeam, setDeletingTeam] = useState<any>(null)

  const handleTeamCreated = async () => {
    const response = await fetch('/api/departments')
    const data = await response.json()
    if (data.success) {
      setDepartments(data.data)
      setIsCreateModalOpen(false)
      toast.success('Team created successfully')
    }
  }

  const handleTeamUpdated = async () => {
    const response = await fetch('/api/departments')
    const data = await response.json()
    if (data.success) {
      setDepartments(data.data)
      setEditingTeam(null)
      toast.success('Team updated successfully')
    }
  }

  const handleTeamDeleted = async () => {
    const response = await fetch('/api/departments')
    const data = await response.json()
    if (data.success) {
      setDepartments(data.data)
      setDeletingTeam(null)
      toast.success('Team deleted successfully')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage teams (departments) in your organization.
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Team
        </button>
      </div>

      {/* Teams List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Team Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Members
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Objectives
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {departments.map((department) => (
              <tr key={department.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                    <div className="text-sm font-medium text-gray-900">{department.name}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center text-sm text-gray-500">
                    <Users className="h-4 w-4 mr-1" />
                    {department._count.memberships}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {department._count.objectives}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    department.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {department.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end space-x-2">
                    <button
                      onClick={() => setEditingTeam(department)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeletingTeam(department)}
                      className="text-red-600 hover:text-red-900"
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
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Building2 className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No teams found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating your first team.
          </p>
        </div>
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

