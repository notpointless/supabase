import { bff } from '@/lib/console-bff'

// [console fork] Compatibility shim — nothing in this dashboard's data layer calls
// /platform/props/project/{ref}/api (the hosted platform's legacy project-props route).
// Kept so any stray caller gets a well-formed 200 instead of a 404.
export default bff({
  GET: async (_req, res) => res.status(200).json({}),
})
