"""Prepare exact public-schema prerequisites; never connect to a database."""
import pathlib
import re
import sys

def prepare(path, manifest):
    # Only audited source extensions are supported. Unknown names/version fail closed.
    allowed = {"unaccent:1.1": "CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public VERSION '1.1';"}
    entries = manifest.splitlines()
    if len(set(entries)) != len(entries) or any(x not in allowed for x in entries):
        raise SystemExit("Unsupported public extension manifest; refusing backup")
    path = pathlib.Path(path)
    text = path.read_text(encoding="utf-8")
    pattern = r"^CREATE SCHEMA public;$"
    if len(re.findall(pattern, text, flags=re.M)) != 1:
        raise SystemExit("Unexpected public schema DDL; refusing backup")
    prefix = ["CREATE SCHEMA IF NOT EXISTS public;"]
    for entry in entries:
        prefix.append(allowed[entry])
        prefix.append("""DO $apd_extension$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='unaccent' AND extnamespace='public'::regnamespace AND extversion='1.1')
 THEN RAISE EXCEPTION 'Restore prerequisite unaccent schema/version mismatch'; END IF;
END $apd_extension$;""")
    path.write_text(re.sub(pattern, lambda _: "\n".join(prefix), text, count=1, flags=re.M), encoding="utf-8")
if __name__ == "__main__":
    prepare(sys.argv[1], sys.argv[2])
