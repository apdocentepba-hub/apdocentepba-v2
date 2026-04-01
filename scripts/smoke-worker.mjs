const baseUrl = process.argv[2];

if (!baseUrl) {
  console.error("Uso: node scripts/smoke-worker.mjs https://tu-worker.workers.dev");
  process.exit(1);
}

const targets = [
  { name: "test-db", url: `${baseUrl}/api/test-db`, expectedStatus: 200 },
  { name: "planes", url: `${baseUrl}/api/planes`, expectedStatus: 200 },
  { name: "whatsapp-health", url: `${baseUrl}/api/whatsapp/health`, expectedStatus: 200 },
  { name: "provincia-backfill-status", url: `${baseUrl}/api/provincia/backfill-status`, expectedStatus: 200 },
  { name: "ruta-inexistente", url: `${baseUrl}/api/no-existe`, expectedStatus: 404 }
];

async function run() {
  let failed = 0;

  for (const target of targets) {
    try {
      const res = await fetch(target.url);
      const text = await res.text();
      const ok = res.status === target.expectedStatus;

      console.log(`\n[${ok ? "OK" : "FAIL"}] ${target.name}`);
      console.log(`URL: ${target.url}`);
      console.log(`Status esperado: ${target.expectedStatus}`);
      console.log(`Status real: ${res.status}`);
      console.log(`Body preview: ${text.slice(0, 300)}`);

      if (!ok) failed += 1;
    } catch (err) {
      failed += 1;
      console.log(`\n[FAIL] ${target.name}`);
      console.log(`URL: ${target.url}`);
      console.log(`Error: ${err?.message || err}`);
    }
  }

  if (failed > 0) {
    console.error(`\nSmoke test terminado con ${failed} fallo(s).`);
    process.exit(1);
  }

  console.log("\nSmoke test OK.");
}

run();
