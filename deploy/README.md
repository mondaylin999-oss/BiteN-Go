# deploy/

Notes for running BiteN Go on a small server (a VPS, a lab machine, a Raspberry
Pi). For running it on your own laptop you do not need anything in this folder —
see section 2 of the main README.

## The shape of a deployment

```
            ┌──────────────┐        ┌───────────────┐        ┌────────────┐
 browser ──►│    nginx     │──/api─►│  BiteN Go API │──────► │ PostgreSQL │
            │ static files │        │  node + C++   │        └────────────┘
            └──────────────┘        └───────────────┘
```

1. `cd frontend && npm run build` → `frontend/dist/` is plain static files.
2. `cd backend && npm run build` → `backend/dist/`, started with `npm run serve`.
3. nginx serves `dist/` and forwards `/api` to the API on port 8000.

## Before you expose it to the internet

- Set a real `JWT_SECRET` (32+ random bytes) and `NODE_ENV=production`.
- Set `SEED_ON_START=false` and change every seeded password.
- In `.env`, put your real domain in `CORS_ORIGINS` and set
  `CORS_ORIGIN_REGEX=` (empty) so LAN addresses are no longer trusted.
- Build the C++ engine on the server and set `BITEN_ENGINE_REQUIRED=true`.
- Give the app its own PostgreSQL role, not `postgres`:

  ```sql
  CREATE ROLE biten_user LOGIN PASSWORD 'a-long-password';
  GRANT ALL PRIVILEGES ON DATABASE biten_go_db TO biten_user;
  \c biten_go_db
  GRANT ALL ON ALL TABLES IN SCHEMA public TO biten_user;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO biten_user;
  ```

- Put TLS in front of it (certbot / Let's Encrypt).
- Back the database up: `pg_dump -U postgres biten_go_db > backup.sql`.

## nginx

```nginx
server {
    listen 80;
    server_name biten.example.com;

    root /var/www/biten-go/frontend/dist;
    index index.html;

    # the React app: every unknown path returns index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # the API
    location /api/ {
        proxy_pass         http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

## systemd

`/etc/systemd/system/biten-go-api.service`:

```ini
[Unit]
Description=BiteN Go API
After=network.target postgresql.service

[Service]
Type=simple
User=biten
WorkingDirectory=/var/www/biten-go/backend
EnvironmentFile=/var/www/biten-go/backend/.env
ExecStart=/usr/bin/npm run serve
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now biten-go-api
sudo journalctl -u biten-go-api -f
```

## Closing the pre-order window every night

Myanmar midnight is 17:30 UTC. As a cron job on the server:

```cron
30 17 * * * curl -fsS -X POST http://127.0.0.1:8000/scheduled/close-food-preorders
```
