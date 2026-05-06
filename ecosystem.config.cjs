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
      // Bumped from 512M: the AI sprint generation pipeline (context bundler
      // pulls every objective/KR/initiative into memory) was tripping the old
      // limit mid-request and PM2 was killing the worker, which surfaces in
      // the browser as ERR_NAME_NOT_RESOLVED / 502 Bad Gateway. 1.5G keeps
      // headroom while still catching real leaks.
      max_memory_restart: '1536M',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '3000',
      },
    },
  ],
}
