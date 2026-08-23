import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/constants/theme';
import { CatalogCard, CatalogVariant, formatCurrency } from '@/lib/api';

type CardDetailModalProps = {
  card: CatalogCard | null;
  onClose: () => void;
};

export function CardDetailModal({ card, onClose }: CardDetailModalProps) {
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const groupedVariants = useMemo(() => groupVariants(card?.variants ?? []), [card]);

  if (!card) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <SafeAreaView style={styles.overlay}>
        <View style={[styles.dialog, compact && styles.dialogCompact]}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeading}>
              <Text style={styles.cardName}>{card.name}</Text>
              <Text style={styles.cardMeta}>
                {card.setName} / {card.number} / {card.rarity ?? 'Unknown rarity'}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close card details"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closePressed]}>
              <X color={colors.text} size={21} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={[styles.modalBody, compact && styles.modalBodyCompact]}>
            <View style={[styles.detailImageFrame, compact && styles.detailImageFrameCompact]}>
              {card.imageUrl ? (
                <Image contentFit="contain" source={card.imageUrl} style={styles.detailImage} />
              ) : null}
            </View>

            <View style={styles.variantGroups}>
              {groupedVariants.map(([printing, variants]) => (
                <View key={printing} style={styles.variantGroup}>
                  <Text style={styles.printing}>{printing}</Text>
                  {variants.map((variant) => (
                    <View key={variant.id} style={styles.variantRow}>
                      <Text style={styles.condition}>{variant.condition}</Text>
                      <Text style={styles.variantPrice}>
                        {formatCurrency(variant.currentPrice)}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function groupVariants(variants: CatalogVariant[]): [string, CatalogVariant[]][] {
  const groups = new Map<string, CatalogVariant[]>();
  for (const variant of variants) {
    const group = groups.get(variant.printing) ?? [];
    group.push(variant);
    groups.set(variant.printing, group);
  }
  return [...groups.entries()];
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: '88%',
    maxWidth: 820,
    overflow: 'hidden',
    width: '100%',
  },
  dialogCompact: {
    maxHeight: '100%',
  },
  modalHeader: {
    alignItems: 'flex-start',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  modalHeading: {
    flex: 1,
    gap: spacing.xs,
  },
  cardName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: 4,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  closePressed: {
    backgroundColor: colors.surfaceQuiet,
  },
  modalBody: {
    flexDirection: 'row',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  modalBodyCompact: {
    flexDirection: 'column',
  },
  detailImageFrame: {
    alignSelf: 'flex-start',
    aspectRatio: 0.714,
    backgroundColor: colors.surfaceQuiet,
    borderRadius: 6,
    overflow: 'hidden',
    width: 280,
  },
  detailImageFrameCompact: {
    alignSelf: 'center',
    maxWidth: 280,
    width: '76%',
  },
  detailImage: {
    height: '100%',
    width: '100%',
  },
  variantGroups: {
    flex: 1,
    gap: spacing.lg,
    minWidth: 0,
  },
  variantGroup: {
    gap: spacing.xs,
  },
  printing: {
    color: colors.brass,
    fontSize: 13,
    fontWeight: '800',
    paddingBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  variantRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 38,
  },
  condition: {
    color: colors.textMuted,
    fontSize: 13,
  },
  variantPrice: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
