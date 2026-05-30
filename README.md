# Cotici — guide de contexte pour le développement (IA & contributeurs)

Ce document décrit le projet **Cotici** pour qu’un assistant (Claude, Cursor, etc.) ou un nouveau développeur puisse reprendre le travail sans perdre de contexte.

---

## 1. Qu’est-ce que Cotici ?

**Cotici** est une application mobile (et site vitrine) orientée **Afrique de l’Ouest** pour gérer :

| Domaine | Description |
|--------|-------------|
| **Tontines** | Tontines de groupe, solidaires, cagnottes d’association — tours, règles, invitations, pénalités |
| **Épargne personnelle** | Objectifs (voyage, mariage, etc.) avec montant cible et durée |
| **Portefeuille (wallet)** | Solde Cotici, dépôts / retraits via opérateurs mobiles (Orange, MTN, Wave, Moov) |
| **Solidarité** | Fonds et aides (UI présente, backend minimal) |
| **Notifications & chat** | UI présente, données encore mockées |

Langue produit : **français**. Devise affichée : **FCFA**. Identité visuelle : vert `#009E60` (marque), orange `#FF7800` (accent).

---

## 2. Structure du dépôt (monorepo)

```
cotici/
├── app/                    # Routes Expo Router (fichiers = écrans)
├── src/
│   ├── modules/            # Logique métier par domaine (auth, tontine, savings, …)
│   ├── shared/             # API, auth, thème, UI partagée
│   ├── components/         # Composants transverses (tab bar, paiement, …)
│   ├── data/               # Données statiques / mocks (à remplacer par l’API)
│   └── constants/          # Anciens tokens (préférer shared/theme/)
├── backend/                # API Django REST
├── web/                    # Landing marketing (Vite + React, indépendant de l’app mobile)
├── proxy-server.mjs        # Proxy Node entre l’app mobile et Django
├── start.sh                # Lance Django + proxy + Expo en parallèle
├── todolist.md             # Backlog fonctionnel détaillé
└── .env                    # Variables locales (non versionné idéalement)
```

**Règle d’architecture frontend** : les écrans vivent dans `src/modules/<domaine>/screens/`, les routes dans `app/` ne font qu’**exporter** le screen :

```tsx
// app/(tabs)/savings.tsx
export { default } from '@/modules/savings/screens/SavingsTabScreen';
```

Alias TypeScript : `@/*` → `src/*` (voir `tsconfig.json`).

---

## 3. Stack technique

| Couche | Technologies |
|--------|----------------|
| **App mobile** | Expo 55, React 19, React Native 0.83, **expo-router** (file-based routing) |
| **Site web** | Vite 6, React 19, Tailwind (`web/`) |
| **API** | Django 5.x (settings indiquent 5.2), **Django REST Framework**, **SimpleJWT** |
| **Base de données** | PostgreSQL (port souvent `5433` en local) |
| **Proxy dev** | Serveur HTTP Node natif (`proxy-server.mjs`, port **8001**) |
| **Stockage tokens** | `expo-secure-store` |

Polices : **Space Grotesk** (titres), **Outfit** (corps) — chargées dans `app/_layout.tsx`.

---

## 4. Démarrage en local

### Prérequis

- Node.js + npm
- Python 3 + venv dans `backend/.venv` (ou racine)
- PostgreSQL avec une base configurée dans `.env`

### Variables d’environnement (`.env` à la racine)

```env
DB_NAME=...
DB_USER=...
DB_PASSWORD=...
DB_HOST=127.0.0.1
DB_PORT=5433
EXPO_PUBLIC_PROXY_URL=http://localhost:8001
```

Sur **appareil physique** ou **émulateur Android**, remplacer `localhost` par l’IP LAN de la machine (ex. `http://192.168.x.x:8001`).

### Lancer tout d’un coup

```bash
./start.sh
```

Démarre dans l’ordre :

1. **Django** — `http://127.0.0.1:8000`
2. **Proxy** — `http://127.0.0.1:8001` (`npm run proxy`)
3. **Expo** — `npm run start` (puis `i` / `a` / `w`)

### Commandes utiles

```bash
# Backend seul
cd backend && .venv/bin/python manage.py migrate
cd backend && .venv/bin/python manage.py runserver

# Migrations après changement de modèles
python manage.py makemigrations && python manage.py migrate

# Site marketing
npm run web:site

# Superuser Django (voir commentaires dans .env)
```

Admin Django : `/admin/`.

---

## 5. Architecture réseau — point critique

L’app mobile **ne parle pas directement à Django** en développement : elle appelle le **proxy** sur le port **8001**, qui relaie vers Django sur **8000**.

```
[Expo App]  --fetch-->  [proxy-server.mjs :8001]  --fetch-->  [Django :8000]
              /api/*              réécrit les chemins
```

