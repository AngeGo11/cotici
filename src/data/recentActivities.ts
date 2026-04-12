import type { ActivityDetail } from '@/types';

export const RECENT_ACTIVITIES: ActivityDetail[] = [
  {
    id: '1',
    type: 'Versement Tontine',
    amount: -10000,
    date: '10 Fév 2026',
    time: '14:32',
    reference: 'COT-TNT-20260210-001',
    status: 'Complété',
    method: 'Solde COTICI',
    accountHint: 'Tontine Famille — Tour 3/12',
    note: 'Cotisation mensuelle automatique.',
  },
  {
    id: '2',
    type: 'Dépôt Mobile Money',
    amount: 50000,
    date: '09 Fév 2026',
    time: '09:15',
    reference: 'COT-DEP-20260209-882',
    status: 'Complété',
    method: 'Orange Money',
    accountHint: '+225 07 •• •• 11',
  },
  {
    id: '3',
    type: 'Retrait Espèces',
    amount: -25000,
    date: '08 Fév 2026',
    time: '16:48',
    reference: 'COT-RTG-20260208-441',
    status: 'Complété',
    method: 'Wave',
    accountHint: '+225 07 •• •• 11',
    note: 'Transfert vers votre compte Wave.',
  },
  {
    id: '4',
    type: 'Transfert reçu',
    amount: 75000,
    date: '07 Fév 2026',
    time: '11:02',
    reference: 'COT-TRF-20260207-119',
    status: 'Complété',
    method: 'MTN MoMo',
    accountHint: 'De +225 05 •• •• 88',
  },
  {
    id: '5',
    type: 'Versement Tontine',
    amount: -10000,
    date: '03 Fév 2026',
    time: '08:00',
    reference: 'COT-TNT-20260203-003',
    status: 'Complété',
    method: 'Solde COTICI',
    accountHint: 'Tontine Famille — Tour 2/12',
  },
];

export function getActivityById(id: string): ActivityDetail | undefined {
  return RECENT_ACTIVITIES.find((a) => a.id === id);
}
