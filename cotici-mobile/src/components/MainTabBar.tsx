import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NotchedTabBarChrome } from '@/components/NotchedTabBarChrome';
import { QuickActionsSheet } from '@/components/QuickActionsSheet';

export function MainTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [sheetOpen, setSheetOpen] = useState(false);

  const tabTitles = state.routes.map((route) => {
    const t = descriptors[route.key].options.title;
    return typeof t === 'string' ? t : route.name;
  });

  const onTabPress = (index: number) => {
    const route = state.routes[index];
    const isFocused = state.index === index;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  return (
    <>
      <NotchedTabBarChrome
        width={width}
        bottomInset={insets.bottom}
        activeTabIndex={state.index}
        tabTitles={tabTitles}
        onTabPress={onTabPress}
        onFabPress={() => setSheetOpen(true)}
      />
      <QuickActionsSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