- URL de base côté app : `getApiBaseUrl()` dans `src/shared/auth/authApi.ts` → `process.env.EXPO_PUBLIC_PROXY_URL` ou `http://127.0.0.1:8001`.
- **Toute nouvelle route API** doit être ajoutée à **deux endroits** :
  1. `backend/apps/<app>/urls.py` + vues Django
  2. `proxy-server.mjs` (mapping explicite `/api/...` → `/api/.../` Django)

Routes actuellement exposées par le proxy (extrait) :

| Proxy (app) | Django |
|-------------|--------|
| `POST /api/login` | `/api/auth/login/` |
| `POST /api/register` | `/api/auth/register/` |
| `POST /api/request-otp`, `/api/verify-otp`, `/api/resend-otp` | auth OTP |
| `POST /api/refresh` | `/api/auth/refresh/` |
| `GET /api/me` | `/api/auth/me/` (+ Bearer) |
| `POST /api/wallet/deposit/`, `withdrawal/` | wallet |
| `GET /api/wallet/transactions/` | wallet |
| `POST /api/tontine/create/`, `regles/`, `penalites/attribuer/`, `tours/changer/`, `invitations/` | tontine |
| `GET /api/savings/`, `POST /api/savings/create/` | savings |

Les modules **solidarity**, **notifications**, **audits** n’ont pour l’instant que `health/` côté backend et **aucune route proxy**.

Pattern API frontend recommandé (déjà en place pour wallet & savings) :

- Fichiers dans `src/shared/api/*.ts`
- Retour `{ ok: true, data } | { ok: false, detail: string }`
- JWT : `Authorization: Bearer ${accessToken}` via `getAccessToken()` (`src/shared/auth/tokenStorage.ts`)

---

## 6. Authentification

- Modèle utilisateur custom : `backend/apps/authn` → `AUTH_USER_MODEL = "authn.User"`.
- Champs métier : `code_pin` (4 chiffres), `numero_telephone`.
- Flux : inscription / login → **OTP** (`OtpChallenge`) → tokens JWT (`access` + `refresh`).
- En dev, les SMS sont souvent loggés en console (pas de fournisseur SMS réel).
- Contexte React : `AuthProvider` dans `src/shared/auth/AuthContext.tsx` — `useAuth()`, `signIn`, `signOut`, `refreshUser`.
- Au démarrage : rehydratation via token + `/api/me` ou refresh.

Écrans : `app/login.tsx`, `create-account.tsx`, `otp.tsx` → modules dans `src/modules/auth/screens/`.

**À faire** (voir `todolist.md`) : garde de routes stricte, retirer les raccourcis « démo » sur landing/login.

---

## 7. Modules backend Django

| App | Rôle | État API |
|-----|------|----------|
| `authn` | Users, OTP, JWT, `/me` | ✅ Complet |
| `wallet` | Wallet, dépôt, retrait, historique transactions | ✅ Endpoints principaux |
| `tontine` | Création, règles, pénalités, changement de tour, invitations | ✅ Plusieurs POST (pas de liste GET exposée au proxy) |
| `savings` | `EpargnePersonnelle` — liste + création | ✅ En cours d’intégration app |
| `solidarity` | Modèles | ⚠️ `health/` seulement |
| `notifications` | — | ⚠️ `health/` seulement |
| `audits` | — | ⚠️ `health/` seulement |

Modèle épargne (`EpargnePersonnelle`) : `hote`, `nom_projet`, `objectif_cotisation`, `montant_courant`, `categorie`, `duree`, `date_creation`.

**Écart connu** : `list_savings` ne renvoie pas encore `categorie` ni `duree` dans le JSON alors que le type frontend `SavingsGoal` les attend — à aligner lors des prochains changements.

---

## 8. Modules frontend (`src/modules/`)

| Module | Onglet / routes | Données |
|--------|-----------------|---------|
| `auth` | login, OTP, création compte | API ✅ |
| `common` | Landing, accueil, succès, CGU | Accueil : solde user API ; échéances = mock |
| `tontine` | `(tabs)/tontine`, détails, invitations, règles | Mix API + `src/modules/tontine/data/` |
| `savings` | `(tabs)/savings`, objectifs, dépôts | **Liste/création API** ; historique contributions = mock |
| `activity` | activités récentes, échéances | Wallet transactions API ; deadlines = mock |
| `profile` | `(tabs)/profile`, admin, sécurité | User API |
| `notifications` | notifications, chat | **Mocks** |
| `solidarity` | solidarité, règles, historique | **Mocks / statique** |

Navigation principale (4 onglets) : `app/(tabs)/_layout.tsx` — Accueil, Tontines, Épargne, Profil. Tab bar custom : `src/components/MainTabBar.tsx`.

Thème : `src/shared/theme/` (`Colors`, `Theme`, `Fonts`). Préférer ces imports plutôt que `src/constants/` (legacy).

---

