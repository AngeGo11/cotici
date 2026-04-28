import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import type { AidHistory } from '@/types';

export const SOLIDARITY_AID_HISTORY: AidHistory[] = [
  { id: '1', type: 'Aide Santé', recipient: 'Fatou K.', amount: 25000, date: '05 Fév 2026', icon: 'medical' },
  { id: '2', type: 'Aide Éducation', recipient: 'Amadou B.', amount: 30000, date: '28 Jan 2026', icon: 'education' },
  { id: '3', type: 'Urgence Famille', recipient: 'Marie K.', amount: 40000, date: '15 Jan 2026', icon: 'family' },
  { id: '4', type: 'Aide Médicale', recipient: 'Ibrahim S.', amount: 35000, date: '03 Jan 2026', icon: 'medical' },
  { id: '5', type: 'Aide Scolaire', recipient: 'Awa T.', amount: 15000, date: '20 Déc 2025', icon: 'education' },
  { id: '6', type: 'Soutien Décès', recipient: 'Koffi M.', amount: 45000, date: '08 Déc 2025', icon: 'family' },
  { id: '7', type: 'Urgence sociale', recipient: 'Groupe A.', amount: 20000, date: '22 Nov 2025', icon: 'emergency' },
  { id: '8', type: 'Aide Médicale', recipient: 'Saliou D.', amount: 60000, date: '10 Nov 2025', icon: 'medical' },
];

const iconConfig: Record<
  AidHistory['icon'],
  { name: keyof typeof Feather.glyphMap; color: string; bg: string }
> = {
  medical: { name: 'plus', color: Colors.danger, bg: withOpacity(Colors.danger, 0.08) },
  education: { name: 'book-open', color: Colors.info, bg: withOpacity(Colors.info, 0.1) },
  emergency: { name: 'alert-circle', color: Colors.brand, bg: withOpacity(Colors.brand, 0.1) },
  family: { name: 'heart', color: Colors.brand, bg: withOpacity(Colors.brand, 0.1) },
};

export function getSolidarityAidIconConfig(icon: AidHistory['icon']) {
  return iconConfig[icon];
}
