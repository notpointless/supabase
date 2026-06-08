import { bff, consoleGet, getFullOrg, ROLE_NAME_TO_ID } from '@/lib/console-bff'

// [console fork] GET /platform/organizations/{slug}/members -> better-auth full org members,
// augmented with each member's real MFA status. better-auth's member list doesn't carry the
// user's twoFactorEnabled, so we pull it from the org security endpoint (which joins it) and
// merge by user id. Was hardcoded mfa_enabled: false.
export default bff({
  GET: async (req, res) => {
    const org = await getFullOrg(req, String(req.query.slug ?? ''))
    const members = Array.isArray(org?.members) ? org.members : []

    const security = org?.id
      ? (await consoleGet<any>(req, `/api/v1/organizations/${org.id}/security`)).data
      : null
    const mfaByUser = new Map<string, boolean>(
      (Array.isArray(security?.members) ? security.members : []).map((m: any) => [
        m.userId,
        !!m.mfaEnabled,
      ])
    )

    return res.status(200).json(
      members.map((m: any) => ({
        gotrue_id: m.userId,
        primary_email: m.user?.email ?? '',
        username: m.user?.name ?? m.user?.email?.split('@')[0] ?? '',
        mfa_enabled: !!mfaByUser.get(m.userId),
        role_ids: [ROLE_NAME_TO_ID[m.role] ?? 3],
      }))
    )
  },
})
