import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { Theme } from '@/shared/theme/Theme';
import { NotchedTabBarChrome } from '@/components/NotchedTabBarChrome';

/**
 * Écran minimal (fond blanc + barre) pour capture / maquette.
 * Ouvrir : /nav-preview
 */
export default function NavPreviewScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [active, setActive] = useState(0);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.fill} />
      <NotchedTabBarChrome
        width={width}
        bottomInset={insets.bottom}
        activeTabIndex={active}
        onTabPress={setActive}
        onFabPress={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.screen.bg,
  },
  fill: {
    flex: 1,
    backgroundColor: Theme.screen.bg,
  },
});
