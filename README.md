# appweb_analyse_docs

SPA Vue 3 multi-tenant pour l'analyse de conformité Qualiopi de documents de formation
(PDF, DOCX, JPG, PNG) via un webhook n8n.

## Stack

- Vue 3 (Composition API, `<script setup>`) + Vite
- Pinia (un store par domaine)
- PrimeVue + PrimeIcons
- Tailwind CSS
- vue-i18n (FR par défaut, EN disponible)
- Supabase (Auth + PostgreSQL + RLS)
- Backend d'analyse : webhook n8n externe

## Configuration

1. Copier `.env.example` en `.env` :

   ```bash
   cp .env.example .env
   ```

2. Renseigner les variables :

   | Variable | Description |
   |---|---|
   | `VITE_SUPABASE_URL` | URL du projet Supabase |
   | `VITE_SUPABASE_ANON_KEY` | Clé publique anon Supabase |
   | `VITE_N8N_WEBHOOK_URL` | Webhook n8n par défaut. Peut être surchargé par tenant via la table `analysis_settings` (clé `webhook_url`). |

   **Ne committez jamais le fichier `.env`.**

3. Appliquer la migration SQL Supabase :

   ```bash
   # via la CLI Supabase
   supabase db push
   # ou directement
   psql "$DATABASE_URL" -f supabase/migrations/0001_initial.sql
   ```

## Scripts

```bash
npm install
npm run dev       # lance le serveur Vite (http://localhost:5173)
npm run build     # build de production
npm run preview   # preview du build
```

## Architecture

```
src/
  components/
    DocumentAnalysis.vue        # page « Analyse Docs »
  stores/
    useAuthStore.js             # session + organisation active
    useAnalysisSettingsStore.js # webhook URL + system prompt (versionnés)
    useDocTypesStore.js         # types de documents (localStorage)
  lib/
    supabase.js                 # client Supabase
  utils/
    fetchWithTimeout.js         # fetch + AbortController (60 s)
  i18n/                         # FR / EN
  main.js
  App.vue
supabase/
  migrations/0001_initial.sql   # schéma + RLS
```

## Multi-tenant

Toutes les tables (`analysis_settings`, `analysis_history`) ont une colonne
`organization_id` et des policies RLS qui filtrent strictement sur l'appartenance
de l'utilisateur courant à l'organisation (via `organization_members`).

- Lecture / écriture d'`analysis_settings` : autorisée seulement si
  `organization_id ∈ orgs(auth.uid())`.
- `system_prompt` est versionné par INSERT (jamais d'UPDATE). La lecture prend la
  ligne la plus récente. Le reset supprime les lignes `is_default = false`.
- `analysis_history` : soft delete uniquement (`deleted_at`), DELETE en dur bloqué.

## Webhook n8n

L'endpoint reçoit un POST `multipart/form-data` :

| Champ | Type | Description |
|---|---|---|
| `file` | binaire | document à analyser |
| `fileName` | string | nom original du fichier |
| `docType` | string | code (ex. `PROGRAMME_FORMATION`) ou nom personnalisé |
| `customPrompt` | string (optionnel) | contexte additionnel saisi par l'utilisateur |
| `systemPrompt` | string | prompt système actif du tenant |

Pipeline n8n attendu : extraction texte (PDF / DOCX / OCR images) → appel LLM
(`system = systemPrompt`, `user = "Type: {docType}\n{customPrompt}\n\nContenu :\n{texteExtrait}"`)
→ réponse JSON `{ "text": "Voici l'analyse :\n..." }`.

Timeout côté frontend : 60 s.

## Branche de développement

`claude/qualiopi-document-analyzer-A3b6F`
