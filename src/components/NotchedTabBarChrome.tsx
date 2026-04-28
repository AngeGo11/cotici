import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { NavBrand } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';
import { NotchedNavBarBackground } from '@/components/NotchedNavBarBackground';
import { Colors} from '@/constants/Colors';


const ICON = 23;
const FAB_ICON = 22;
/** Diamètre du disque central (FAB) */
export const NOTCHED_FAB_SIZE = 50;
export const FAB_BOTTOM_OFFSET = 28;
export const NOTCH_GAP = 5;
const BAR_BODY = 30;
const NOTCH_EXTRA = 26;
const FAB_COLOR = Colors.success;

const DEFAULT_TAB_TITLES = ['Accueil', 'Tontines', 'Épargne', 'Profil'] as const;

function TabBarGlyph({
  index,
  color,
  size,
}: {
  index: number;
  color: string;
  size: number;
}) {
  switch (index) {
    case 0:
      return <Feather name="home" size={size} color={color} />;
    case 1:
      return <Ionicons name="people-circle-outline" size={size} color={color} />;
    case 2:
      return <Ionicons name="wallet-outline" size={size} color={color} />;
    case 3:
      return <Feather name="user" size={size} color={color} />;
    default:
      return <Feather name="circle" size={size} color={color} />;
  }
}

export type NotchedTabBarChromeProps = {
  width: number;
  bottomInset: number;
  activeTabIndex: number;
  tabTitles?: readonly string[];
  onTabPress?: (tabIndex: number) => void;
  onFabPress?: () => void;
};

/**
 * Navbar avec encoche vers le bas, FAB centré, libellés sous les icônes.
 */
export function NotchedTabBarChrome({
  width,
  bottomInset,
  activeTabIndex,
  tabTitles,
  onTabPress,
  onFabPress,
}: NotchedTabBarChromeProps) {
  const labels = tabTitles ?? DEFAULT_TAB_TITLES;
  const totalHeight = bottomInset + BAR_BODY + NOTCH_EXTRA;
  const fabBottom = bottomInset + FAB_BOTTOM_OFFSET;

  return (
    <View style={[styles.wrap, { height: totalHeight, width }]} pointerEvents="box-none">
      <NotchedNavBarBackground
        width={width}
        height={totalHeight}
        bottomInset={bottomInset}
        fabBottomOffset={FAB_BOTTOM_OFFSET}
        fabDiameter={NOTCHED_FAB_SIZE}
        notchGap={NOTCH_GAP}
      />

      <View
        style={[
          styles.row,
          {
            paddingBottom: bottomInset,
            height: BAR_BODY + bottomInset,
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.side}>
          {[0, 1].map((i) => (
            <Pressable
              key={i}
              style={styles.tab}
              onPress={() => onTabPress?.(i)}
            >
              <TabSlot
                index={i}
                active={activeTabIndex === i}
                label={labels[i] ?? ''}
              />
            </Pressable>
          ))}
        </View>
        <View style={styles.fabGap} />
        <View style={styles.side}>
          {[2, 3].map((i) => (
            <Pressable
              key={i}
              style={styles.tab}
              onPress={() => onTabPress?.(i)}
            >
              <TabSlot
                index={i}
                active={activeTabIndex === i}
                label={labels[i] ?? ''}
              />
            </Pressable>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.fab,
          {
            bottom: fabBottom,
            left: (width - NOTCHED_FAB_SIZE) / 2,
            backgroundColor: FAB_COLOR
          },
        ]}
        onPress={onFabPress}
        activeOpacity={0.92}
        accessibilityRole="button"
        accessibilityLabel="Action principale"
      >
        <Feather name="zap" size={FAB_ICON} color={NavBrand.pureWhite} />
      </TouchableOpacity>
    </View>
  );
}

function TabSlot({
  index,
  active,
  label,
}: {
  index: number;
  active: boolean;
  label: string;
}) {
  const color = active ? NavBrand.emeraldGreen : NavBrand.neutralGrey;

  return (
    <View style={styles.tabInner}>
      <TabBarGlyph index={index} color={color} size={ICON} />
      <Text
        style={[
          styles.tabLabel,
          {
            color,
            fontFamily: active ? Fonts.outfit.medium : Fonts.outfit.regular,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View
        style={[
          styles.activeLine,
          { backgroundColor: active ? NavBrand.emeraldGreen : 'transparent' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'visible',
  },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 6,
  },
  side: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
  },
  fabGap: {
    width: NOTCHED_FAB_SIZE + 8,
  },
  fab: {
    position: 'absolute',
    width: NOTCHED_FAB_SIZE,
    height: NOTCHED_FAB_SIZE,
    borderRadius: NOTCHED_FAB_SIZE / 2,
    backgroundColor: NavBrand.primaryOrange,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.95)',
    ...Theme.shadow.fab,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
    minWidth: 56,
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 76,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.15,
    marginTop: 5,
    textAlign: 'center',
    width: '100%',
  },
  activeLine: {
    marginTop: 5,
    width: 24,
    height: 2.5,
    borderRadius: 1.25,
  },
});
