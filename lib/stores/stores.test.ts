import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Zustand client stores (lib/stores): optimistic updates and their rollbacks,
 * envelope parsing, and the pure UI-state stores. `fetch` is replaced by a
 * scripted fake per test; stores are reset with setState between tests.
 */

type Call = { url: string; init?: RequestInit }
let calls: Call[] = []
let respond: (url: string, init?: RequestInit) => Promise<Response> = async () => json({ success: true, data: null })

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  calls.push({ url, init })
  return respond(url, init)
}) as typeof fetch
test.after(() => { globalThis.fetch = realFetch })
test.beforeEach(() => { calls = [] })

// ── notification-store ──────────────────────────────────────────────────────

const note = (id: string, isRead = false) => ({ id, isRead, title: id }) as any

test('notifications: fetch parses the { success, data: { items, unreadCount } } envelope', async () => {
  const { useNotificationStore } = await import('./notification-store')
  useNotificationStore.setState({ notifications: [], unreadCount: 0, loading: false, loaded: false })
  respond = async () => json({ success: true, data: { items: [note('a'), note('b', true)], unreadCount: 30 } })
  await useNotificationStore.getState().fetch(10)
  const s = useNotificationStore.getState()
  assert.equal(calls[0].url, '/api/notifications?limit=10')
  assert.equal(s.notifications.length, 2)
  assert.equal(s.unreadCount, 30, 'server count, not the loaded page')
  assert.equal(s.loaded, true)
  assert.equal(s.loading, false)
})

test('notifications: a malformed payload or network error still marks loaded and keeps rows', async () => {
  const { useNotificationStore } = await import('./notification-store')
  useNotificationStore.setState({ notifications: [note('keep')], unreadCount: 1, loading: false, loaded: false })
  respond = async () => json({ todos: [] })
  await useNotificationStore.getState().fetch()
  assert.deepEqual(useNotificationStore.getState().notifications.map((n) => n.id), ['keep'])
  assert.equal(useNotificationStore.getState().loaded, true)
  respond = async () => { throw new Error('offline') }
  await useNotificationStore.getState().fetch()
  assert.equal(useNotificationStore.getState().loading, false)
})

test('notifications: markRead is optimistic and rolls back on a non-ok response', async () => {
  const { useNotificationStore } = await import('./notification-store')
  useNotificationStore.setState({ notifications: [note('a'), note('b')], unreadCount: 5 })
  respond = async () => json({ success: true, data: null })
  await useNotificationStore.getState().markRead('a')
  assert.equal(useNotificationStore.getState().unreadCount, 4)
  assert.equal(useNotificationStore.getState().notifications[0].isRead, true)
  assert.equal(calls[0].url, '/api/notifications/a')
  assert.equal(calls[0].init?.method, 'PATCH')

  respond = async () => json({ success: false, error: 'Forbidden' }, 403)
  await useNotificationStore.getState().markRead('b')
  assert.equal(useNotificationStore.getState().unreadCount, 4)
  assert.equal(useNotificationStore.getState().notifications[1].isRead, false)

  calls = []
  await useNotificationStore.getState().markRead('a') // already read → no request
  await useNotificationStore.getState().markRead('zzz') // unknown → no request
  assert.equal(calls.length, 0)
})

test('notifications: markAllRead zeroes the count, rolls back on failure, no-ops when nothing is unread', async () => {
  const { useNotificationStore } = await import('./notification-store')
  useNotificationStore.setState({ notifications: [note('a'), note('b')], unreadCount: 7 })
  respond = async () => json({}, 500)
  await useNotificationStore.getState().markAllRead()
  assert.equal(useNotificationStore.getState().unreadCount, 7)
  respond = async () => json({ success: true, data: null })
  await useNotificationStore.getState().markAllRead()
  assert.equal(useNotificationStore.getState().unreadCount, 0)
  assert.ok(useNotificationStore.getState().notifications.every((n) => n.isRead))
  calls = []
  await useNotificationStore.getState().markAllRead()
  assert.equal(calls.length, 0)
})

