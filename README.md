# ManagementApp - Local Run

## Vereisten
- Node.js 20+
- npm 10+
- PostgreSQL 14+ (voor persistente data over restarts)

## 1) Installeren
```bash
npm install
```

## 2) Environment instellen
```bash
cp .env.example .env
```

Zorg dat `DATABASE_URL` in `.env` wijst naar jouw PostgreSQL database.
Als `DATABASE_URL` leeg blijft, draait de app nog steeds, maar dan met in-memory state (data verdwijnt bij restart).

## 3) Unit tests draaien (optioneel, aanbevolen)
```bash
npm run test:unit
```

## 4) API starten
```bash
npm run dev
```

Je API draait dan op:
- `http://localhost:3000`
- Health check: `http://localhost:3000/health`
- Local UI: `http://localhost:3000/`
- Invite route (zelfde UI): `http://localhost:3000/invite`
- Leverancierspagina: `http://localhost:3000/suppliers`

## UI testen als gebruiker
1. Open `http://localhost:3000/`.
2. Kies bovenaan een profiel: `Leverancier`, `Koppel eigenaar`, `Supplier admin` of `Platform admin`.
3. Maak links onder **Nieuwe bruiloft** een bruiloft aan met `Bruiloft aanmaken`.
4. Selecteer de bruiloft in de linker lijst om de werkruimte te openen.
5. Gebruik de tabbladen in de werkruimte:
   - `Overzicht`
   - `Uitnodigingen`
   - `Chat`
   - `Planning`
   - `Draaiboek`
   - `Bestanden`
   - `Instellingen`

## Troubleshooting
Als je op `/` nog `Cannot GET /` ziet, draait meestal nog een oude server op poort `3000`.

Stop oude processen en start opnieuw:
```bash
pkill -f "tsx src/server.ts" || true
npm run dev
```

## Snelle smoke-test met curl

```bash
curl -s http://localhost:3000/health
```

Token registreren:
```bash
curl -s -X POST http://localhost:3000/v1/notifications/register-token \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-local-1" \
  -d '{"token":"device-token-1","platform":"ios"}'
```

Notification voorkeuren updaten:
```bash
curl -s -X PATCH http://localhost:3000/v1/notifications/preferences \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-local-1" \
  -d '{"weddingId":"wed-local-1","preferences":{"push:task.assigned":false}}'
```

Wedding muten:
```bash
curl -s -X PATCH http://localhost:3000/v1/notifications/mute \
  -H "Content-Type: application/json" \
  -H "x-user-id: user-local-1" \
  -d '{"weddingId":"wed-local-1","mutedUntil":null}'
```

## Belangrijk voor lokaal testen
- Runtime state wordt opgeslagen in PostgreSQL tabel `app_runtime_state` als `DATABASE_URL` is ingesteld.
- Zonder `DATABASE_URL` blijft de fallback in-memory.
- Leveranciersdirectory gebruikt PostgreSQL tabel `supplier_directory` (met seeddata bij eerste start).

## Data inzien in de database
Voorbeeld met `psql`:
```bash
psql "$DATABASE_URL" -c "SELECT state_key, updated_at FROM app_runtime_state;"
psql "$DATABASE_URL" -c "SELECT jsonb_pretty(payload) FROM app_runtime_state WHERE state_key = 'main';"
psql "$DATABASE_URL" -c "SELECT id, name, category, budget_tier, rating FROM supplier_directory ORDER BY rating DESC;"
```
