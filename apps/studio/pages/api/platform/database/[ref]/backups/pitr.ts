import { bff } from '@/lib/console-bff'

// [console fork] Point-in-time recovery needs continuous WAL archiving (WAL-G), which this
// console's stacks don't run (upstream self-hosting dropped it too). Recovery paths that DO
// exist: logical backups (download / restore) on every project, and physical EBS-snapshot
// backups (restore to the snapshot's moment) on dedicated AWS EC2 projects.
export default bff({
  POST: async (_req, res) =>
    res.status(400).json({
      error: {
        message:
          'Point-in-time recovery is not available. Use logical backups (download / restore), or physical EBS-snapshot backups on dedicated AWS EC2 projects.',
      },
    }),
})
