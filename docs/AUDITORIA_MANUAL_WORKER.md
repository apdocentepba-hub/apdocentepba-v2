# Auditoría manual del Worker

## Archivo agregado
- `.github/workflows/worker-refactor-audit.yml`

## Qué hace
Corre en una sola ejecución manual tres chequeos del repo:
1. detección de duplicados del router provincial
2. inventario de rutas del `worker.js`
3. ubicación de bloques core del Worker

## Para qué sirve
- tener una radiografía rápida del backend sin tocar producción
- revisar el estado del router antes de un refactor
- evitar abrir varios workflows por separado

## Cómo usarlo
1. Abrir la pestaña **Actions** del repo
2. Elegir `Worker refactor audit`
3. Ejecutarlo manualmente

## Nota importante
El primer chequeo puede encontrar duplicados conocidos del router y, aun así, la auditoría sigue con los otros pasos para darte contexto útil del archivo completo.
