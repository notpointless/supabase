import { zodResolver } from '@hookform/resolvers/zod'
import { PermissionAction } from '@supabase/shared-types/out/constants'
import { useParams } from 'common'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Badge, Card, CardContent, CardFooter, Form, FormControl, FormField, Input } from 'ui'
import { FormItemLayout } from 'ui-patterns/form/FormItemLayout/FormItemLayout'
import * as z from 'zod'

import { FormActions } from '@/components/ui/Forms/FormActions'
import { useGitHubAppQuery } from '@/data/organizations/github-app-query'
import { useUpdateGitHubAppMutation } from '@/data/organizations/github-app-mutation'
import { useAsyncCheckPermissions } from '@/hooks/misc/useCheckPermissions'

const GitHubAppSchema = z.object({
  appName: z.string().min(1, 'App name is required'),
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client secret is required'),
})

export const GitHubAppForm = () => {
  const { slug } = useParams()
  const { data: config } = useGitHubAppQuery({ slug })
  const { can: canUpdateOrganization } = useAsyncCheckPermissions(
    PermissionAction.UPDATE,
    'organizations'
  )
  const { mutate: updateGitHubApp, isPending } = useUpdateGitHubAppMutation()

  const form = useForm<z.infer<typeof GitHubAppSchema>>({
    resolver: zodResolver(GitHubAppSchema),
    defaultValues: { appName: '', clientId: '', clientSecret: '' },
  })

  useEffect(() => {
    if (config) {
      form.reset({ appName: config.app_name ?? '', clientId: config.client_id ?? '', clientSecret: '' })
    }
  }, [config, form])

  const onSubmit = (values: z.infer<typeof GitHubAppSchema>) => {
    if (!canUpdateOrganization) {
      return toast.error('You do not have the required permissions to update this organization')
    }
    if (!slug) return
    updateGitHubApp(
      { slug, ...values },
      {
        onSuccess: () => {
          toast.success('Saved GitHub App credentials')
          form.reset({ appName: values.appName, clientId: values.clientId, clientSecret: '' })
        },
        onError: (error) => toast.error(`Failed to save GitHub App credentials: ${error.message}`),
      }
    )
  }

  const permissionsHelperText = !canUpdateOrganization
    ? "You need additional permissions to manage this organization's settings"
    : undefined

  const disabled = !canUpdateOrganization || isPending

  return (
    <Form {...form}>
      <form id="github-app-form" onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardContent>
            <p className="text-sm text-foreground-light">
              Register your organization's GitHub App so members can connect repositories to their
              projects. The Client ID and secret power the GitHub OAuth flow used by the{' '}
              <span className="text-foreground">Connect GitHub</span> button.
              {config?.configured && (
                <Badge variant="success" className="ml-2">
                  Configured
                </Badge>
              )}
            </p>
          </CardContent>
          <CardContent>
            <FormField
              control={form.control}
              name="appName"
              render={({ field }) => (
                <FormItemLayout label="App name" layout="flex-row-reverse">
                  <FormControl>
                    <Input {...field} placeholder="my-org-github-app" disabled={disabled} />
                  </FormControl>
                </FormItemLayout>
              )}
            />
          </CardContent>
          <CardContent>
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItemLayout label="Client ID" layout="flex-row-reverse">
                  <FormControl>
                    <Input {...field} placeholder="Iv1.xxxxxxxxxxxx" disabled={disabled} />
                  </FormControl>
                </FormItemLayout>
              )}
            />
          </CardContent>
          <CardContent>
            <FormField
              control={form.control}
              name="clientSecret"
              render={({ field }) => (
                <FormItemLayout
                  label="Client secret"
                  layout="flex-row-reverse"
                  description={
                    config?.configured
                      ? 'A secret is already stored (write-only). Re-enter it to update.'
                      : undefined
                  }
                >
                  <FormControl>
                    <Input {...field} type="password" placeholder="••••••••••••" disabled={disabled} />
                  </FormControl>
                </FormItemLayout>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-end p-4 md:px-8">
            <FormActions
              form="github-app-form"
              isSubmitting={isPending}
              hasChanges={form.formState.isDirty}
              handleReset={() => form.reset()}
              helper={permissionsHelperText}
              disabled={!canUpdateOrganization}
            />
          </CardFooter>
        </Card>
      </form>
    </Form>
  )
}
