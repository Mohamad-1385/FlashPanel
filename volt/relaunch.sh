#!/bin/bash
# VOLT relaunch — cred bidirectional sync (the P27 contract) + voltd supervisor
# Idempotent: safe to call every 5 minutes. No auto-update of ANY panel —
# the 2.10.0 incident is root-caused out (P179); only phase scripts deploy.
set -u
VOLT=/home/z/my-project/volt
TMP=/tmp/my-project/volt

# ── 1) credential vault sync (both directions) ──
for f in config.json .bot-token .cf-token .admin-code backend-state.json; do
  [ -f "$VOLT/$f" ] || { [ -f "$TMP/$f" ] && cp "$TMP/$f" "$VOLT/$f" && chmod 600 "$VOLT/$f"; }
  [ -f "$VOLT/$f" ] && { mkdir -p "$TMP"; cp "$VOLT/$f" "$TMP/$f" && chmod 600 "$TMP/$f"; }
done

# ── 2) voltd supervisor: heartbeat stale or no process → (re)start ──
HB="$VOLT/daemon.heartbeat"
STALE=0
if [ -f "$HB" ]; then
  NOW=$(date +%s%3N 2>/dev/null || date +%s)
  LAST=$(cat "$HB" 2>/dev/null | tr -dc '0-9')
  [ -n "$LAST" ] && [ $((NOW - LAST)) -gt 120000 ] 2>/dev/null && STALE=1
else
  STALE=1
fi

RUNNING=$(pgrep -f "volt/bin/voltd" 2>/dev/null | head -1)
if [ -z "$RUNNING" ] || [ "$STALE" = "1" ]; then
  [ -n "$RUNNING" ] && kill "$RUNNING" 2>/dev/null
  sleep 1
  cd "$VOLT"
  nohup "$VOLT/bin/voltd" >> "$VOLT/daemon.log" 2>&1 &
  echo "$(date +%H:%M:%S) relaunch: pid $!" >> "$VOLT/relaunch.log"
fi
exit 0
