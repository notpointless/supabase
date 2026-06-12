import {
  PageSection,
  PageSectionContent,
  PageSectionMeta,
  PageSectionSummary,
  PageSectionTitle,
} from 'ui-patterns/PageSection'

import { AIAssistantForm } from './AIAssistantForm'
import { GitHubAppForm } from './GitHubAppForm'
import { OrganizationDeletePanel } from './OrganizationDeletePanel'
import { OrganizationDetailsForm } from './OrganizationDetailsForm'
import { NoProjectsOnPaidOrgInfo } from '@/components/interfaces/Billing/NoProjectsOnPaidOrgInfo'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'

export const GeneralSettings = () => {
  const organizationDeletionEnabled = useIsFeatureEnabled('organizations:delete')

  return (
    <>
      <NoProjectsOnPaidOrgInfo />

      <PageSection>
        <PageSectionMeta>
          <PageSectionSummary>
            <PageSectionTitle>Organization details</PageSectionTitle>
          </PageSectionSummary>
        </PageSectionMeta>
        <PageSectionContent>
          <OrganizationDetailsForm />
        </PageSectionContent>
      </PageSection>

      <PageSection>
        <PageSectionMeta>
          <PageSectionSummary>
            <PageSectionTitle>GitHub App</PageSectionTitle>
          </PageSectionSummary>
        </PageSectionMeta>
        <PageSectionContent>
          <GitHubAppForm />
        </PageSectionContent>
      </PageSection>

      {/* [console fork] Data privacy / "Supabase Assistant Opt-in Level" removed — this
          self-hosted console sends nothing to Supabase, so the opt-in is meaningless here. */}

      <PageSection>
        <PageSectionMeta>
          <PageSectionSummary>
            <PageSectionTitle>AI Assistant</PageSectionTitle>
          </PageSectionSummary>
        </PageSectionMeta>
        <PageSectionContent>
          <AIAssistantForm />
        </PageSectionContent>
      </PageSection>

      {organizationDeletionEnabled && (
        <PageSection>
          <PageSectionMeta>
            <PageSectionSummary>
              <PageSectionTitle>Danger zone</PageSectionTitle>
            </PageSectionSummary>
          </PageSectionMeta>
          <PageSectionContent>
            <OrganizationDeletePanel />
          </PageSectionContent>
        </PageSection>
      )}
    </>
  )
}
