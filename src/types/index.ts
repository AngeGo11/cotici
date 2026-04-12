export interface Member {
  id: string;
  name: string;
  avatar: string;
  status: 'paid' | 'current' | 'late';
  amount?: number;
  turn?: number;
}

export interface Activity {
  id: string;
  type: string;
  amount: number;
  date: string;
}

/** Activité avec métadonnées pour l’écran détail */
export interface ActivityDetail extends Activity {
  time: string;
  reference: string;
  status: 'Complété' | 'En cours' | 'Annulé';
  method: string;
  accountHint?: string;
  note?: string;
}

export interface Message {
  id: string;
  type: 'user' | 'system' | 'alert';
  sender?: string;
  content: string;
  time?: string;
  isMe?: boolean;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
}

export interface JoinRequest {
  id: string;
  name: string;
  avatar: string;
  phone: string;
  requestDate: string;
}

export interface PaymentValidation {
  id: string;
  memberName: string;
  amount: number;
  method: string;
  date: string;
}

export interface AidHistory {
  id: string;
  type: string;
  recipient: string;
  amount: number;
  date: string;
  icon: 'medical' | 'education' | 'emergency' | 'family';
}

export type PaymentProvider = 'orange' | 'mtn' | 'wave' | 'moov' | null;

export interface SavingsOption {
  id: string;
  icon: string;
  iconBgColor: string;
  iconColor: string;
  title: string;
  subtitle: string;
  path: string;
}
