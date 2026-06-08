import { ReactNode, useEffect, useState } from 'react'
import { Badge, cn } from 'ui'

import { LastSignInType, useLastSignIn } from '@/hooks/misc/useLastSignIn'

export function LastSignInWrapper({
  children,
  type,
}: {
  children: ReactNode
  type: LastSignInType
}) {
  const [lastSignIn] = useLastSignIn()
  // [console fork] `lastSignIn` is read from localStorage, which is unavailable during SSR.
  // Only reflect it after mount so the server HTML and the first client render match
  // (otherwise the "Last used" badge causes a hydration mismatch on the sign-in page).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isLast = mounted && lastSignIn === type

  return (
    <div className="flex items-center relative">
      {isLast && (
        <Badge
          variant="success"
          className="absolute -right-4 -top-3 shadow-sm z-10 bg-brand-400 text-foreground pointer-events-none"
        >
          Last used
        </Badge>
      )}
      <div
        className={cn('w-full', {
          'outline outline-1 outline-offset-4 outline-foreground-lighter/50 rounded-md ': isLast,
        })}
      >
        {children}
      </div>
    </div>
  )
}
