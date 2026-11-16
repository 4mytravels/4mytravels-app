// Reusable UI primitives — styled to match the Lovable "My Travel Compass"
// design (dark theme, periwinkle accent, 16-24px radii, Manrope/Sora fonts).
import React, { forwardRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  colors,
  fontFamily,
  radius,
  fontSize,
  spacing,
  iconSize,
  typeScale,
  touchTarget,
  focusShadow,
} from '../theme/theme';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types';
import { categoryIcon } from '../utils/categoryIcons';

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
          borderWidth: 1,
          borderColor: colors.borderStrong,
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
          backgroundColor: colors.surfaceStrong,
          paddingVertical: spacing.sm,
          // Tighter horizontal padding than the other pills had: the icon's own
          // glyph padding plus a wide inner gap read as dead space on the Home
          // quick-facts row. 12px keeps the pill compact without clipping it.
          paddingHorizontal: spacing.md,
          borderRadius: radius.full,
          // 4px (not 8) between icon and text: a compact single-line chip.
          gap: spacing.xs,
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
// M2: one button for the whole app. `variant` covers every look the screens
// hand-rolled (filled primary, outlined secondary, bare ghost, red destructive)
// and `size` the three heights in use. The old 'primary' | 'ghost' callers keep
// working unchanged.
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_PAD: Record<ButtonSize, { v: number; h: number; text: number; icon: number }> = {
  sm: { v: spacing.sm, h: spacing.md, text: fontSize.md, icon: iconSize.sm },
  md: { v: spacing.md, h: spacing.lg, text: fontSize.md, icon: iconSize.sm },
  lg: { v: spacing.lg, h: spacing.xl, text: fontSize.lg, icon: 18 },
};

function buttonColors(variant: ButtonVariant, disabled: boolean) {
  if (disabled) return { bg: colors.surfaceStrong, fg: colors.mutedForeground, border: colors.border };
  switch (variant) {
    case 'primary':
      return { bg: colors.primarySolid, fg: colors.primaryForeground, border: 'transparent' };
    case 'secondary':
      return { bg: colors.surfaceMedium, fg: colors.foreground, border: colors.border };
    case 'destructive':
      return { bg: colors.danger15, fg: colors.danger, border: colors.dangerBorder };
    case 'ghost':
    default:
      return { bg: 'transparent', fg: colors.foreground, border: colors.border };
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  style,
  disabled = false,
  loading = false,
  accessibilityHint,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  /** Shows a spinner in place of the icon and blocks presses (Q16 pattern). */
  loading?: boolean;
  accessibilityHint?: string;
}) {
  const inactive = disabled || loading;
  const c = buttonColors(variant, disabled);
  const pad = BUTTON_PAD[size];
  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          borderRadius: radius.full,
          minHeight: touchTarget,
          paddingVertical: pad.v,
          paddingHorizontal: pad.h,
          backgroundColor: c.bg,
          borderWidth: variant === 'primary' && !disabled ? 0 : 1,
          borderColor: c.border,
          opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={c.fg} />
      ) : (
        icon && <Ionicons name={icon} size={pad.icon} color={c.fg} />
      )}
      <Text
        style={{
          color: c.fg,
          fontSize: pad.text,
          fontWeight: '600',
          fontFamily: fontFamily.sans,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------- IconButton ----------
// M2: an icon-only control. `label` is REQUIRED — it is the only text a screen
// reader gets, and typecheck refuses an IconButton without one (see
// src/components/ui.typecheck.tsx). The hit area is never below 44×44 whatever
// the glyph size.
export type IconButtonVariant = 'plain' | 'surface' | 'filled';

export function IconButton({
  icon,
  label,
  onPress,
  onLongPress,
  variant = 'surface',
  size = iconSize.lg,
  color,
  style,
  disabled = false,
  hitSlop,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: IconButtonVariant;
  /** Glyph size; the button itself stays >= touchTarget. */
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  hitSlop?: number;
}) {
  const box = Math.max(touchTarget, size + spacing.lg);
  const bg =
    variant === 'filled' ? colors.primarySolid : variant === 'surface' ? colors.surfaceMedium : 'transparent';
  const fg =
    color ?? (variant === 'filled' ? colors.primaryForeground : disabled ? colors.mutedForeground : colors.foreground);
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        {
          width: box,
          height: box,
          borderRadius: box / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderWidth: variant === 'surface' ? 1 : 0,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={fg} />
    </Pressable>
  );
}

// ---------- FilterChip ----------
// M2: the ONE chip for filters, tabs and categories. Transparent + border at
// rest; selected = 12% primary tint + primaryBorder (never a solid fill — that
// is reserved for primary actions and the active nav item).
export function FilterChip({
  label,
  selected = false,
  onPress,
  icon,
  trailingIcon,
  style,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  /** e.g. 'chevron-down' for a chip that opens a sheet. */
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          minHeight: 36,
          paddingHorizontal: spacing.md,
          borderRadius: radius.full,
          borderWidth: 1,
          backgroundColor: selected ? colors.primary12 : 'transparent',
          borderColor: selected ? colors.primaryBorder : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={iconSize.sm} color={selected ? colors.primaryText : colors.mutedForeground} />}
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        style={{
          color: selected ? colors.foreground : colors.mutedForeground,
          fontSize: fontSize.md,
          fontWeight: selected ? '600' : '500',
          fontFamily: fontFamily.sans,
        }}
      >
        {label}
      </Text>
      {trailingIcon && <Ionicons name={trailingIcon} size={14} color={colors.mutedForeground} />}
    </Pressable>
  );
}

// ---------- Input ----------
// M2: TextInput with a visible focus state (primaryBorder + focusShadow).
// The web outline for keyboard focus comes from :focus-visible in app/+html.tsx.
export const Input = forwardRef<TextInput, TextInputProps & { invalid?: boolean }>(function Input(
  { style, invalid = false, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.mutedForeground}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        {
          minHeight: touchTarget,
          // minWidth 0: a flexed <input> on web refuses to shrink otherwise
          // (pattern 13a).
          minWidth: 0,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: invalid ? colors.dangerBorder : focused ? colors.primaryBorder : colors.borderStrong,
          backgroundColor: colors.secondary,
          color: colors.foreground,
          fontSize: fontSize.lg,
          fontFamily: fontFamily.sans,
        },
        focused && focusShadow,
        style,
      ]}
    />
  );
});

