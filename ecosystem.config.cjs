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
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '3000',
      },
    },
  ],
}
