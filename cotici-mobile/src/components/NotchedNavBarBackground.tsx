import Svg, { Path } from 'react-native-svg';
import { NavBrand } from '@/shared/theme/Colors';

export type NotchedNavBarBackgroundProps = {
  width: number;
  height: number;
  fabBottomOffset: number;
  bottomInset: number;
  fabDiameter: number;
  /** Rayon de l’arc = rayon FAB + gap : encoche concentrique au bouton */
  notchGap: number;
};

/**
 * Barre blanche pleine largeur. L’encoche suit le **demi-cercle inférieur**
 * du cercle (même centre que le FAB) : la courbe s’ouvre **vers le bas** dans la barre.
 */
export function NotchedNavBarBackground({
  width: w,
  height: h,
  fabBottomOffset,
  bottomInset,
  fabDiameter,
  notchGap,
}: NotchedNavBarBackgroundProps) {
  const cx = w / 2;
  const Rfab = fabDiameter / 2;
  const R = Rfab + notchGap;
  const cy = h - bottomInset - fabBottomOffset - Rfab;

  const xL = cx - R;
  const xR = cx + R;

  const d = `
    M 0 ${h}
    L 0 ${cy}
    L ${xL} ${cy}
    A ${R} ${R} 0 1 0 ${xR} ${cy}
    L ${w} ${cy}
    L ${w} ${h}
    Z
  `;

  return (
    <Svg width={w} height={h} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
      <Path
        d={d}
        fill={NavBrand.pureWhite}
        stroke="rgba(0, 0, 0, 0.07)"
        strokeWidth={1}
      />
    </Svg>
  );
}
