#!/bin/bash
# FLASH Core — تست واقعی خروجی یک کشور (زنجیرهٔ سایفون) + جمنای
set -u
CC="${1:-DE}"
IDX=$(( $(date +%s) % 100 ))
W=/tmp/flash-core/psi-$CC; mkdir -p "$W"; cd "$W"
BP=$((1900 + IDX)) PP=$((BP + 1))
rm -f run.log
/tmp/../home/z/my-project/tools/flash-core/engine --help >/dev/null 2>&1 || true
ENG=/home/z/my-project/tools/flash-core/engine
nohup "$ENG" --wg --turbo --ip both --bind 127.0.0.1:$BP --psiphon --psiphon-bind 127.0.0.1:$PP --psiphon-region $CC > run.log 2>&1 &
PID=$!
READY=0
for i in $(seq 1 100); do
  P=$(curl -s -m 6 -x socks5h://127.0.0.1:$PP -o /dev/null -w "%{http_code}" https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null)
  [ "$P" = "200" ] && { READY=1; break; }
  kill -0 $PID 2>/dev/null || break
  sleep 2
done
if [ $READY -eq 0 ]; then echo "$CC|FAIL|ready-timeout"; kill $PID 2>/dev/null; exit 2; fi
EXIT=$(curl -s -m 20 -x socks5h://127.0.0.1:$PP https://ipinfo.io/json 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('ip'),'/',d.get('country'),'/',d.get('city'))" 2>/dev/null)
GEM=$(curl -s -m 30 -x socks5h://127.0.0.1:$PP -o /tmp/gemf-$CC.html -w "%{http_code}/%{size_download}B" -L "https://gemini.google.com/" 2>/dev/null)
BLK=$(grep -c -i "not available in your country\|unsupported region\|در دسترس نیست" /tmp/gemf-$CC.html 2>/dev/null)
echo "$CC|OK|exit=$EXIT|gemini=$GEM blocked=$BLK"
kill $PID 2>/dev/null
