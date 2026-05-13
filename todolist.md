# Todolist — implémentation COTICI

Suivi des fonctionnalités restantes (état repéré : auth + proxy opérationnels ; modules métier backend en `health/` uniquement ; beaucoup d’écrans sur données statiques / mocks).

---

## 1. Authentification et navigation

- [ ] Garde de routes : utilisateur non connecté → `login` ; connecté → ne plus exposer landing/login comme entrée par défaut si besoin produit.
- [ ] Retirer ou conditionner les raccourcis « démo » (`LandingScreen`, `LoginScreen` : accès direct au dashboard).
- [ ] Vérifier le parcours inscription (`CreateAccountScreen` ↔ `register` / `request-otp` + `verify-otp`) et une seule source de vérité.
- [ ] Valider `parseAuthUser` / `date_joined` (réponse JSON du backend) et erreurs réseau au refresh token.

---

## 2. Client API et proxy

- [ ] Étendre `proxy-server.mjs` **ou** documenter / utiliser `EXPO_PUBLIC_BACKEND_URL` pour les appels vers `/api/savings/`, `/api/tontine/`, `/api/wallet/`, etc.
- [ ] Couche API centralisée (fetch + `Authorization: Bearer`) pour les ressources métier, sur le modèle de `src/shared/auth/authApi.ts`.

---

## 3. Wallet et mouvements d’argent

- [ ] Backend `apps.wallet` : endpoints (solde détaillé, historique, opérations métier).
- [ ] App : brancher accueil / historique / dépôts / retraits (`MakeDepositScreen`, `RetraitScreen`, `DepositToAccountScreen`, …) sur l’API.

---

## 4. Épargne

- [ ] Backend `apps.savings` : objectifs, versements, historique, soldes par objectif.
- [ ] App : remplacer les mocks (`src/data/savingsContributions.ts`, écrans objectifs / détail) et lier les écrans « succès » aux réponses serveur.

---

## 5. Tontines

- [ ] Backend `apps.tontine` : tontines, tours, membres, cotisations, invitations, règles.
- [ ] App : onglet et écrans (création, modification règles, exclusion membre, invitations) branchés sur l’API.

---

## 6. Solidarité

- [ ] Backend `apps.solidarity` : fonds / caisses, aides, règles.
- [ ] App : écrans création et historique solidarité connectés à l’API.

---

## 7. Notifications et messagerie

- [ ] Backend `apps.notifications` : liste, marquage lu, éventuellement enregistrement device pour push.
- [ ] App : remplacer `MOCK_NOTIFICATIONS` dans `NotificationsScreen.tsx`.
- [ ] Chat : choix architecture (REST vs WebSocket) ; implémenter backend + `ChatScreen`.

---

## 8. Activité et échéances

- [ ] Remplacer `RECENT_ACTIVITIES` et données de `upcomingDeadlines.ts` (« à remplacer par l’API ») par des endpoints dédiés.
- [ ] Brancher `ProchainesEcheancesScreen` et blocs associés sur l’API.

---

## 9. Profil et paramètres

- [ ] Endpoint + app : mise à jour profil depuis `EditProfileScreen`.
- [ ] Contenu / liens réels pour sécurité, aide, CGU (et endpoints si besoin).

---

## 10. SMS et durcissement production (backend)

- [ ] Intégrer un fournisseur SMS réel dans `_send_sms` (`apps/authn/views.py`) au-delà du mode console.
- [ ] Django : `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, CORS, rate limiting sur OTP.

---

## 11. Qualité et finitions

- [ ] Tests automatisés (auth + au moins un flux métier critique).
- [ ] UX réseau : erreurs, retry, états vides sur les listes.
- [ ] Passe accessibilité / cohérence sur les parcours financiers (montants, confirmations).

---

_Légende : cocher les cases au fil de l’avancement (`[x]`)._
