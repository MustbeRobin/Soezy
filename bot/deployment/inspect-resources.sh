#!/usr/bin/env bash
# Read-only inspection. Does not delete data, truncate logs, or start processes.
set -u
df -h /home/ubuntu/Soezy
df -i /home/ubuntu/Soezy
for directory in /home/ubuntu/.pm2/logs /home/ubuntu/Soezy/logs /home/ubuntu/Soezy/node_modules /home/ubuntu/Soezy; do
  if [ -d "$directory" ]; then
    du -xhd1 "$directory" 2>/dev/null | sort -h
  fi
done
find /home/ubuntu/Soezy /home/ubuntu/.pm2 -xdev -type f \( -name '*.log' -o -name '*.tmp' -o -name 'core*' -o -name '*.hprof' -o -name '*.heapsnapshot' -o -name '*.jar' \) -printf '%s %p\n' 2>/dev/null | sort -nr | head -40
pm2 list
pm2 logs Soezy --lines 200 --nostream
journalctl -k --since '-24 hours' --no-pager 2>/dev/null | grep -Ei 'out of memory|oom-kill|killed process|no space' | tail -30
