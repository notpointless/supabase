import { bff, consoleFetch } from '@/lib/console-bff'

// [console fork] Enable physical backups: dedicated (EC2) projects take an EBS snapshot of the
// instance's root volume now, and the daily backup job keeps snapshotting (with retention).
// Shared projects get the control plane's clear 400 — logical backups are their path.
export default bff({
  POST: async (req, res) => {
    const ref = String(req.query.ref ?? '')
    const { status, data } = await consoleFetch<any>(
      req,
      `/api/v1/projects/${encodeURIComponent(ref)}/backups/enable-physical`,
      { method: 'POST' }
    )
    if (status >= 400) {
      return res
        .status(status)
        .json({ error: { message: data?.message ?? data?.error ?? 'Failed to enable physical backups' } })
    }
    return res.status(200).json(data ?? { ok: true })
  },
})
