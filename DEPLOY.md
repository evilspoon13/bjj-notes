# Deploying to Fly.io

One machine, one volume, scale-to-zero. The frontend is built into the same
image and served by FastAPI, so there's one app and one origin.

## One-time setup

**Run every command from the repo root** — that's where `fly.toml` and
`Dockerfile` live. From `server/`, flyctl finds neither, falls back to scanning
the source, and fails.

Skip `fly launch` entirely. It exists to generate a Dockerfile and fly.toml by
guessing at your project; both are already written here, so all it can do is
get in the way.

```bash
# 1. Install and log in
curl -L https://fly.io/install.sh | sh
fly auth login

# 2. Create the app. Names are globally unique — pick another if this is taken.
cd /home/cam/dev/bjj-notes
fly apps create bjj-notes

# 3. Create the volume in the SAME region as `primary_region` in fly.toml.
#    The database lives here; everything else in the machine is disposable.
fly volumes create bjj_notes_data --size 1 --region iad

# 4. Secrets — never commit these. Generate the passphrase first so you keep it:
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'

fly secrets set BJJ_KEY="<the string above>" GROQ_API_KEY="gsk_your_real_key"

# 5. Ship it
fly deploy
```

If you changed the app name, update `app = "..."` in `fly.toml` to match.

`fly secrets set` prints nothing back. To see the passphrase you just generated,
generate it separately and keep it, or set one you already know.

Open `https://bjj-notes.fly.dev`, enter the passphrase, and add it to your home
screen from Safari's share sheet.

## Day-to-day

```bash
fly deploy              # ship changes
fly logs                # tail logs
fly ssh console         # shell into the machine
fly status              # is it running or stopped?
fly secrets set K=V     # rotate a secret (triggers a redeploy)
```

## The database

SQLite, one file at `/data/bjj-notes.db` on the Fly volume mounted at `/data`.
`DATABASE_PATH` in `[env]` points at it.

**This is the only copy of your journal.** A few consequences worth internalizing:

- **One machine, always.** A Fly volume attaches to exactly one machine. Running
  `fly scale count 2` would give the second machine its own empty volume, and
  your data would split in half depending on which one served the request. Keep
  it at one.
- **Deploys are safe.** The machine is replaced; the volume is not.
- **Scale-to-zero is safe.** Stopping the machine doesn't touch the volume.
- **Losing the volume loses everything.** Fly takes daily block-level snapshots
  retained for five days by default, but their own docs say snapshots "may not
  have your latest data" and shouldn't be your primary backup.

So: **pull backups.** From the Settings screen, or:

```bash
curl -H "X-BJJ-Key: $BJJ_KEY" https://bjj-notes.fly.dev/api/export -o backup.json
```

That JSON contains every transcript and technique — enough to rebuild from
scratch. Grabbing one after each training block is cheap insurance.

To copy the raw database file down instead:

```bash
fly ssh sftp get /data/bjj-notes.db ./bjj-notes.db
```

## Cold starts

`auto_stop_machines = "stop"` means the machine shuts down when idle and the
proxy starts it on the next request — roughly 1–3 seconds before the app
answers. If that bothers you after a session, change it to `"suspend"` in
`fly.toml` for a faster resume, or set `min_machines_running = 1` to never stop
(and pay for the uptime).

## Costs

One `shared-cpu-1x` / 512 MB machine that's stopped most of the day, plus a 1 GB
volume. Volumes are billed whether or not the machine runs, since the storage is
always allocated.

## Verifying locally first

The production image runs anywhere Docker does:

```bash
docker build -t bjj-notes .
docker run --rm -p 8080:8080 \
  -v "$PWD/data:/data" \
  -e BJJ_KEY=local-test \
  -e GROQ_API_KEY=gsk_... \
  bjj-notes
```

That's the exact image Fly runs, with `./data` standing in for the volume.
