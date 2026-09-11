#!/usr/bin/env python3
import argparse
from pathlib import Path


def once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {n}")
    return s.replace(old, new, 1)


def patch_main(s):
    s = once(
        s,
        "&is_active=eq.true&first_emailed_at=is.null&select=",
        "&is_active=eq.true&select=",
        "load active offers regardless of previous email",
    )
    s = once(
        s,
        "        if (item.first_emailed_at) return false;\n",
        "",
        "keep previously emailed active offers in digest",
    )
    return s


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--main-in", required=True)
    p.add_argument("--main-out", required=True)
    a = p.parse_args()
    src = Path(a.main_in).read_text(encoding="utf-8")
    Path(a.main_out).write_text(patch_main(src), encoding="utf-8")
    print("repeat-active-digest patch applied")


if __name__ == "__main__":
    main()
