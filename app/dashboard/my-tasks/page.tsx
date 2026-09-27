import { redirect } from 'next/navigation'

/**
 * Retired route. "My tasks" duplicated the To-dos page (and was not in the
 * nav), so it now lands on To-dos with the "Assigned to me" scope preselected —
 * TodosPageClient reads `?scope=`. Kept as a redirect so old links and
 * bookmarks still work.
 */
export default function MyTasksPage() {
  redirect('/dashboard/todos?scope=assigned')
}
