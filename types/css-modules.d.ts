// Allow `import 'superdoc/style.css'` and similar side-effect CSS imports
// from third-party packages without TypeScript complaints. Next.js handles
// the actual CSS resolution at bundle time.
declare module '*.css'
declare module 'superdoc/style.css'
