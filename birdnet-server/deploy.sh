#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="$script_dir/.env"

if [[ ! -f "$env_file" ]]; then
  echo ".env file not found at $env_file" >&2
  exit 1
fi

set -a
source <(tr -d '\r' < "$env_file")
set +a

: "${VPS_USER:?Missing VPS_USER in .env}"
: "${VPS_HOST:?Missing VPS_HOST in .env}"
: "${REMOTE_PATH:?Missing REMOTE_PATH in .env}"

server="$VPS_USER@$VPS_HOST"

echo "Starting deploy..."
echo "Server: $server"
echo "Remote path: $REMOTE_PATH"
echo

scp "$script_dir/server.py"        "$server:$REMOTE_PATH/server.py"
scp "$script_dir/requirements.txt" "$server:$REMOTE_PATH/requirements.txt"
scp "$script_dir/birdnet.service"  "$server:/etc/systemd/system/birdnet.service"

echo
echo "[OK] Copied files to remote server"
echo

ssh "$server" "REMOTE_PATH='$REMOTE_PATH' bash -s" <<'REMOTE'
set -euo pipefail
"$REMOTE_PATH/venv/bin/pip" install -r "$REMOTE_PATH/requirements.txt"
systemctl daemon-reload
systemctl restart birdnet
echo
echo
echo '--- Immediate status ---'
systemctl status birdnet --no-pager
echo
echo
echo '--- Waiting 15s... ---'
sleep 15
echo
echo
echo '--- Delayed status 15s ---'
systemctl status birdnet --no-pager
if ! systemctl is-active --quiet birdnet; then
  echo
  echo
  echo '--- Recent logs ---'
  journalctl -u birdnet -n 50 --no-pager
  exit 1
fi
REMOTE

echo
echo
echo "[OK] Deploy completed successfully."