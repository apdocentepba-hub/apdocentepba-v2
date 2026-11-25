# Ensayo alojado de Mis postulaciones

Usar el Worker dedicado `apd-diary-qa.apdocentepba.workers.dev` con una base aislada que contenga únicamente datos de ensayo. La base debe incluir una oferta de prueba indexada con clave `D_121`, dos cuentas Insigne de ensayo con registros vacíos y dos sesiones distintas de la primera cuenta. El procedimiento no despliega el Worker ni habilita el guardado en producción.

Configurar `APD_DIARY_QA_URL` y las variables protegidas `APD_DIARY_QA_SESSION_A`, `APD_DIARY_QA_SESSION_A_NEW`, `APD_DIARY_QA_SESSION_B` en el entorno de ejecución. Ejecutar `node scripts/test-apd-diary-hosted.mjs`. El resultado esperado es `APD_DIARY_HOSTED_PASS`. El ensayo comprueba autenticación, CORS, recuperación en otra sesión, aislamiento de cuentas y rechazo de escrituras concurrentes. Retira y vuelve a consultar el registro de prueba. La revisión de la cuenta de ensayo puede aumentar.

La prueba de GitHub Actions ejecuta esas mismas verificaciones contra el código del Worker activo y una base PostgreSQL descartable. El resultado de GitHub Actions y el del Worker alojado se registran por separado.
