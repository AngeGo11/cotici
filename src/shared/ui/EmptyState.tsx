import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { Button } from './Button';

export type EmptyStateProps = {
  icon: ComponentProps<typeof Feather>['name'];
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Composant manquant historiquement : aucun écran n'affichait d'état "vide"
 * intentionnel — un nouvel utilisateur atterrissait sur un espace qui semblait
 * cassé plutôt qu'accueillant. */
export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container} accessibilityRole="text">
      <View style={styles.iconWrap}>
        <Feather name={icon} size={28} color={Colors.brand} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {!!description && <Text style={styles.description}>{description}</Text>}
      {!!actionLabel && !!onAction && (
        <Button label={actionLabel} onPress={onAction} size="sm" fullWidth={false} style={styles.action} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Theme.spacing.xxl,
    paddingHorizontal: Theme.spacing.xl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: Theme.radius.pill,
    backgroundColor: withOpacity(Colors.brand, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.lg,
  },
  title: {
    fontFamily: Fonts.spaceGrotesk.semiBold,
    fontSize: 17,
    color: Colors.gray[900],
    textAlign: 'center',
    marginBottom: Theme.spacing.xs,
  },
  description: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[500],
    textAlign: 'center',
    marginBottom: Theme.spacing.lg,
  },
  action: {
    marginTop: Theme.spacing.xs,
  },
});