## 9. État d’avancement (résumé)

### Déjà branché sur l’API (via proxy)

- Auth complète (register, OTP, login, refresh, me)
- Wallet : dépôt, retrait, liste transactions (`walletApi.ts`, `useWalletActivities`)
- Tontine : création, règles, pénalités, tours, invitations (appels depuis écrans tontine — vérifier chaque écran)
- Épargne : `fetchSavingsGoals`, `createSavingsGoal` (`savingsApi.ts`, hook `useSavingsGoals`)

### Encore mock / statique

- `src/data/savingsContributions.ts`
- `src/data/recentActivities.ts` (partiellement remplacé par wallet)
- `src/data/upcomingDeadlines.ts`
- `src/data/invitationStore.ts`
- `MOCK_NOTIFICATIONS` dans `NotificationsScreen.tsx`
- Données tontine dans `src/modules/tontine/data/tontines.ts`, `tontinePhase.ts`

Backlog détaillé : **`todolist.md`** à la racine.

---

## 10. Travail récent (épargne)

Branche de travail typique (non commitée au moment de la rédaction) :

- Migrations `0002` (categorie), `0003` (duree) sur `EpargnePersonnelle`
- Endpoints `GET /api/savings/`, `POST /api/savings/create/`
- Proxy + `savingsApi.ts` + `useSavingsGoals.ts`
- Écrans `SavingsTabScreen`, `CreatePersonalGoalScreen` connectés à l’API

Lors d’ajouts sur l’épargne : penser aux versements (`VERSEMENT_EPARGNE_PERSONNELLE` dans `wallet.Transaction`) et à exposer les routes dans le proxy.

---

## 11. Conventions de code

1. **Minimiser le scope** — pas de refacto hors sujet.
2. **Français** — libellés UI, messages d’erreur API, commentaires métier.
3. **Expo Router** — nouveau screen = fichier dans `app/` + implémentation dans `src/modules/.../screens/`.
4. **Pas de commit automatique** — l’utilisateur demande explicitement les commits.
5. **Secrets** — ne pas committer `.env` ; `SECRET_KEY` Django est encore en dur (dev only).
6. **Tests backend** — existent pour wallet (`backend/apps/wallet/tests/`).
7. **Montants** — `Decimal` côté Django, entiers FCFA dans beaucoup d’écrans ; utiliser `parseBalance` / `formatFcfaDots` côté shared auth.

---

## 12. Fichiers clés à lire en premier

| Fichier | Pourquoi |
|---------|----------|
| `start.sh` | Orchestration dev |
| `proxy-server.mjs` | Contrat API mobile ↔ Django |
| `backend/config/settings.py` | Apps, DB, JWT, CORS |
| `backend/config/urls.py` | Montage des apps |
| `src/shared/auth/AuthContext.tsx` | Session utilisateur |
| `src/shared/api/walletApi.ts` | Modèle d’appel API typé |
| `src/shared/api/savingsApi.ts` | Épargne |
| `app/_layout.tsx` | Stack navigation + providers |
| `todolist.md` | Priorités produit |

---

## 13. Instructions pour l’assistant IA

Quand tu aides sur Cotici :

1. **Lire `todolist.md`** pour la priorité produit avant d’inventer des features.
2. **Vérifier le proxy** si un appel réseau échoue en 404 depuis l’app — souvent la route manque dans `proxy-server.mjs`.
3. **Ne pas confondre** `web/` (landing) et l’app Expo dans `app/` + `src/`.
4. **Préférer** étendre `src/shared/api/` plutôt que des `fetch` éparpillés dans les screens.
5. **Aligner** types TS ↔ réponses JSON Django (noms de champs français / snake_case).
6. **Migrations** : après changement de `models.py`, proposer `makemigrations` + `migrate`.
7. **Répondre en français** à l’utilisateur (règle projet).
8. Pour un nouvel endpoint : backend view → url → proxy → `*Api.ts` → hook ou screen.

### Checklist nouveau endpoint

- [ ] Vue + URL Django (`/api/<app>/.../`)
- [ ] Route dans `proxy-server.mjs` si l’app mobile passe par le proxy
- [ ] Client dans `src/shared/api/`
- [ ] Export dans `src/shared/api/index.ts` si public
- [ ] Brancher l’écran / hook ; retirer le mock associé dans `src/data/` si applicable

---

## 14. Site web (`web/`)

Landing marketing indépendante (composants `web/src/components/landing/`). Ne partage pas le code métier de l’app mobile. Scripts : `npm run web:site`, `npm run web:site:build`.

---

## 15. Ressources internes

- **Logo / assets** : `assets/`
- **Preview navigation** : écran `nav-preview` (outil dev)
- **Agent transcripts** (Cursor) : historique de sessions passées si besoin de contexte

---

_Dernière mise à jour : mai 2026 — à actualiser quand de gros modules passent de mock à API._
