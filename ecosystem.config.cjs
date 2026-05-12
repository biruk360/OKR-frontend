/** PM2 config: from OKR-frontend run `pm2 startOrReload ecosystem.config.cjs --only okr` */
module.exports = {
  apps: [
    {
      name: 'okr',
      cwd: __dirname,
      script: 'npm',
      args: 'start',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      // Bumped to 3G to give the Letter PDF renderer headroom. @react-pdf
      // loads three font families + logo decoding + Tiptap HTML parsing,
      // and at the 1.5G ceiling it was hitting v8's heap limit and OOMing
      // mid-request — surfaces in the browser as 502 Bad Gateway for every
      // route (the worker dies, nginx upstream is unreachable).
      max_memory_restart: '3072M',
      // Give v8 explicit headroom under the pm2 cap; without this Node
      // hard-OOMs at ~2G even when pm2 would allow more. `node_args`
      // doesn't propagate when `interpreter: 'none'` (pm2 launches npm,
      // which spawns its own Node) — use NODE_OPTIONS env instead.
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '3000',
        NODE_OPTIONS: '--max-old-space-size=2560',
      },
    },
  ],
}
