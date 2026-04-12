import { View, StyleSheet, Image, ImageSourcePropType } from 'react-native';
import type { PaymentProvider } from '@/types';

const ORANGE_LOGO = require('../../assets/orange.png') as ImageSourcePropType;
const MTN_LOGO = require('../../assets/mtn_money.png') as ImageSourcePropType;
const WAVE_LOGO = require('../../assets/wave.png') as ImageSourcePropType;
const MOOV_LOGO = require('../../assets/moov_money.png') as ImageSourcePropType;

type Props = {
  providerId: Exclude<PaymentProvider, null>;
  /** Largeur max du logo (px) */
  maxWidth?: number;
  /** Hauteur max du logo (px) */
  maxHeight?: number;
};

/**
 * Logos opérateurs : PNG dans `assets/`.
 */
export function PaymentProviderMark({ providerId, maxWidth = 120, maxHeight = 32 }: Props) {
  switch (providerId) {
    case 'orange':
      return (
        <View style={[styles.center, styles.rasterWrap]}>
          <Image
            source={ORANGE_LOGO}
            style={[styles.raster, { maxWidth, maxHeight, width: maxWidth, height: maxHeight }]}
            resizeMode="contain"
            accessibilityLabel="Orange Money"
          />
        </View>
      );
    case 'mtn':
      return (
        <View style={[styles.center, styles.rasterWrap]}>
          <Image source={MTN_LOGO} style={[styles.raster, { maxWidth, maxHeight, width: maxWidth, height: maxHeight }]} resizeMode="contain" accessibilityLabel="MTN MoMo" />
        </View>
      );
    case 'wave':
      return (
        <View style={[styles.center, styles.rasterWrap]}>
          <Image source={WAVE_LOGO} style={[styles.raster, { maxWidth, maxHeight, width: maxWidth, height: maxHeight }]} resizeMode="contain" accessibilityLabel="Wave" />
        </View>
      );
    case 'moov':
      return (
        <View style={[styles.center, styles.rasterWrap]}>
          <Image source={MOOV_LOGO} style={[styles.raster, { maxWidth, maxHeight, width: maxWidth, height: maxHeight }]} resizeMode="contain" accessibilityLabel="Moov Money" />
        </View>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  rasterWrap: { width: '100%' },
  raster: { alignSelf: 'center' },
});
