/** Types partages du contrat d'API d'administration. */

/** Enveloppe de pagination standard de DRF. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Session staff renvoyee par GET /api/admin/me/. */
export interface AdminMe {
  username: string;
  first_name: string;
  last_name: string;
  role: string;
  /** Codes de permission ; miroir UI uniquement, cf. lib/permissions.ts. */
  permissions: string[];
}

/** Reponse de POST /api/admin/auth/login/ lorsque la 2FA est requise. */
/** Reponse de POST /api/admin/auth/login/ (etape mot de passe). */
export interface LoginResponse {
  /** True lorsque le compte n'a pas encore enrole sa 2FA. */
  totp_setup_required: boolean;
  /** True quand le serveur ouvre la session des le mot de passe (2FA desactivee). */
  session_established?: boolean;
  /** Etape derivee cote client, pour le routage du parcours de connexion. */
  stage?: 'totp_required' | 'totp_setup_required';
  /** Renseignes seulement au premier enrolement, via /auth/totp/setup/. */
  provisioning_uri?: string;
  secret?: string;
}

/** Reponse de POST /api/admin/auth/totp/setup/. */
export interface TotpSetupResponse {
  secret: string;
  otpauth_url: string;
}

/** Membre du staff — GET /api/admin/staff/. */
export interface StaffMember {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  is_active: boolean;
  totp_enabled: boolean;
  permissions: string[];
  last_login: string | null;
  date_joined: string;
}

/** Entree du journal d'audit — GET /api/admin/audit/. */
export interface AuditEntry {
  /**
   * Journal d'origine : "app" (action metier de l'application mobile) ou
   * "admin" (action back-office). `id` n'etant unique qu'au sein d'une
   * source, c'est le couple (source, id) qui identifie une entree.
   */
  source: 'app' | 'admin';
  id: number;
  created_at: string;
  actor: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  /** Motif saisi par l'operateur pour les actions sensibles. */
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
}

/** Indicateurs du tableau de bord. */
export interface DashboardStats {
  users_total: number;
  users_new_today: number;
  kyc_pending: number;
  wallets_balance_total: string | number;
  transactions_today: number;
  transactions_volume_today: string | number;
  transactions_failed_today: number;
  tontines_active: number;
  cagnottes_active: number;
  disputes_open: number;
}

/** Point de serie temporelle pour les graphes du tableau de bord. */
export interface TimeSeriesPoint {
  date: string;
  value: number;
}

/**
 * Utilisateur final — GET /api/admin/users/.
 *
 * Le serveur n'envoie JAMAIS le numero ni l'e-mail en clair sur cette route :
 * seuls les champs masques existent. Les valeurs reelles s'obtiennent via
 * POST /users/{id}/reveal-pii/ (permission dediee + motif + journalisation).
 */
export interface AdminUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  numero_telephone_masque: string;
  email_masque: string;
  is_active: boolean;
  date_joined: string;
  last_login: string | null;
  solde_courant: string | number;
  tontines_count: number;
}

/** Fiche utilisateur — GET /api/admin/users/{id}/. */
export interface AdminUserDetail extends AdminUser {
  tontines_hebergees: number;
  epargnes_count: number;
  transactions_count: number;
  a_un_portefeuille: boolean;
}

/** Statuts d'un dossier KYC. */
export type KycStatut = 'EN_ATTENTE' | 'EN_EXAMEN' | 'APPROUVE' | 'REJETE';

/** Paliers de verification. */
export type KycNiveau = 'NIVEAU_1' | 'NIVEAU_2' | 'NIVEAU_3';

/** Ligne de la file d'examen — GET /api/admin/kyc/. */
export interface KycSubmission {
  id: number;
  client_username: string;
  client_telephone_masque: string;
  nom_complet_declare: string;
  niveau_demande: KycNiveau;
  niveau_accorde: KycNiveau | '';
  type_piece: string;
  statut: KycStatut;
  date_soumission: string;
  date_decision: string | null;
  decide_par_username: string;
}

/**
 * Dossier complet — GET /api/admin/kyc/{id}/.
 *
 * `pieces_disponibles` liste des identifiants de piece ("recto", "verso",
 * "selfie") et non des URL : chaque consultation passe par l'endpoint
 * authentifie du back-office, qui la journalise.
 */
export interface KycSubmissionDetail extends KycSubmission {
  dossier_id: string;
  numero_piece: string;
  date_expiration_piece: string | null;
  date_naissance: string | null;
  motif_decision: string;
  pieces_disponibles: string[];
}

