import { bff, consoleGet } from '@/lib/console-bff'

// [console fork] Database backups from the control plane: logical (pg_dump, all projects)
// merged with physical (EBS snapshots, dedicated/EC2 projects).
export default bff({
  GET: async (req, res) => {
    const ref = String(req.query.ref ?? '')
    const { data } = await consoleGet<any>(req, `/api/v1/projects/${ref}/backups`)
    return res.status(200).json({
      backups: data?.backups ?? [],
      region: data?.region ?? 'shared',
      walg_enabled: data?.walg_enabled ?? false,
      pitr_enabled: data?.pitr_enabled ?? false,
      physicalBackupData: data?.physicalBackupData ?? {},
      physicalBackupsEnabled: data?.physicalBackupsEnabled ?? false,
      tierKey: '',
    })
  },
})
