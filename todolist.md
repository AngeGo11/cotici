# Todolist — COTICI

Suivi des fonctionnalités : **fait** vs **reste à faire** (état au 2 août 2026).

_Légende : `[x]` = fait · `[ ]` = à faire · `~` = partiel / incohérence_

---

## ✅ Fait

### Authentification & infra

- [x] Auth OTP/JWT — register, login, request/verify/resend OTP, refresh, `/api/auth/me`
- [x] Proxy auth + wallet + savings + tontine + solidarité + cagnotte + notifications
- [x] Couche API centralisée (`authFetch`, `tontineApi`, `solidarityApi`, `savingsApi`, `cagnotteApi`, `notificationsApi`)
- [x] Durcissement prod — `SECRET_KEY`/`DEBUG`/`ALLOWED_HOSTS`/CORS pilotés par variables d'environnement (`config/settings.py`)
- [x] Rate limiting OTP — scopes DRF `otp_request` (5/h), `otp_verify` (20/h), `login_attempt` (10/h)
- [x] Code PIN hashé (migrations `0006`–`0008`) + purge des PIN en attente
- [x] **SMS OTP production** — provider CinetPay SMS (`apps/authn/sms.py`), `console` conservé pour le dev
  - Provider inconnu → échec bruyant (plus de fallback silencieux)
  - Aucune fuite du code OTP dans les logs hors mode `console`
  - Échec d'envoi → HTTP 503 explicite ; `OtpChallenge` jamais laissé orphelin

### Paiement Mobile Money (CinetPay)

- [x] **Dépôt (cash-in)** — Checkout API v2 (`apps/wallet/cinetpay.py`, `_deposit_cinetpay_init`)
  - Transaction `EN ATTENTE` sans crédit, `payment_url` renvoyée au mobile
  - Webhook `POST /api/wallet/deposit/notify/` — re-vérification systématique via `/v2/payment/check` avant tout crédit
  - Idempotence stricte (webhook rejoué = pas de double crédit)
  - Contrôle de conformité montant **et** devise avant crédit
- [x] **Retrait (cash-out)** — Transfer/PayOut API v1 (login token → contact → send)
  - Débit à l'initiation (fonds réservés), transaction `EN ATTENTE`
  - Remboursement automatique et idempotent si CinetPay échoue ou rejette
  - Webhook `POST /api/wallet/withdrawal/notify/` avec re-vérification `/v1/transfer/check/money`
  - Code 602 `INSUFFICIENT_BALANCE` (solde PayOut marchand) distingué du solde utilisateur
- [x] **Mobile branché** — `payment_url` ouverte via `expo-web-browser`, polling du statut (2,5 s × 12), écrans `deposit-pending` / `withdrawal-pending`
- [x] Mode `MOBILE_MONEY_SANDBOX` conservé pour le développement (comportement historique intact)

### Wallet & activités

- [x] Dépôt / retrait wallet (`POST /api/wallet/deposit|withdrawal/`)
- [x] Historique transactions + mapping activités (`activityDisplay`, `mapWalletTransaction`)
- [x] Statuts `EN ATTENTE` / `ÉCHOUÉE` / `RÉUSSIE` visuellement distincts dans l'historique
- [x] Stats mensuelles via `/api/auth/me` (entrées/sorties, épargne, cotisations tontine)
- [x] Idempotence dépôt/retrait via `client_ref` (contrainte DB partielle par wallet)
- [x] Contraintes DB defense-in-depth — solde non négatif, montant positif, cohérence des FK par type

### Épargne personnelle

- [x] Backend complet — CRUD, dépôt, retrait, archive, delete, transactions
- [x] Frontend branché API — tab, détail, création, modification, historique
- [x] Liste objectifs archivés (`/api/savings/archived/` + section UI)

### Tontine de groupe

- [x] Création + règles + invitations (envoi, accept, refuse, preview)
- [x] Ordre de ramassage (`DefineOrdreRamassageScreen`)
- [x] Cotisations, démarrage tour, clôture tour, versement bénéficiaire
- [x] Chat tontine (REST + polling)
- [x] Modèle lifecycle — `etat` (ACTIF/ARCHIVÉ/SUPPRIMÉ), migrations `0010`/`0011` présentes
- [x] Archive/delete backend + UI **hôte** — garde-fous cycle (`groupe_retrait_bloque_raison`)

