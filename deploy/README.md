# Production nginx performance configuration

Applied on 2026-10-05 to the existing HTTPS site on the VPS.

- Copy `nginx-performance.conf` to `/etc/nginx/conf.d/okr-performance.conf` (http context).
- Copy `nginx-site-performance.conf` to `/etc/nginx/snippets/okr-site-performance.conf`; include it inside the existing HTTPS server block.
- In that server's proxy location, use `proxy_pass http://okr_backend;` and `proxy_set_header Connection $okr_connection_upgrade;`. Keep `proxy_http_version 1.1`, Upgrade, Host and forwarded headers.
- Preserve certificates, upload size, and the HTTP-to-HTTPS redirect.
- Back up the existing site. Run `nginx -t` before reloading nginx; restore the backup if validation fails.

JavaScript, CSS and JSON compression is enabled for proxied responses. Authenticated pages and API responses are not cached. The upstream pool reuses ordinary HTTP connections while preserving WebSocket upgrades.

The additional `/var/log/nginx/okr-performance.log` records status, response size, total duration and upstream duration. It omits query strings, cookies and request bodies. Ubuntu's existing `/var/log/nginx/*.log` logrotate rule covers it.

Baseline: origin sign-in TTFB 14–15 ms, idle server load 0.09, 2.8 GiB available memory. A production JS chunk was 325,087 bytes uncompressed; after this change its gzip transfer was 100,581 bytes (69% smaller). Five further local checks returned HTTP 200 in 22–35 ms. These samples do not establish authenticated dashboard latency or the cause of intermittent connection failures.

The backup of the applied site is `/etc/nginx/sites-available/okr.backup-20261005-081055`. To roll back, restore that site, remove the two new performance snippets, validate with `nginx -t`, then reload nginx.

## Notification query index

The new timing log caught `/api/notifications` taking 4.499 seconds. `EXPLAIN ANALYZE` confirmed the all-notification query scanned and sorted about 32,339 matching rows: approximately 1.5 seconds for the list portion (1.684 seconds including the diagnostic's sample-user lookup).

`notification-index.sql` was applied concurrently on production. The actual full-row query now uses `notifications_userId_createdAt_idx` and took 0.096 ms for 21 rows. This is database query timing, not end-to-end API timing. The Prisma schema declares the same index; deploy the schema declaration before running another `prisma db push` so the index stays tracked. No notification records were removed or modified.

The application patch also corrects the project objective picker's response handling: `/api/objectives` returns `{ success, data: [...], pagination }`, while the picker previously looked for `data.items`, returning undefined. Three tests exercise populated, empty and forbidden responses against the real API response helpers.

## Letters inbox loading

The captured letters page took 0.153 s at the origin and its API took 0.506 s, but the API transferred 225,397 compressed bytes. Its latest 20 rows contain 184,355 bytes of DOCX binaries plus 67,931 bytes of HTML before JSON serialization. The table renders neither field.

The prepared application change adds opt-in `view=summary` to the list API and makes the inbox request only its displayed metadata. It excludes DOCX, HTML and unused avatars at the database projection. Permission scope, filters and pagination are shared with the full response; desktop delta sync retains full rows. The create dialog is deferred until opened; search is debounced and superseded requests are aborted. End-to-end improvement remains unverified until application deployment and a signed-in browser check.