// ── todo-store ──────────────────────────────────────────────────────────────

const todo = (id: string, status = 'PENDING') => ({ id, status, completedAt: null, dueDate: null, assignee: null }) as any

test('todos: fetchTodos reads the { success, data } envelope and ignores malformed payloads', async () => {
  const { useTodoStore } = await import('./todo-store')
  useTodoStore.setState({ todos: [], loading: false, initialized: false })
  respond = async () => json({ success: true, data: [todo('t1')] })
  await useTodoStore.getState().fetchTodos()
  assert.equal(calls[0].url, '/api/todos?surface=todos')
  assert.deepEqual(useTodoStore.getState().todos.map((t) => t.id), ['t1'])
  assert.equal(useTodoStore.getState().initialized, true)
  respond = async () => json({ success: true, todos: [todo('x')] })
  await useTodoStore.getState().fetchTodos()
  assert.deepEqual(useTodoStore.getState().todos.map((t) => t.id), ['t1'], 'legacy { todos } shape must not clobber state')
})

test('todos: toggleComplete flips status + completedAt; rollback on failure', async () => {
  const { useTodoStore } = await import('./todo-store')
  useTodoStore.setState({ todos: [todo('t1'), todo('t2', 'COMPLETED')] })
  respond = async () => json({ success: true, data: null })
  await useTodoStore.getState().toggleComplete('t1')
  const t1 = useTodoStore.getState().todos[0]
  assert.equal(t1.status, 'COMPLETED')
  assert.ok(t1.completedAt)
  assert.equal(JSON.parse(String(calls[0].init?.body)).status, 'COMPLETED')

  await useTodoStore.getState().toggleComplete('t2')
  assert.equal(useTodoStore.getState().todos[1].status, 'PENDING')
  assert.equal(useTodoStore.getState().todos[1].completedAt, null)

  respond = async () => json({}, 500)
  await useTodoStore.getState().toggleComplete('t1')
  assert.equal(useTodoStore.getState().todos[0].status, 'COMPLETED', 'rolled back')
})

test('todos: changeStatus / changeDueDate / changeAssignee / deleteTodo roll back on failure', async () => {
  const { useTodoStore } = await import('./todo-store')
  const start = [todo('a'), todo('b')]
  useTodoStore.setState({ todos: start })
  respond = async () => json({}, 403)
  await useTodoStore.getState().changeStatus('a', 'IN_PROGRESS')
  await useTodoStore.getState().changeDueDate('a', '2026-10-01')
  await useTodoStore.getState().changeAssignee('a', 'u1', { id: 'u1', name: 'U', avatar: null })
  await useTodoStore.getState().deleteTodo('b')
  assert.deepEqual(useTodoStore.getState().todos, start)

  respond = async () => json({ success: true, data: null })
  await useTodoStore.getState().changeDueDate('a', '')
  assert.equal(JSON.parse(String(calls.at(-1)!.init?.body)).dueDate, null, 'empty date is sent as null')
  await useTodoStore.getState().deleteTodo('b')
  assert.deepEqual(useTodoStore.getState().todos.map((t) => t.id), ['a'])
  useTodoStore.getState().addTodo(todo('c'))
  useTodoStore.getState().updateTodo('c', { status: 'IN_PROGRESS' })
  assert.deepEqual(useTodoStore.getState().todos.map((t) => `${t.id}:${t.status}`), ['c:IN_PROGRESS', 'a:PENDING'])
})

// ── okr-favorites-store ─────────────────────────────────────────────────────