### Solidarité — collecte ciblée

- [x] Création, preview, cotiser (tout utilisateur Cotici), verser (organisateur)
- [x] Listes organisateur / contributeur (`mine/`, `contributions/`)
- [x] Partage lien/QR (`ShareSolidarityCollectScreen`)
- [x] Archive/delete backend (0 contributeur) + UI organisateur

### Cagnotte association

- [x] `cagnotteApi.ts` + routes proxy `/api/cagnotte/*`
- [x] `CreateAssociationFundScreen` — POST réel via `createCagnotte()`
- [x] Écrans collecte / détail / partage (`CagnotteDetailScreen`, `ShareCagnotteScreen`, `app/cagnotte-collect/[id].tsx`)
- [x] Bug `nom_cagnotte` normalisé via `_normalize_phone` — **corrigé**
- [x] Types de transaction dédiés `CONTRIBUTION_CAGNOTTE` / `VERSEMENT_CAGNOTTE` (contrainte DB corrigée)

### Notifications

- [x] Backend complet — `api/`, `services/notification_service.py`, `repositories/`, `domain/catalog.py`
- [x] Exposé sur `/api/notifications/` + proxy (mark_read, mark_all_read, unread_count)
- [x] `NotificationsScreen` branché API (`useNotifications`, `useUnreadNotificationsCount`)
- [x] Commande de rappel de cotisation (`send_cotisation_reminders.py`)

### Back-office administrateur (`cotici-admin`) — socle (phase 0)

- [x] **App Django dédiée** `backend/apps/administration/` — n'possède aucune donnée métier, elle orchestre les apps existantes
- [x] `StaffProfile` (OneToOne `User`) + `StaffLoginAttempt` — sans profil staff actif, `/api/admin/` est inaccessible par construction
- [x] **Rôles et permissions en Python** (`domain/roles.py`) — 5 rôles (`super_admin`, `operateur`, `support`, `auditeur` lecture seule, `compliance`) × 18 codes de permission ; la matrice vit en Git, donc élargir un droit passe par une revue de code
- [x] **Authentification isolée du mobile** — session Django (`cotici_admin_sessionid`, HttpOnly/`SameSite=Strict`) + TOTP, jamais de JWT ; `AdminSessionAuthentication` **rejette explicitement** tout `Authorization: Bearer`
- [x] Second facteur pilotable par `ADMIN_TOTP_REQUIRED` (défaut `True` : un réglage absent ne peut pas désactiver la 2FA en silence)
- [x] **3 middlewares** — allowlist IP (CIDR, `X-Forwarded-For` honoré seulement si un nombre de proxys de confiance est configuré), expiration d'inactivité, et journal d'audit **automatique** sur toute écriture `/api/admin/` (y compris 403/500)
- [x] `AdminActionLog` immuable (`apps/audits`) — acteur, rôle au moment de l'action, cible, motif obligatoire sur les actions sensibles, before/after, IP, statut HTTP
- [x] **API** — `auth/` (csrf, login, totp setup/verify, logout), `me/` (profil + permissions effectives), `staff/` (création, changement de rôle, activation/désactivation, réinitialisation 2FA — toutes auditées, auto-modification interdite), `audit/` (lecture unifiée `AuditLog` + `AdminActionLog`, paginée)
- [x] Throttling dédié `admin_login` (par IP **et** par compte) / `admin_action`
- [x] `manage.py create_staff` — amorçage du premier super-admin hors API
- [x] **SPA `admin/`** (projet Vite autonome, port 5174) — domaine, déploiement et cookie isolés du site public
  - Shell, navigation filtrée par permissions, gardes de route, minuteur d'inactivité
  - Modules fonctionnels : tableau de bord, **journal d'audit**, **gestion du staff**
  - 18 composants UI (dont `ReasonDialog` imposant un motif), client API à cookie de session (aucun token en JS)
- [x] 35 tests dédiés — matrice des rôles, flux TOTP complet, **JWT mobile rejeté sur `/api/admin/`**, allowlist IP, audit systématique, mode sans 2FA, CSRF après rotation de jeton

### Tests backend — 382 tests verts

