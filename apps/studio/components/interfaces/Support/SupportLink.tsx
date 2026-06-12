import type Link from 'next/link'
import type { ComponentProps, PropsWithChildren } from 'react'

import { type SupportFormUrlKeys } from './SupportForm.utils'

// [console fork] Self-hosted console — there is no Supabase support desk, so every "Contact
// support" link/button is removed. This renders nothing, which neutralizes all call sites
// (including those wrapped in `<Button asChild>`, whose Slot safely renders null for a
// non-element child) without having to edit each one.
export const SupportLink = (
  _props: PropsWithChildren<
    { queryParams?: Partial<SupportFormUrlKeys> } & Omit<ComponentProps<typeof Link>, 'href'>
  >
) => {
  return null
}