test('favorites: load reads server ids once; toggle POSTs / DELETEs optimistically', async () => {
  const { useOkrFavoritesStore } = await import('./okr-favorites-store')
  useOkrFavoritesStore.setState({ ids: new Set(), loaded: false })
  respond = async () => json({ success: true, data: { ids: ['o1'] } })
  await useOkrFavoritesStore.getState().load()
  await useOkrFavoritesStore.getState().load()
  assert.equal(calls.length, 1, 'loads once')
  assert.equal(useOkrFavoritesStore.getState().isFavorite('o1'), true)

  await useOkrFavoritesStore.getState().toggle('o 2')
  assert.equal(useOkrFavoritesStore.getState().isFavorite('o 2'), true)
  assert.equal(calls.at(-1)!.init?.method, 'POST')
  await useOkrFavoritesStore.getState().toggle('o 2')
  assert.equal(useOkrFavoritesStore.getState().isFavorite('o 2'), false)
  assert.equal(calls.at(-1)!.url, '/api/favorites?entityType=OBJECTIVE&entityId=o%202')
  assert.equal(calls.at(-1)!.init?.method, 'DELETE')

  respond = async () => { throw new Error('offline') }
  await useOkrFavoritesStore.getState().toggle('o1')
  assert.equal(useOkrFavoritesStore.getState().isFavorite('o1'), true, 'network error reverts')
})

// BUG: lib/stores/okr-favorites-store.ts:66-80 — toggle() only reverts when fetch
// throws; a 4xx/5xx response resolves normally, so the star stays flipped in the
// UI while the server never saved it (notification-store handles !res.ok; this
// store does not). Same pattern in user-prefs-store setColorBlindMode/setTodoViewMode.
test('BUG: favorites toggle reverts on a non-ok response', async () => {
  const { useOkrFavoritesStore } = await import('./okr-favorites-store')
  useOkrFavoritesStore.setState({ ids: new Set(), loaded: true })
  respond = async () => json({ success: false, error: 'nope' }, 500)
  await useOkrFavoritesStore.getState().toggle('o9')
  assert.equal(useOkrFavoritesStore.getState().isFavorite('o9'), false)
  // Un-favorite rejected (403) → the star comes back.
  useOkrFavoritesStore.setState({ ids: new Set(['o8']), loaded: true })
  respond = async () => json({ success: false, error: 'forbidden' }, 403)
  await useOkrFavoritesStore.getState().toggle('o8')
  assert.equal(useOkrFavoritesStore.getState().isFavorite('o8'), true)

  // user-prefs-store: a 4xx/5xx PATCH rolls the optimistic value back.
  const { useUserPrefsStore } = await import('./user-prefs-store')
  useUserPrefsStore.setState({ todoViewMode: 'modal', colorBlindMode: false, loaded: true })
  respond = async () => json({ success: false, error: 'nope' }, 500)
  await useUserPrefsStore.getState().setTodoViewMode('sidebar')
  await useUserPrefsStore.getState().setColorBlindMode(true)
  assert.equal(useUserPrefsStore.getState().todoViewMode, 'modal')
  assert.equal(useUserPrefsStore.getState().colorBlindMode, false)
})

// ── user-prefs-store ────────────────────────────────────────────────────────

test('user prefs: load applies server values once; setters are optimistic', async () => {
  const { useUserPrefsStore } = await import('./user-prefs-store')
  useUserPrefsStore.setState({ todoViewMode: 'modal', colorBlindMode: false, loaded: false })
  respond = async () => json({ success: true, data: { todoViewMode: 'sidebar', colorBlindMode: 1 } })
  await useUserPrefsStore.getState().load()
  await useUserPrefsStore.getState().load()
  assert.equal(calls.length, 1)
  assert.equal(useUserPrefsStore.getState().todoViewMode, 'sidebar')
  assert.equal(useUserPrefsStore.getState().colorBlindMode, true)
  respond = async () => { throw new Error('offline') }
  await useUserPrefsStore.getState().setTodoViewMode('modal')
  await useUserPrefsStore.getState().setColorBlindMode(false)
  assert.equal(useUserPrefsStore.getState().todoViewMode, 'modal')
  assert.equal(useUserPrefsStore.getState().colorBlindMode, false)
})

// ── pure UI-state stores ────────────────────────────────────────────────────

