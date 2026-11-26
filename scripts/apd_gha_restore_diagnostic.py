"""Emit SQLSTATE and source file/line only. Never emit SQL, messages or credentials."""
import pathlib
import re
import sys
text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
for line in text.splitlines():
    match = re.fullmatch(r"psql:.*?/(roles|app)\.sql:(\d+):\s+(?:ERROR|FATAL):\s+([0-9A-Z]{5})\s*", line)
    if match:
        print(f"APD_RESTORE_DIAGNOSTIC file={match[1]}.sql line={int(match[2])} sqlstate={match[3]}")
        break
else:
    print("APD_RESTORE_DIAGNOSTIC sqlstate=unavailable (raw diagnostics withheld)")
