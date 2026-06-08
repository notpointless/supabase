import { LOCAL_STORAGE_KEYS } from 'common'
import { useRouter } from 'next/router'
import { toast } from 'sonner'

import { LogicalBackupCliInstructions } from '@/components/layouts/ProjectLayout/LogicalBackupCliInstructions'
import { TextConfirmModal } from '@/components/ui/TextConfirmModalWrapper'
import type { OrgProject } from '@/data/projects/org-projects-infinite-query'
import { useProjectDeleteMutation } from '@/data/projects/project-delete-mutation'
import { useLocalStorageQuery } from '@/hooks/misc/useLocalStorage'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { useSelectedProjectQuery } from '@/hooks/misc/useSelectedProject'
import type { Organization } from '@/types'

// [console fork] Self-host has no churn/exit survey — deleting a project just needs the
// typed confirmation. The hosted-Supabase "What made you decide to delete?" survey is removed.
export const DeleteProjectModal = ({
  visible,
  onClose,
  project: projectProp,
  organization: organizationProp,
}: {
  visible: boolean
  onClose: () => void
  project?: OrgProject
  organization?: Organization
}) => {
  const router = useRouter()
  const { data: projectFromQuery } = useSelectedProjectQuery()
  const { data: organizationFromQuery } = useSelectedOrganizationQuery()

  // Use props if provided, otherwise fall back to hooks
  const project = projectProp || projectFromQuery
  const organization = organizationProp || organizationFromQuery

  const [lastVisitedOrganization] = useLocalStorageQuery(
    LOCAL_STORAGE_KEYS.LAST_VISITED_ORGANIZATION,
    ''
  )

  const projectRef = project?.ref

  const { mutate: deleteProject, isPending: isDeleting } = useProjectDeleteMutation({
    onSuccess: async () => {
      toast.success(`Successfully deleted ${project?.name}`)

      // Only redirect if still viewing the deleted project
      if (router.asPath.startsWith(`/project/${projectRef}`)) {
        if (lastVisitedOrganization) {
          router.push(`/org/${lastVisitedOrganization}`)
        } else {
          router.push('/organizations')
        }
      }
    },
  })

  async function handleDeleteProject() {
    if (project === undefined) return
    deleteProject({ projectRef: project.ref, organizationSlug: organization?.slug })
  }

  return (
    <TextConfirmModal
      visible={visible}
      loading={isDeleting}
      size="medium"
      title={`Confirm deletion of ${project?.name}`}
      variant="destructive"
      alert={{
        title: 'This action cannot be undone.',
        description: 'All project data will be lost, and cannot be undone.',
      }}
      text={`This will permanently delete the ${project?.name} project and all of its data.`}
      confirmPlaceholder="Type the project name in here"
      confirmString={project?.name || ''}
      confirmLabel="I understand, delete this project"
      onConfirm={handleDeleteProject}
      onCancel={() => {
        if (!isDeleting) onClose()
      }}
    >
      <div className="space-y-6">
        <LogicalBackupCliInstructions enabled={visible} showResetPassword={false} />
      </div>
    </TextConfirmModal>
  )
}
