import { useQueryClient } from '@tanstack/react-query'
import { LOCAL_STORAGE_KEYS } from 'common'
import { useState } from 'react'
import { toast } from 'sonner'
import { Input } from 'ui'
import ConfirmationModal from 'ui-patterns/Dialogs/ConfirmationModal'
import { FormItemLayout } from 'ui-patterns/form/FormItemLayout/FormItemLayout'

import { organizationKeys } from '@/data/organizations/keys'
import { useMfaUnenrollMutation } from '@/data/profile/mfa-unenroll-mutation'
import { useLocalStorageQuery } from '@/hooks/misc/useLocalStorage'

interface DeleteFactorModalProps {
  visible: boolean
  factorId: string | null
  lastFactorToBeDeleted: boolean
  onClose: () => void
}

const DeleteFactorModal = ({
  visible,
  factorId,
  lastFactorToBeDeleted,
  onClose,
}: DeleteFactorModalProps) => {
  const queryClient = useQueryClient()
  // [console fork] better-auth requires the account password to disable 2FA.
  const [password, setPassword] = useState('')
  const [lastVisitedOrganization] = useLocalStorageQuery(
    LOCAL_STORAGE_KEYS.LAST_VISITED_ORGANIZATION,
    ''
  )

  const close = () => {
    setPassword('')
    onClose()
  }

  const { mutate: unenroll, isPending } = useMfaUnenrollMutation({
    onSuccess: async () => {
      if (lastVisitedOrganization) {
        await queryClient.invalidateQueries({
          queryKey: organizationKeys.members(lastVisitedOrganization),
        })
      }
      toast.success(`Successfully deleted factor`)
      close()
    },
  })

  return (
    <ConfirmationModal
      size="medium"
      visible={visible}
      variant={'destructive'}
      title="Confirm to delete factor"
      confirmLabel="Delete"
      confirmLabelLoading="Deleting"
      loading={isPending}
      onCancel={close}
      onConfirm={() => factorId && unenroll({ factorId, password })}
      alert={{
        title: lastFactorToBeDeleted
          ? 'Multi-factor authentication will be disabled'
          : 'This action cannot be undone',
        description: lastFactorToBeDeleted
          ? 'There are no other factors that are set up once you delete this factor, as such your account will no longer be guarded by multi-factor authentication'
          : 'You will no longer be able to use this authenticator app for multi-factor authentication when signing in to the dashboard',
      }}
    >
      <p className="text-sm">Before deleting this factor, consider:</p>
      <ul className="text-sm text-foreground-light py-1 list-disc mx-4 space-y-1">
        {lastFactorToBeDeleted ? (
          <>
            <li>Adding another authenticator app as a factor prior to deleting</li>
            <li>Ensure that your account does not need multi-factor authentication</li>
            <li>
              You will lose access to any organization that enforces multi-factor authentication
            </li>
          </>
        ) : (
          <>
            <li>Your backup authenticator app is still available to use</li>
            <li>Adding another authenticator app thereafter as a backup</li>
          </>
        )}
      </ul>

      <FormItemLayout
        isReactForm={false}
        className="mt-3"
        label="Confirm your account password"
        description="Required to disable two-factor authentication"
      >
        <Input
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormItemLayout>
    </ConfirmationModal>
  )
}

export default DeleteFactorModal