- [x] wallet (8 fichiers) — dépôt, retrait, idempotence, CinetPay dépôt + retrait, validation, stats, téléphone
- [x] tontine (6) — endpoints, lifecycle, cotisations, concurrence, changement de tour, IDOR
- [x] solidarity (4) — création/cotisation, idempotence, IDOR, versement bénéficiaire
- [x] cagnotte (4) — création/cotisation, idempotence, IDOR, récupération
- [x] authn (3) — sécurité PIN, purge + throttle login, SMS/OTP
- [x] savings (2) — endpoints, IDOR
- [x] notifications (1), audits (1) — immuabilité de l'`AuditLog`
- [x] administration (7) — rôles, auth TOTP, isolation JWT, allowlist IP, audit, mode sans 2FA, CSRF

### Divers

- [x] Raccourcis démo retirés de `LandingScreen`
- [x] `AuditLog` réellement écrit (tontine, wallet) et testé

---

## 🔲 Reste à faire

### 🔴 Bloquants avant production

#### Conformité réglementaire

- [ ] **KYC/AML** — aucun champ sur le modèle `User` (`apps/authn/models.py`)
  - Paliers de vérification par montant (seuils à définir avec un référent conformité UEMOA)
  - Pièce d'identité (upload, stockage chiffré, statut de validation)
  - Statut KYC bloquant sur les opérations au-delà d'un seuil
  - Durée de rétention légale des données
- [ ] Détection AML sur les cash-out (seuils, alertes, gel de compte)

#### Validation CinetPay en conditions réelles

