from pathlib import Path
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()

src = Path(args.input).read_text(encoding='utf-8')
start = src.find('async function runEmailAlertsSweep')
end = src.find('function getArgentinaDigestSlotInfo', start)
if start < 0 or end < 0:
    raise SystemExit('runEmailAlertsSweep boundaries not found')

sweep = src[start:end]
render_at = sweep.find('const html = buildDigestHtml')
if render_at < 0:
    raise SystemExit('email render/send boundary not found')

premature = '''      if (perUserSentKey) {
        await kv.put(perUserSentKey, new Date().toISOString(), {
          expirationTtl: 60 * 60 * 36
        }).catch(() => null);
      }
'''

before = sweep[:render_at]
after = sweep[render_at:]
count_before = before.count(premature)
if count_before != 1:
    raise SystemExit(f'expected exactly one premature sent marker before provider call, found {count_before}')
if premature not in after:
    raise SystemExit('post-success sent marker not found; refusing unsafe patch')

before = before.replace(premature, '', 1)
patched_sweep = before + after
patched = src[:start] + patched_sweep + src[end:]

Path(args.output).write_text(patched, encoding='utf-8')
print('Removed premature per-user slot sent marker; preserved post-success marker')
