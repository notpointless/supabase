import { useParams } from 'common'
import { Admonition } from 'ui-patterns/admonition'
import { PageContainer } from 'ui-patterns/PageContainer'
import { PageSection, PageSectionContent } from 'ui-patterns/PageSection'

import { AnalyticsBuckets } from '@/components/interfaces/Storage/AnalyticsBuckets'
import { DefaultLayout } from '@/components/layouts/DefaultLayout'
import { StorageBucketsLayout } from '@/components/layouts/StorageLayout/StorageBucketsLayout'
import StorageLayout from '@/components/layouts/StorageLayout/StorageLayout'
import { useIsAnalyticsBucketsEnabled } from '@/data/config/project-storage-config-query'
import type { NextPageWithLayout } from '@/types'

const StorageAnalyticsPage: NextPageWithLayout = () => {
  const { ref: projectRef } = useParams()
  const isAnalyticsBucketsEnabled = useIsAnalyticsBucketsEnabled({ projectRef })

  // [console fork] Analytics (Iceberg) buckets are backed by AWS S3 Tables, so they're only
  // available on dedicated (AWS EC2) projects — say so plainly instead of showing the hosted
  // platform's plan-upgrade prompt (nothing is plan-gated in this self-hosted console).
  if (!isAnalyticsBucketsEnabled) {
    return (
      <PageContainer>
        <PageSection>
          <PageSectionContent>
            <Admonition
              type="default"
              title="Analytics buckets require a dedicated (AWS EC2) project"
            >
              Analytics buckets use Apache Iceberg backed by AWS S3 Tables, which is only
              reachable from projects running on dedicated AWS infrastructure. This project runs
              on shared infrastructure — create a project on AWS EC2 to use analytics buckets.
            </Admonition>
          </PageSectionContent>
        </PageSection>
      </PageContainer>
    )
  }
  return <AnalyticsBuckets />
}

StorageAnalyticsPage.getLayout = (page) => (
  <DefaultLayout>
    <StorageLayout title="Analytics">
      <StorageBucketsLayout>{page}</StorageBucketsLayout>
    </StorageLayout>
  </DefaultLayout>
)

export default StorageAnalyticsPage