- [ ] Ouvrir le **compte SMS CinetPay** (séparé du compte marchand — `hello@cinetpay.com`)
- [ ] Faire approuver le **sender ID** (`CINETPAY_SMS_SENDER`) auprès des opérateurs
- [ ] Valider la liste complète des `groupName` SMS (seul `PENDING` est accepté aujourd'hui)
- [ ] Valider le format réel du POST `notify_url` (dépôt) — form-urlencoded vs JSON
- [ ] Valider les bodies `/v1/transfer/contact` et `/money/send/contact` (retrait)
- [ ] Valider la liste réelle des `treatment_status` de transfert
- [ ] Faire **whitelister l'IP publique du serveur** chez CinetPay (sinon chaque retrait attend une validation manuelle en back-office)
- [ ] Alimenter et surveiller le **solde PayOut** marchand (compte séparé, code 602 si vide)
- [ ] Décider du deep-link de retour de paiement (`openAuthSessionAsync` vs `openBrowserAsync` actuel)

#### Infra & exploitation

- [ ] **CI/CD** — aucun `.github/workflows/` (tests + lint + build sur PR)
- [ ] **Dockerfile** backend absent (seul `docker-compose.yml` avec le service `db` existe)
- [ ] **Monitoring** — Sentry ou équivalent non configuré (`config/settings.py`)
- [ ] Backups PostgreSQL + procédure de restauration testée
- [ ] Garde de routes auth — `app/_layout.tsx` n'a aucun `Redirect` (non connecté → login)

#### Back-office — à verrouiller avant production

- [ ] **`ADMIN_TOTP_REQUIRED=True`** — actuellement à `False` dans le `.env` local (confort de développement). En l'état, le mot de passe est le seul rempart devant les soldes et les données personnelles
- [ ] **Neutraliser `/admin/` (django-admin)** — il contourne totalement `AdminActionLog` et permet de muter `Wallet.solde_courant` sans laisser de trace : préfixe secret par variable d'environnement, puis désactivation en production
- [ ] Renseigner `ADMIN_IP_ALLOWLIST` (vide = refus au boot hors `DEBUG`, mais rien n'est configuré aujourd'hui) et `ADMIN_TRUSTED_PROXY_COUNT` selon le reverse proxy réel
- [ ] Rôle PostgreSQL applicatif sans `UPDATE`/`DELETE` sur `AuditLog` / `AdminActionLog` — l'immuabilité Python est contournable par `queryset.update()`, qui ne passe pas par `save()`
- [ ] Politique de rétention distincte des journaux admin (5–10 ans) vs journaux utilisateurs

---

### 🟠 Haute priorité

#### Lifecycle & cohérence données

- [ ] `cycle_termine()` dépend encore de `est_active` (`apps/tontine/helpers.py:143`) — doit s'appuyer sur `etat`
- [ ] `apps/tontine/views.py:719-720` met `est_active=False` sans mettre à jour `etat`
- [ ] Archive/delete **par membre** d'une tontine de groupe :
  - Tontine **terminée** → le membre peut l'archiver/la supprimer de **sa** liste
  - Cycle **en cours** → interdit
  - Cycle **pas commencé** + hôte a supprimé → le membre peut supprimer de sa liste
  - Nécessite un état par membre sur `TontineMembre` + endpoints dédiés
- [ ] Listes **archivées** — tontines de groupe + collectes solidaires (endpoint + UI, comme l'épargne)
- [ ] Archive/delete lifecycle **cagnotte** (absent de `apps/cagnotte/urls.py`)

#### Admin tontine — entièrement mocké

- [ ] `AdminScreen.tsx:19-32` — `joinRequests`, `paymentValidations`, `penalties` en dur, aucun appel API
- [ ] Wrapper pénalités dans `tontineApi.ts` (backend `POST /api/tontine/penalites/attribuer/` + proxy déjà OK)
- [ ] `ExclureMembreScreen` — **endpoint backend inexistant** + branchement mobile
- [ ] `ModifierReglesScreen` — modification des règles post-création + API (`handleSave` fait juste `router.back()`)
- [ ] Supprimer la définition de l'ordre par l'admin (à revoir)

#### Back-office — phase 1 (lecture seule)

Chaque module a déjà son dossier, ses endpoints réservés et une page « à venir » côté SPA ; il reste la logique.

- [ ] `/api/admin/dashboard/stats|series/` — **non implémenté** : le tableau de bord du back-office affiche son état d'erreur
- [ ] Utilisateurs — liste, détail, sessions actives (+ masquage des numéros par défaut, révélation à l'unité **journalisée** `user.pii_reveal`)
- [ ] Wallets — consultation solde et transactions
- [ ] Transactions — liste, détail, filtres (date, statut, montant, utilisateur)
- [ ] Tontines / cagnottes / épargnes / collectes — consultation

#### Back-office — phase 2 (actions & métier)

- [ ] Suspension / réactivation d'utilisateur
- [ ] Modération tontine / cagnotte
- [ ] **Ajustement de wallet** — doit créer une `Transaction` de type dédié (`AJUSTEMENT_ADMIN` à ajouter), jamais un `UPDATE` de `solde_courant`, sous peine de rendre le solde irréconciliable
- [ ] Réconciliation Mobile Money CinetPay / forçage de statut (idempotence via `client_ref`)
- [ ] Modèles **KYC** (`KycDocument`, `KycReview`) et **litiges** (`Dispute`, `DisputeMessage`) — inexistants
- [ ] Exports CSV/PDF, notifications staff

#### Profil & stats

- [ ] `ProfileTabScreen.tsx` — compteurs hardcodés `value: '2'` (lignes 59, 68, 77, 89, 98, 107)
- [ ] Exposer les counts lifecycle dans `apps/authn/urls.py` (`count_tontine_actif`, `count_tontine_by_user`, `count_savings` existent mais ne sont pas routés)
- [ ] `EditProfileScreen` — mise à jour du profil via API (lecture seule aujourd'hui)
- [ ] `SecurityScreen` — PIN / biométrie branchés API (aucun import `LocalAuthentication`)

---

### 🟡 Priorité moyenne

#### Notifications & échéances

- [ ] **Push notifications** — ni `expo-notifications`, ni FCM, nulle part
  - D'autant plus nécessaire que les paiements CinetPay sont asynchrones (le polling mobile s'arrête à 30 s)
- [ ] `UPCOMING_DEADLINES` — `src/data/upcomingDeadlines.ts` encore consommé par `HomeTabScreen` et `ProchainesEcheancesScreen`

#### Solidarité (autres modes)

- [ ] `SolidarityScreen` — tontine solidaire « groupe », 100 % statique et orpheline (`app/solidarity.tsx` redirige vers `/(tabs)/tontine`)
- [ ] Demande d'aide d'urgence + `SolidarityAidHistoryScreen` (mocks)

#### Cohérences produit

- [ ] Admin vs hôte — backend `user_is_tontine_admin` vs UI `isHost` seulement (`TontineDetailsScreen`)
- [ ] Solidarité archive/delete — filtre `hote=user`, ignore l'admin co-organisateur
- [x] ~~**API de lecture de l'audit**~~ — désormais exposée côté back-office (`GET /api/admin/audit/`, lecture unifiée `AuditLog` + `AdminActionLog`). `apps/audits/urls.py` n'expose toujours qu'un health-check côté mobile, ce qui est le comportement voulu
- [ ] Parcours d'inscription — une seule source de vérité (`CreateAccountScreen` ↔ OTP)
- [ ] Ledger en partie double — le wallet reste sur un modèle de solde unique

---

### 🟢 Priorité basse

- [ ] **Tests frontend** — 0 test RN (aucun `*.test.ts(x)` ni `__tests__`), et 0 test sur la SPA `admin/`
- [ ] Tests backend `apps/utils` (zéro couverture) et endpoints `count_*`/`me` de `authn`
- [ ] App **web** (`web/`) — très en retard sur le mobile, pas de parité fonctionnelle
- [ ] Nettoyage legacy — `tontinePhase.ts` (encore utilisé par `AdminScreen`), style orphelin `demoLink` dans `LandingScreen`, données mock mortes
- [ ] UX réseau — retry, états vides homogènes sur toutes les listes
- [ ] Accessibilité / confirmations de montants sur les parcours financiers
- [ ] Différencier textuellement `ANNULÉE` et `ÉCHOUÉE` dans l'historique (même libellé « Annulé »)

---

## ⚠️ Incohérences connues

| Problème | Fichier / zone |
|----------|----------------|
| `cycle_termine()` dépend de `est_active` au lieu de `etat` | `backend/apps/tontine/helpers.py:143` |
| Fin de cycle met `est_active=false` sans changer `etat` | `backend/apps/tontine/views.py:719-720` |
| Tontine archivée → aucun écran de consultation | Pas d'équivalent `SavingsTabScreen` archivés |
| Membre ne peut pas retirer une tontine terminée de sa liste | UI + backend manquants |
| `AdminScreen` 100 % mocké (faux noms, fausses dates) | `src/modules/profile/screens/AdminScreen.tsx:19-32` |
| Stats profil fictives (`'2'` en dur) | `src/modules/profile/screens/ProfileTabScreen.tsx` |
| `ExclureMembreScreen` / `ModifierReglesScreen` sans backend | `src/modules/tontine/screens/` |
| 2FA du back-office désactivée en local (`ADMIN_TOTP_REQUIRED=False`) | `.env` |
| `/admin/` (django-admin) contourne `AdminActionLog` et permet de muter les soldes | `backend/config/urls.py` |
| Tableau de bord du back-office sans endpoint de métriques | `/api/admin/dashboard/*` (phase 1) |
| Aucune garde de route auth | `app/_layout.tsx` |
| `SolidarityScreen` (mode groupe) mocké et orphelin | `src/modules/solidarity/screens/SolidarityScreen.tsx` |

---

## Synthèse maturité

| Module | Maturité |
|--------|----------|
| Auth / OTP SMS | ✅ Production-ready (compte SMS CinetPay à ouvrir) |
| Paiement Mobile Money | ✅ Code complet · ⚠️ à valider en sandbox réel |
| Wallet | ✅ Complet (ledger simple, pas de partie double) |
| Épargne | ✅ Complet |
| Tontine groupe (core) | ✅ Complet |
| Tontine lifecycle | ~ Hôte OK · membre + listes archivées manquants |
| Solidarité collecte | ✅ Complet (hôte) |
| Cagnotte association | ~ Complet hors archive/delete |
| Notifications in-app | ✅ Complet · ❌ push absent |
| Admin tontine (mobile) / pénalités / exclusion | ❌ Mock |
| Back-office — socle sécurité, auth, audit, staff | ✅ Complet (phase 0) |
| Back-office — modules métier | ❌ Stubs (phases 1 et 2) |
| Profil / stats lifecycle | ❌ Mock |
| KYC / AML | ❌ Inexistant — **bloquant réglementaire** |
| CI/CD / monitoring | ❌ Inexistant |
| App web | ❌ Très en retard sur le mobile |

---

_Dernière mise à jour : 2 août 2026_
