import { bff, consoleFetch } from '@/lib/console-bff'

// [console fork] Restore a physical backup (EC2): the control plane swaps the instance's root
// volume for one created from the chosen EBS snapshot, as a background job — the project shows
// RESTORING until it completes. Shared projects get the control plane's clear 400.
export default bff({
  POST: async (req, res) => {
    const ref = String(req.query.ref ?? '')
    const id = Number((req.body as any)?.id)
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: { message: 'Backup id is required' } })
    }
    const { status, data } = await consoleFetch<any>(
      req,
      `/api/v1/projects/${encodeURIComponent(ref)}/backups/${id}/restore-physical`,
      { method: 'POST' }
    )
    if (status >= 400) {
      return res
        .status(status)
        .json({ error: { message: data?.message ?? data?.error ?? 'Failed to restore physical backup' } })
    }
    return res.status(200).json(data ?? { ok: true })
  },
})