/** Reponse de POST /api/admin/users/{id}/reveal-pii/. */
export interface RevealedPii {
  numero_telephone: string;
  email: string;
  first_name: string;
  last_name: string;
}

/** Enveloppe d'erreur normalisee cote client. */
export interface ApiErrorPayload {
  detail?: string;
  code?: string;
  /** Erreurs par champ renvoyees par les serializers DRF. */
  [field: string]: unknown;
}

/** Parametres de liste communs (pagination, recherche, tri). */
export interface ListParams {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
  date_from?: string;
  date_to?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Type Python d'un reglage plateforme (voir
 * `apps.administration.domain.settings_catalog.SettingType` cote backend).
 * Pilote le rendu du champ de saisie correspondant.
 */
export type PlatformSettingType = 'integer' | 'decimal' | 'boolean';

/**
 * Reglage de plateforme — GET /api/admin/settings/.
 *
 * `value`, `default_value`, `min_value` et `max_value` sont deja serialises
 * cote backend dans une representation JSON stable : chaine pour un montant
 * (`value_type: 'decimal'`, jamais un nombre flottant), nombre pour un
 * entier, booleen pour un booleen. `min_value`/`max_value` valent `null`
 * quand la cle ne porte aucune borne.
 */
export interface PlatformSetting {
  key: string;
  label: string;
  description: string;
  /** Regroupement thematique pour l'affichage (ex. "wallet", "tontine"). */
  group: string;
  value_type: PlatformSettingType;
  value: string | number | boolean;
  default_value: string | number | boolean;
  min_value: string | number | null;
  max_value: string | number | null;
  /** True si aucune valeur n'a jamais ete ecrite pour cette cle (valeur du catalogue). */
  is_default: boolean;
  updated_at: string | null;
  /** Identifiant du dernier auteur de la modification, ou null si jamais modifie. */
  updated_by: string | null;
}

/**
 * Corps de PATCH /api/admin/settings/ : mise a jour partielle. Seules les
 * cles listees dans `changes` sont modifiees ; un motif est obligatoire
 * (action sensible, avant/apres consigne pour chaque cle dans le journal
 * d'audit).
 */
export interface PlatformSettingsUpdatePayload {
  changes: Record<string, string | number | boolean>;
  reason: string;
}

/** Portefeuille — ligne de GET /api/admin/wallets/. */
export interface WalletSummary {
  id: number;
  username: string;
  numero_telephone_masque: string;
  full_name: string;
  solde_courant: string | number;
  transactions_count: number;
  /** Proxy documente : date de creation du compte titulaire (le wallet lui-meme n'a pas de champ dedie). */
  created_at: string;
}

/** Mouvement affiche dans l'historique d'un portefeuille. */
export interface WalletTransactionEntry {
  id: number;
  ref_transaction: string;
  type_transaction: string;
  mode_de_paiement: string;
  montant_transaction: string | number;
  solde_courant: string | number;
  statut_transaction: string;
  date_transaction: string;
}

/** Fiche detail — GET /api/admin/wallets/{id}/. */
export interface WalletDetail extends WalletSummary {
  recent_transactions: WalletTransactionEntry[];
}

/** Corps de POST /api/admin/wallets/{id}/adjust/. */
export interface WalletAdjustPayload {
  amount: number;
  reason: string;
}

/** Organisateur d'une tontine solidaire (hote). */
export interface SolidarityHost {
  id: number;
  username: string;
  numero_telephone_masque: string;
}

/** Tontine solidaire — GET /api/admin/solidarity/ et /{id}/.
 *
 * `beneficiaire_telephone` n'est jamais renvoye en clair par l'API (PII d'un
 * tiers) : seule sa forme masquee (`beneficiaire_telephone_masque`) est
 * exposee.
 */
export interface Solidarity {
  id: number;
  hote: SolidarityHost;
  description: string;
  beneficiaire_telephone_masque: string;
  objectif_cotisation: string | number;
  montant_collecte: string | number;
  progression_pct: number;
  objectif_atteint: boolean;
  versement_effectue: boolean;
  montant_verse: string | number;
  etat: string;
  est_active: boolean;
  date_creation: string;
  date_archivage: string | null;
  date_suppression: string | null;
}

/** Hote (organisateur) d'une tontine — sous-objet imbrique des endpoints tontines. */
export interface TontineHote {
  id: number;
  username: string;
  numero_telephone_masque: string;
}