// ---------- AppText (<Text variant>) ----------
// M2: the type roles of the design. `amount` uses tabular figures so columns of
// money line up. Named AppText (not Text) so it never shadows react-native's
// Text in a screen that imports both.
export type TextVariant = 'display' | 'title' | 'section' | 'body' | 'amount' | 'label' | 'caption';

export const textVariants: Record<TextVariant, TextStyle> = {
  display: { fontFamily: fontFamily.heading, fontSize: typeScale.display, fontWeight: '800', color: colors.foreground },
  title: { fontFamily: fontFamily.heading, fontSize: typeScale.title, fontWeight: '700', color: colors.foreground },
  section: { fontFamily: fontFamily.heading, fontSize: typeScale.bodyLg, fontWeight: '700', color: colors.foreground },
  body: { fontFamily: fontFamily.sans, fontSize: typeScale.body, color: colors.foreground },
  amount: {
    fontFamily: fontFamily.sans,
    fontSize: typeScale.bodyLg,
    fontWeight: '700',
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontFamily: fontFamily.sans,
    fontSize: typeScale.label,
    fontWeight: '700',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  caption: { fontFamily: fontFamily.sans, fontSize: typeScale.caption, color: colors.mutedForeground },
};

export function AppText({ variant = 'body', style, ...rest }: TextProps & { variant?: TextVariant }) {
  return (
    <Text
      maxFontSizeMultiplier={variant === 'label' || variant === 'caption' ? 1.3 : undefined}
      {...rest}
      style={[textVariants[variant], style]}
    />
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
          backgroundColor: colors.black20,
          borderRadius: radius.lg,
          padding: spacing.lg,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: colors.mutedForeground,
          fontSize: fontSize.sm,
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
        backgroundColor: backgroundColor ?? colors.surfaceMedium,
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
  stretch = false, // stretch to fill the row (used in the expense form grid)
}: {
  category: ExpenseCategory;
  selected: boolean;
  onSelect?: (c: ExpenseCategory) => void;
  stretch?: boolean;
}) {
  // M2: the inline chip IS a FilterChip (one chip shape app-wide); only the
  // stretched grid tile in the expense form keeps its own column layout.
  if (!stretch) {
    return (
      <FilterChip
        label={category}
        icon={categoryIcon(category)}
        selected={selected}
        onPress={() => onSelect?.(category)}
      />
    );
  }
  return (
    <Pressable
      onPress={() => onSelect?.(category)}
      accessibilityRole="button"
      accessibilityLabel={category}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        {
          flexDirection: stretch ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
          backgroundColor: selected ? colors.primary12 : 'transparent',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: selected ? colors.primaryBorder : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
        stretch && { flex: 1 },
      ]}
    >
      <Ionicons
        name={categoryIcon(category)}
        size={stretch ? 20 : 16}
        color={colors.foreground}
      />
      <Text
        style={{
          color: selected ? colors.foreground : colors.mutedForeground,
          fontSize: stretch ? fontSize.sm : fontSize.md,
          fontWeight: selected ? '600' : '500',
          fontFamily: fontFamily.sans,
        }}
        numberOfLines={stretch ? 1 : undefined}
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
// Moved to src/utils/categoryIcons.ts so the form, the Statistics donut and the
// filter sheets can never drift apart. Re-exported for existing importers.
export { categoryIcons, categoryIcon } from '../utils/categoryIcons';

// ---------- Heading text helper ----------
export function headingStyle(size: keyof typeof fontSize = '3xl'): TextStyle {
  return {
    color: colors.foreground,
    fontSize: fontSize[size],
    fontWeight: '700',
    fontFamily: fontFamily.heading,
  };
}
