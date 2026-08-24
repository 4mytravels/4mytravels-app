// Reusable UI primitives — styled to match the Lovable "My Travel Compass"
// design (dark theme, periwinkle accent, 16-24px radii, Manrope/Sora fonts).
import React from 'react';
import {
  View,
  Text,
  Pressable,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, radius, fontSize, spacing } from '../theme/theme';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types';

// ---------- Card ----------
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius['2xl'],
          padding: spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ---------- Pill ----------
export function Pill({
  icon,
  text,
  style,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  text: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.08)',
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.full,
          gap: spacing.sm,
        },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={16} color={colors.routeLine} />}
      <Text style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: '500' }}>
        {text}
      </Text>
    </View>
  );
}

// ---------- Button ----------
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  style,
  disabled = false,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost';
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          borderRadius: radius.xl,
          paddingVertical: spacing.lg,
          backgroundColor: disabled
            ? 'rgba(255,255,255,0.08)'
            : isPrimary
              ? colors.primary
              : 'transparent',
          borderWidth: isPrimary ? 0 : 1,
          borderColor: disabled ? 'rgba(255,255,255,0.12)' : colors.border,
          opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={18}
          color={disabled ? colors.mutedForeground : isPrimary ? colors.primaryForeground : colors.foreground}
        />
      )}
      <Text
        style={{
          color: disabled ? colors.mutedForeground : isPrimary ? colors.primaryForeground : colors.foreground,
          fontSize: fontSize.lg,
          fontWeight: '600',
          fontFamily: fontFamily.sans,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------- StatBox ----------
export function StatBox({
  label,
  value,
  style,
}: {
  label: string;
  value: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.20)',
          borderRadius: radius.lg,
          padding: spacing.lg,
          alignItems: 'center',
        },
        style,
      ]}
    >
      <Text
        style={{
          color: colors.mutedForeground,
          fontSize: fontSize.xs,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          marginBottom: spacing.sm,
          fontFamily: fontFamily.sans,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: colors.foreground,
          fontSize: fontSize.lg,
          fontWeight: '700',
          fontFamily: fontFamily.sans,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

// ---------- IconCircle ----------
export function IconCircle({
  icon,
  size = 40,
  color = colors.foreground,
  backgroundColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
  backgroundColor?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: backgroundColor ?? colors.secondary,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Ionicons name={icon} size={size * 0.55} color={color} />
    </View>
  );
}

// ---------- CategoryChip ----------
export function CategoryChip({
  category,
  selected,
  onSelect,
}: {
  category: ExpenseCategory;
  selected: boolean;
  onSelect?: (c: ExpenseCategory) => void;
}) {
  return (
    <Pressable
      onPress={() => onSelect?.(category)}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: selected ? colors.primary : colors.secondary,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: selected ? colors.primary : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Ionicons
        name={categoryIcons[category]}
        size={16}
        color={colors.foreground}
        style={{ marginRight: spacing.sm }}
      />
      <Text
        style={{
          color: colors.foreground,
          fontSize: fontSize.md,
          fontWeight: selected ? '600' : '500',
          fontFamily: fontFamily.sans,
        }}
      >
        {category}
      </Text>
    </Pressable>
  );
}

// ---------- SectionTitle ----------
export function SectionTitle({ title, count }: { title: string; count?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.lg,
      }}
    >
      <Text
        style={{
          color: colors.foreground,
          fontSize: fontSize.xl,
          fontWeight: '700',
          fontFamily: fontFamily.heading,
        }}
      >
        {title}
      </Text>
      {count && (
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.md }}>
          {count}
        </Text>
      )}
    </View>
  );
}

// ---------- Category icon mapping (Ionicons) ----------
export const categoryIcons: Record<ExpenseCategory, keyof typeof Ionicons.glyphMap> = {
  Food: 'restaurant-outline',
  Transport: 'bus-outline',
  Accommodation: 'bed-outline',
  Groceries: 'cart-outline',
  Shopping: 'bag-outline',
  Activities: 'film-outline',
  Drinks: 'wine-outline',
  Coffee: 'cafe-outline',
  Flights: 'airplane-outline',
  General: 'wallet-outline',
  Laundry: 'shirt-outline',
  Gym: 'barbell-outline',
  Work: 'briefcase-outline',
};

// ---------- Heading text helper ----------
export function headingStyle(size: keyof typeof fontSize = '3xl'): TextStyle {
  return {
    color: colors.foreground,
    fontSize: fontSize[size],
    fontWeight: '700',
    fontFamily: fontFamily.heading,
  };
}