test('cmdk / create-intent / check-in picker / initiative detail stores', async () => {
  const { useCmdkStore } = await import('./cmdk-store')
  useCmdkStore.getState().toggle()
  assert.equal(useCmdkStore.getState().open, true)
  useCmdkStore.getState().setOpen(false)
  assert.equal(useCmdkStore.getState().open, false)

  const { useCreateIntentStore } = await import('./create-intent-store')
  const n0 = useCreateIntentStore.getState().nonce
  useCreateIntentStore.getState().request('todo')
  useCreateIntentStore.getState().request('todo')
  assert.equal(useCreateIntentStore.getState().intent, 'todo')
  assert.equal(useCreateIntentStore.getState().nonce, n0 + 2, 'same intent re-fires')
  useCreateIntentStore.getState().clear()
  assert.equal(useCreateIntentStore.getState().intent, null)
})

test('scrum store: drafts keyed by user + date, clearDraft removes only that key', async () => {
  const { useScrumStore } = await import('./scrum-store')
  useScrumStore.setState({ drafts: {} })
  useScrumStore.getState().setDraft({ userId: 'u1', scrumDate: '2026-09-25', todayPlan: 'a' })
  useScrumStore.getState().setDraft({ userId: 'u1', scrumDate: '2026-09-24', todayPlan: 'b' })
  useScrumStore.getState().setDraft({ userId: 'u1', scrumDate: '2026-09-25', todayPlan: 'c' })
  const drafts = useScrumStore.getState().drafts
  assert.deepEqual(Object.keys(drafts).sort(), ['u1:2026-09-24', 'u1:2026-09-25'])
  assert.equal(drafts['u1:2026-09-25'].todayPlan, 'c')
  assert.equal(typeof drafts['u1:2026-09-25'].updatedAt, 'number')
  useScrumStore.getState().clearDraft('u1', '2026-09-25')
  assert.deepEqual(Object.keys(useScrumStore.getState().drafts), ['u1:2026-09-24'])
})

test('project view store: entering another project resets filters; same project keeps them', async () => {
  const { useProjectViewStore } = await import('./project-view-store')
  const s = useProjectViewStore.getState
  s().enterProject('p1')
  s().setSearch('x'); s().setStatus('BLOCKED'); s().setRisk('HIGH')
  s().enterProject('p1')
  assert.equal(s().search, 'x')
  s().enterProject('p2')
  assert.deepEqual([s().projectId, s().search, s().status, s().risk], ['p2', '', '', ''])
  s().toggleFavorite('table')
  assert.ok(s().favoriteViews.includes('table'))
  s().toggleFavorite('table')
  assert.equal(s().favoriteViews.includes('table'), false)
  s().setStatus('DONE'); s().clearFilters()
  assert.equal(s().status, '')
})

test('theme store: legacy "default" theme migrates to apple-pro; body class + appearance helpers', async () => {
  // zustand's persist() reads `window.localStorage` when the store is created and
  // only exposes its `.persist` API when a storage exists — provide a minimal one.
  const mem = new Map<string, string>()
  const g = globalThis as any
  const hadWindow = 'window' in g
  if (!hadWindow) {
    g.window = {
      localStorage: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => { mem.set(k, String(v)) },
        removeItem: (k: string) => { mem.delete(k) },
      },
    }
  }
  const { useThemeStore, bodyClassForTheme, resolveAppearance } = await import('./theme-store')
  if (!hadWindow) delete g.window
  const migrate = useThemeStore.persist.getOptions().migrate!
  assert.deepEqual(await migrate({ theme: 'default' }, 1), { theme: 'apple-pro', appearance: 'system' })
  assert.deepEqual(await migrate({ theme: 'apple', appearance: 'dark' }, 1), { theme: 'apple', appearance: 'dark' })
  assert.deepEqual(await migrate(undefined, 0), { theme: 'apple-pro', appearance: 'system' })
  assert.equal(bodyClassForTheme('apple', 'b'), 'b apple-pro-surface')
  assert.equal(bodyClassForTheme('apple-pro', 'b'), 'b apple-pro-surface theme-apple-full')
  assert.equal(resolveAppearance('dark'), 'dark')
  assert.equal(resolveAppearance('system'), 'light', 'SSR / no window resolves to light')
})
