import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalDir = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(repoRoot, 'worker-live');
const captureDir = process.argv[2] ? path.resolve(process.argv[2]) : null;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function moduleHashMap(manifest) {
  return new Map((manifest.modules || []).map(entry => [entry.name, entry.module_sha256]));
}

const manifestPath = path.join(canonicalDir, 'manifest.json');
assert.ok(fs.existsSync(manifestPath), 'canonical worker-live/manifest.json must exist');
const canonical = readJson(manifestPath);
assert.equal(canonical.schema_version, 1, 'canonical manifest schema_version must be 1');
assert.equal(canonical.main_module, 'worker_hotfix.js', 'canonical main_module must be worker_hotfix.js');
assert.ok(canonical.version_id, 'canonical manifest must record the production version_id');
assert.ok(Array.isArray(canonical.modules) && canonical.modules.length > 0, 'canonical manifest must list packaged modules');

const requiredModules = canonical.modules.map(entry => String(entry?.name || '').trim());
assert.ok(requiredModules.every(Boolean), 'canonical manifest module names must be non-empty');
assert.ok(requiredModules.includes(canonical.main_module), 'canonical manifest must include its main module');
assert.equal(new Set(requiredModules).size, requiredModules.length, 'canonical manifest module names must be unique');

const canonicalHashes = moduleHashMap(canonical);
for (const entry of canonical.modules) {
  const name = entry.name;
  const file = path.join(canonicalDir, name);
  assert.ok(fs.existsSync(file), `canonical source module missing: ${name}`);
  assert.ok(entry.module_sha256, `manifest packaged hash missing: ${name}`);

  const expectedSourceHash = entry.source_sha256 || entry.module_sha256;
  assert.equal(
    sha256(file),
    expectedSourceHash,
    `canonical source hash mismatch: ${name}`
  );
}

if (captureDir) {
  const captureManifestPath = path.join(captureDir, 'manifest.json');
  assert.ok(fs.existsSync(captureManifestPath), 'capture manifest.json must exist');
  const capture = readJson(captureManifestPath);
  assert.equal(capture.main_module, canonical.main_module, 'live main_module differs from canonical snapshot');
  assert.equal(capture.version_id, canonical.version_id, 'live version_id differs from canonical snapshot');

  const liveModuleNames = (capture.modules || []).map(entry => entry.name).sort();
  assert.deepEqual(
    liveModuleNames,
    [...requiredModules].sort(),
    'live packaged module set differs from canonical manifest'
  );

  const liveHashes = moduleHashMap(capture);
  for (const name of requiredModules) {
    assert.equal(liveHashes.get(name), canonicalHashes.get(name), `live module hash differs: ${name}`);
    assert.equal(sha256(path.join(captureDir, name)), canonicalHashes.get(name), `live module bytes differ: ${name}`);
  }

  const liveBindingMap = new Map(
    (capture.bindings || []).map(binding => [`${binding.name}:${binding.type}`, binding])
  );
  for (const binding of canonical.bindings || []) {
    const key = `${binding.name}:${binding.type}`;
    const liveBinding = liveBindingMap.get(key);
    assert.ok(liveBinding, `required binding missing from live Worker: ${key}`);
    if (binding.namespace_id) {
      assert.equal(
        liveBinding.namespace_id,
        binding.namespace_id,
        `resource namespace_id differs: ${binding.name}`
      );
    }
  }
}

console.log(`live source equivalence: OK (${canonical.version_id})`);
