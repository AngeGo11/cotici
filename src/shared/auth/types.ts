export interface AuthUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  date_joined: string;
  numero_telephone: string;
  solde_courant: string | number;
  entrees_ce_mois: string | number;
  sorties_ce_mois: string | number;
}

export function parseAuthUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'number') return null;
  return {
    id: o.id,
    username: String(o.username ?? ''),
    email: String(o.email ?? ''),
    first_name: String(o.first_name ?? ''),
    last_name: String(o.last_name ?? ''),
    date_joined: new Date(o.date_joined as string).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' }),
    numero_telephone: String(o.numero_telephone ?? ''),
    solde_courant: o.solde_courant as string | number,
    entrees_ce_mois: (o.entrees_ce_mois ?? 0) as string | number,
    sorties_ce_mois: (o.sorties_ce_mois ?? 0) as string | number,
  };
}
