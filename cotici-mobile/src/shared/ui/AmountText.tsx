import type { StyleProp, TextStyle } from 'react-native';
import { Text } from 'react-native';
import { formatFcfaDots, formatMonthlyFlow } from '@/shared/auth/userDisplay';
import { Colors } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';

export type AmountSign = 'positive' | 'negative' | 'neutral';

export type AmountTextProps = {
  value: string | number | undefined;
  /** 'neutral' affiche juste le montant (ex. solde). 'positive'/'negative' préfixent +/− et colorent. */
  sign?: AmountSign;
  size?: number;
  style?: StyleProp<TextStyle>;
};

const SIGN_COLOR: Record<AmountSign, string> = {
  positive: Colors.success,
  negative: Colors.danger,
  neutral: Colors.gray[900],
};

/** Affiche un montant FCFA avec le poids visuel correct : jamais de gris neutre
 * pour de l'argent qui bouge (entrée = vert, sortie = rouge). */
export function AmountText({ value, sign = 'neutral', size = 16, style }: AmountTextProps) {
  const formatted =
    sign === 'neutral' ? `${formatFcfaDots(value)} F` : formatMonthlyFlow(value, sign === 'positive' ? 'in' : 'out');

  return (
    <Text
      style={[
        { fontFamily: Fonts.spaceGrotesk.bold, fontSize: size, color: SIGN_COLOR[sign] },
        style,
      ]}
    >
      {formatted}
    </Text>
  );
}
