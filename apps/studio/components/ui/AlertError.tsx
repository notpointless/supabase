import { PropsWithChildren, useEffect, useRef } from 'react'
import { Admonition } from 'ui-patterns/admonition'

import { useTrack } from '@/lib/telemetry/track'

export interface AlertErrorProps {
  projectRef?: string
  subject?: string
  description?: string
  error?: { message: string } | null
  layout?: 'vertical' | 'horizontal' | 'responsive'
  className?: string
  showIcon?: boolean
  showInstructions?: boolean
  showErrorPrefix?: boolean
  additionalActions?: React.ReactNode
  hideContactSupport?: boolean
}

// [console fork] Self-hosted console — there is no Supabase support desk to contact, so the
// "Contact support" button is removed everywhere. Kept as a no-op render so the many call sites
// (and AlertError's actions) don't need to change.
export const ContactSupportButton = (_props?: {
  projectRef?: string
  subject?: string
  error?: { message: string } | null
}) => {
  return null
}

// [Joshen] To standardize the language for all error UIs
export const AlertError = ({
  projectRef,
  subject,
  description = 'Try refreshing your browser. If the issue persists for more than a few minutes, check the project logs.',
  error,
  className,
  showIcon = true,
  layout = 'responsive',
  showInstructions = true,
  showErrorPrefix = true,
  children,
  additionalActions,
  hideContactSupport = false,
}: PropsWithChildren<AlertErrorProps>) => {
  const track = useTrack()
  const hasTrackedRef = useRef(false)

  const formattedErrorMessage = error?.message?.includes('503')
    ? '503 Service Temporarily Unavailable'
    : error?.message

  useEffect(() => {
    if (!hasTrackedRef.current) {
      hasTrackedRef.current = true
      if (Math.random() < 0.1) {
        track('dashboard_error_created', {
          source: 'admonition',
        })
      }
    }
  }, [track])

  return (
    <Admonition
      type="warning"
      layout={additionalActions ? 'vertical' : layout}
      showIcon={showIcon}
      title={subject}
      description={
        <>
          {error?.message && (
            <p>
              {showErrorPrefix && 'Error: '}
              {formattedErrorMessage}
            </p>
          )}
          {showInstructions && <p>{description}</p>}
          {children}
        </>
      }
      actions={
        hideContactSupport ? (
          (additionalActions ?? null)
        ) : additionalActions ? (
          <>
            {additionalActions}
            <ContactSupportButton projectRef={projectRef} subject={subject} error={error} />
          </>
        ) : (
          <ContactSupportButton projectRef={projectRef} subject={subject} error={error} />
        )
      }
      className={className}
    />
  )
}

export default AlertError