/** Ligne de liste — GET /api/admin/tontines/. Perimetre : tontines de groupe uniquement
 * (`type_tontine=GROUPE` cote backend ; les cagnottes et tontines solidaires, qui heritent
 * du meme modele en base, sont exclues et relevent d'ecrans dedies). */
export interface TontineListItem {
  id: number;
  hote: TontineHote;
  description: string;
  type_tontine: string;
  etat: 'ACTIF' | 'ARCHIVÉ' | 'SUPPRIMÉ';
  est_active: boolean;
  date_creation: string;
  date_archivage: string | null;
  date_suppression: string | null;
  membres_count: number;
  tours_count: number;
}

/** Regles de cotisation d'une tontine de groupe. */
export interface TontineRegleDetail {
  objectif_cotisation: string | number;
  montant_cotisation: string | number;
  montant_penalite: string | number;
  nombre_max: number;
  ordre_ramassage: string;
  frequence: string;
  frequence_personalise: number | null;
  nombre_tours: number;
  delai_grace_heures: number;
  penalites_automatiques: boolean;
}

/** Membre d'une tontine de groupe (fiche detail). */
export interface TontineMembreDetail {
  id: number;
  membre_id: number;
  membre_username: string;
  membre_numero_telephone_masque: string;
  role_membre: string;
  statut_membre: string;
  date_adhesion: string;
  ordre_ramassage: number;
  regles_acceptees: boolean;
}

/** Tour de cotisation d'une tontine de groupe (fiche detail). */
export interface TontineTourDetail {
  id: number;
  beneficiaire_id: number;
  beneficiaire_username: string;
  montant_depose: string | number;
  date: string;
  numero_du_tour: number;
  statut_tour: string;
  date_echeance: string | null;
}

/** Penalite impayee d'une tontine de groupe (fiche detail). */
export interface TontinePenaliteDetail {
  id: number;
  user_id: number;
  user_username: string;
  montant_penalite: string | number;
  montant_due: string | number;
  type_penalite: string;
  date_attribution_penalite: string;
}

/** Fiche detail — GET /api/admin/tontines/{id}/. */
export interface TontineDetail extends TontineListItem {
  qr_code: string;
  regle: TontineRegleDetail | null;
  membres: TontineMembreDetail[];
  tours: TontineTourDetail[];
  penalites_en_cours: TontinePenaliteDetail[];
}

/** Action de moderation disponible sur une tontine de groupe. */
export type TontineModerationAction = 'archive' | 'restore' | 'delete';

/** Corps de POST /api/admin/tontines/{id}/moderate/. */
export interface TontineModeratePayload {
  action: TontineModerationAction;
  reason: string;
}

/** Statuts possibles d'une transaction (miroir de `Transaction.STATUT_TRANSACTION`). */
export type TransactionStatus = 'EN ATTENTE' | 'ANNULÉE' | 'RÉUSSIE' | 'ÉCHOUÉE';

/** Titulaire du wallet concerne par une transaction. */
export interface TransactionTitulaire {
  id: number;
  username: string;
  numero_telephone_masque: string;
  first_name: string;
  last_name: string;
}

/** Ligne de la liste — GET /api/admin/transactions/. */
export interface AdminTransaction {
  id: number;
  ref_transaction: string;
  client_ref: string | null;
  wallet: number;
  titulaire: TransactionTitulaire;
  type_transaction: string;
  type_transaction_display: string;
  mode_de_paiement: string;
  mode_de_paiement_display: string;
  montant_transaction: string | number;
  solde_courant: string | number;
  statut_transaction: TransactionStatus;
  statut_transaction_display: string;
  date_transaction: string;
}

/** Fiche detail — GET /api/admin/transactions/{id}/. */
export interface AdminTransactionDetail extends AdminTransaction {
  tontine: number | null;
  tour: number | null;
  epargne: number | null;
}

/** Corps de POST /api/admin/transactions/{id}/force-status/. */
export interface TransactionForceStatusPayload {
  new_status: TransactionStatus;
  reason: string;
}

/** Titulaire d'une epargne personnelle (PII masquee). */
export interface SavingsHolder {
  id: number;
  nom_complet: string;
  username: string;
  numero_telephone_masque: string;
}

/** Etat d'une epargne personnelle (apps.savings.models.EpargnePersonnelle.ETAT). */
export type SavingsEtat = 'ACTIF' | 'ARCHIVÉ' | 'SUPPRIMÉ';

