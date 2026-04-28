import type { Invitation } from '@/types';

const base: Invitation[] = [
  {
    id: 'i1',
    idHote: 'u12',
    numTelInvite: '+2250712345678',
    idTontine: 't1',
    lien: 'https://cotici.app/invite/AXE784',
    statut: 'EN_ATTENTE',
    createdAt: "Aujourd'hui · 10:12",
    tontineNom: 'Tontine Famille Solidaire',
  },
  {
    id: 'i2',
    idHote: 'u3',
    numTelInvite: '+2250500112233',
    idTontine: 't9',
    lien: 'https://cotici.app/invite/KON504',
    statut: 'ACCEPTE',
    createdAt: 'Hier · 08:40',
    tontineNom: 'Entrepreneurs Cocody',
  },
];

let invitations: Invitation[] = [...base];

export function getInvitations(): Invitation[] {
  return [...invitations];
}

export function pushInvitation(inv: Invitation) {
  invitations = [inv, ...invitations];
}

export function updateInvitationStatus(id: string, statut: Invitation['statut']) {
  invitations = invitations.map((inv) => (inv.id === id ? { ...inv, statut } : inv));
}

function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function buildOutgoingInvitation(input: {
  inviteeName: string;
  numTel: string;
  tontineId: string;
  tontineNom: string;
}): Invitation {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  return {
    id: `i-${Date.now()}`,
    idHote: 'u12',
    numTelInvite: input.numTel,
    idTontine: input.tontineId,
    lien: `https://cotici.app/invite/${randomCode()}`,
    statut: 'EN_ATTENTE',
    createdAt: `Aujourd'hui · ${h}:${m}`,
    tontineNom: input.tontineNom,
    inviteeName: input.inviteeName,
  };
}
