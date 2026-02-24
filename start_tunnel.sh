#!/bin/bash
# EpiCast Tunnel Manager
# Starts a localhost.run SSH tunnel and auto-updates Supabase app_config
# whenever the tunnel restarts and gets a new URL.
#
# Setup:
#   1. Fill in SUPABASE_SERVICE_KEY below (Supabase dashboard → Settings → API → service_role)
#   2. chmod +x start_tunnel.sh
#   3. ./start_tunnel.sh
#
# To auto-start on login: run ./install_tunnel_autostart.sh

SUPABASE_URL="https://sgorptgyjlahjkwnosit.supabase.co"
SUPABASE_SERVICE_KEY="PASTE_YOUR_SERVICE_ROLE_KEY_HERE"
LOCAL_PORT=5050
LOG=/tmp/lhr_tunnel.log

# ── Helpers ────────────────────────────────────────────────────────────────────

update_supabase() {
  local new_url="$1"
  local result
  result=$(curl -s -o /tmp/lhr_supabase_resp.txt -w "%{http_code}" \
    -X PATCH \
    "${SUPABASE_URL}/rest/v1/app_config?key=eq.local_server_url" \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{\"value\": \"${new_url}\"}")

  if [ "$result" = "204" ] || [ "$result" = "200" ]; then
    echo "$(date '+%H:%M:%S') ✓ Supabase updated → $new_url" | tee -a "$LOG"
  else
    echo "$(date '+%H:%M:%S') ✗ Supabase update failed (HTTP $result): $(cat /tmp/lhr_supabase_resp.txt)" | tee -a "$LOG"
  fi
}

# ── Tunnel loop ────────────────────────────────────────────────────────────────

echo "" >> "$LOG"
echo "$(date '+%H:%M:%S') ═══ EpiCast tunnel manager started ═══" | tee -a "$LOG"

if [ "$SUPABASE_SERVICE_KEY" = "PASTE_YOUR_SERVICE_ROLE_KEY_HERE" ]; then
  echo "ERROR: Set SUPABASE_SERVICE_KEY in start_tunnel.sh first." >&2
  echo "       Supabase dashboard → Settings → API → service_role key" >&2
  exit 1
fi

while true; do
  echo "$(date '+%H:%M:%S') Starting SSH tunnel on port $LOCAL_PORT..." | tee -a "$LOG"

  # Run tunnel; pipe stdout+stderr through line reader
  ssh -4 \
    -o StrictHostKeyChecking=no \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -R "80:localhost:${LOCAL_PORT}" \
    nokey@localhost.run 2>&1 | \
  while IFS= read -r line; do
    echo "$line" >> "$LOG"
    # localhost.run prints the assigned URL on the line containing "tunneled with tls"
    if echo "$line" | grep -q "lhr.life tunneled"; then
      NEW_URL=$(echo "$line" | grep -oE 'https://[a-z0-9]+\.lhr\.life')
      if [ -n "$NEW_URL" ]; then
        update_supabase "$NEW_URL"
        # Also update .env so local dev tools pick it up
        if [ -f "$(dirname "$0")/mobile/.env" ]; then
          sed -i '' "s|EXPO_PUBLIC_LOCAL_SERVER_URL=.*|EXPO_PUBLIC_LOCAL_SERVER_URL=${NEW_URL}|" \
            "$(dirname "$0")/mobile/.env"
        fi
      fi
    fi
  done

  echo "$(date '+%H:%M:%S') Tunnel disconnected — restarting in 5s..." | tee -a "$LOG"
  sleep 5
done