/** Ligne de la liste des epargnes — GET /api/admin/savings/. */
export interface SavingsListItem {
  id: number;
  titulaire: SavingsHolder;
  nom_projet: string;
  categorie: string | null;
  objectif_cotisation: number;
  cumul_verse: string | number;
  progression: number;
  etat: SavingsEtat;
  objectif_atteint: boolean;
  duree: number;
  date_creation: string;
  echeance: string | null;
}

/** Versement/retrait d'une epargne, dans son historique. */
export interface SavingsTransaction {
  id: number;
  ref_transaction: string;
  type_transaction: string;
  mode_de_paiement: string;
  montant_transaction: string | number;
  statut_transaction: string;
  date_transaction: string;
}

/** Fiche detail — GET /api/admin/savings/{id}/. */
export interface SavingsDetail extends SavingsListItem {
  montant_courant: string | number;
  date_archivage: string | null;
  date_suppression: string | null;
  historique: SavingsTransaction[];
}

/** Etat d'une cagnotte (apps.tontine.models.Tontine.ETAT, herite par Cagnotte). */
export type CagnotteEtat = 'ACTIF' | 'ARCHIVÉ' | 'SUPPRIMÉ';

/** Action de moderation acceptee par POST /api/admin/cagnottes/{id}/moderate/. */
export type CagnotteModerationAction = 'archive' | 'restore' | 'delete';

/** Organisateur (hote) d'une cagnotte. */
export interface CagnotteOrganisateur {
  id: number;
  username: string;
  numero_telephone_masque: string;
  first_name: string;
  last_name: string;
}

/** Ligne de la liste des cagnottes — GET /api/admin/cagnottes/. */
export interface CagnotteListItem {
  id: number;
  nom_cagnotte: string;
  organisateur: CagnotteOrganisateur;
  objectif_cotisation: number;
  montant_collecte: string | number;
  progression: number;
  objectif_atteint: boolean;
  recuperation_effectue: boolean;
  etat: CagnotteEtat;
  est_active: boolean;
  date_creation: string;
  date_archivage: string | null;
  date_suppression: string | null;
  membres_count: number;
}

/** Membre d'une cagnotte, dans sa fiche detail. */
export interface CagnotteMembre {
  id: number;
  membre_id: number;
  membre_username: string;
  membre_numero_telephone_masque: string;
  role_membre: string;
  statut_membre: string;
  date_adhesion: string;
}

/** Fiche detail — GET /api/admin/cagnottes/{id}/. */
export interface CagnotteDetail extends CagnotteListItem {
  description: string;
  qr_code: string;
  membres: CagnotteMembre[];
}

/** Corps de POST /api/admin/cagnottes/{id}/moderate/. */
export interface CagnotteModeratePayload {
  action: CagnotteModerationAction;
  reason: string;
}

/** Categorie d'un litige — GET /api/admin/disputes/. */
export type DisputeCategory =
  | 'transaction_contestee'
  | 'cotisation_non_creditee'
  | 'litige_entre_membres'
  | 'autre';

/** Statut d'un litige. */
export type DisputeStatus = 'ouvert' | 'en_cours_examen' | 'resolu' | 'rejete';

/** Issue possible de POST /api/admin/disputes/{id}/resolve/. */
export type DisputeResolutionOutcome = 'resolu' | 'rejete';

/** Utilisateur resume, tel que renvoye dans les FK des serializers litiges. */
export interface DisputeUserSummary {
  id: number;
  username: string;
  numero_telephone_masque: string;
}

/** Transaction resumee, rattachee a un litige (optionnelle). */
export interface DisputeTransactionSummary {
  id: number;
  ref_transaction: string;
  montant_transaction: string | number;
  statut_transaction: string;
}

/** Tontine resumee, rattachee a un litige (optionnelle). */
export interface DisputeTontineSummary {
  id: number;
  description: string;
  etat: string;
}

/** Litige — GET /api/admin/disputes/. */
export interface Dispute {
  id: number;
  opened_by: DisputeUserSummary | null;
  transaction: DisputeTransactionSummary | null;
  tontine: DisputeTontineSummary | null;
  category: DisputeCategory;
  subject: string;
  status: DisputeStatus;
  opened_at: string;
  resolved_at: string | null;
  resolved_by: DisputeUserSummary | null;
}

/** Detail d'un litige — GET /api/admin/disputes/{id}/. */
export interface DisputeDetail extends Dispute {
  description: string;
  decision: string;
  resolution_reason: string;
}

/** Corps de POST /api/admin/disputes/{id}/resolve/. */
export interface DisputeResolvePayload {
  resolution: DisputeResolutionOutcome;
  decision: string;
  reason: string;
}
