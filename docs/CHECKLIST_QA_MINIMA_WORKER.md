# Checklist QA mínima del Worker

## Objetivo
Hacer una validación corta pero suficiente después de tocar el router o desplegar a staging.

## Router / salud general
- [ ] `/api/test-db` devuelve 200
- [ ] `/api/planes` devuelve 200
- [ ] `/api/whatsapp/health` devuelve 200
- [ ] `/api/provincia/backfill-status` devuelve 200
- [ ] una ruta inexistente devuelve 404 y no 500

## Auth
- [ ] login normal responde
- [ ] Google auth responde
- [ ] `/api/mi-plan` sigue respondiendo con un usuario válido

## Preferencias y alertas
- [ ] guardar preferencias responde
- [ ] `/api/mis-alertas` sigue devolviendo datos o vacío controlado
- [ ] `/api/postulantes-resumen` responde con una oferta válida

## Provincia / histórico
- [ ] `/api/provincia/backfill-status` no cambia de forma inesperada
- [ ] `/api/provincia/resumen` responde
- [ ] `/api/provincia/insights` responde

## Admin
- [ ] `/api/admin/me` sigue protegido
- [ ] `/api/admin/resumen` responde con token admin

## Pagos y WhatsApp
- [ ] `whatsapp/health` conserva la configuración
- [ ] webhook de Mercado Pago no quedó roto por sintaxis general del Worker

## Señal de aprobación
El cambio es razonable para seguir solo si no aparecen:
- errores 500 nuevos
- rutas perdidas
- errores de sintaxis en deploy
