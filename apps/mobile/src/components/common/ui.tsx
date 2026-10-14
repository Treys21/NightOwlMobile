// Small building blocks every screen shares: cards, tabular numbers,
// segmented controls, chips, headers, empty and loading states.
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import type { TextProps, ViewProps } from 'react-native';
import { colors, tabular } from '../../theme';

export function Card({ className = '', children, ...rest }: ViewProps & { className?: string; children: ReactNode }) {
  return (
    <View className={`rounded-2xl border border-night-700 bg-night-900 ${className}`} {...rest}>
      {children}
    </View>
  );
}

/** Numbers that don't jitter as they change. */
export function Num({ className = '', style, children, ...rest }: TextProps & { className?: string }) {
  return (
    <Text className={className} style={[tabular, style]} {...rest}>
      {children}
    </Text>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View className="mb-2 mt-5 flex-row items-center justify-between px-5">
      <Text className="text-[11px] font-semibold uppercase tracking-widest text-night-500">{children}</Text>
      {right}
    </View>
  );
}

export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string | null; right?: ReactNode }) {
  return (
    <View className="flex-row items-end justify-between px-4 pb-2 pt-2">
      <View className="flex-1">
        <Text className="text-[28px] font-bold tracking-tight text-night-100">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-[13px] text-night-300">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** iOS-style segmented control with a selection haptic. */
export function Segmented<T extends string>({ options, value, onChange }: { options: SegmentOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <View className="flex-row rounded-xl border border-night-700 bg-night-900 p-1" accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) void Haptics.selectionAsync();
              onChange(o.value);
            }}
            className={`flex-1 items-center rounded-lg py-1.5 ${on ? 'bg-night-800' : ''}`}
          >
            <Text numberOfLines={1} className={`text-[13px] font-semibold ${on ? 'text-night-100' : 'text-night-500'}`}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pill filter; a horizontal row of these scrolls. */
export function Chip({ label, active, onPress, tone }: { label: string; active: boolean; onPress: () => void; tone?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      className={`mr-2 rounded-full border px-3.5 py-1.5 ${active ? 'border-night-500 bg-night-800' : 'border-night-700'}`}
    >
      <Text className="text-[13px] font-semibold" style={{ color: active ? (tone ?? colors.night100) : colors.night300 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ paddingHorizontal: 16, alignItems: "flex-start" }}>
      {children}
    </ScrollView>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: SFSymbol; title: string; body: string; action?: ReactNode }) {
  return (
    <View className="items-center px-10 py-16">
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-night-800">
        <SymbolView name={icon} size={26} tintColor={colors.night300} />
      </View>
      <Text className="text-center text-[17px] font-semibold text-night-100">{title}</Text>
      <Text className="mt-1.5 text-center text-[14px] leading-5 text-night-300">{body}</Text>
      {action ? <View className="mt-5">{action}</View> : null}
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled, loading }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className={`items-center rounded-2xl py-3.5 ${disabled || loading ? 'bg-night-800' : 'bg-owl-cyan'}`}
    >
      <Text className={`text-[16px] font-bold ${disabled || loading ? 'text-night-500' : 'text-night-950'}`}>{loading ? 'Working…' : label}</Text>
    </Pressable>
  );
}

/** Shimmering placeholder rows while data loads. */
export function SkeletonRows({ count = 4, height = 72 }: { count?: number; height?: number }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View className="px-4">
      {Array.from({ length: count }, (_, i) => (
        <Animated.View key={i} style={{ height, opacity: pulse }} className="mb-3 rounded-2xl bg-night-900" />
      ))}
    </View>
  );
}

/** Thin banner for a failed refresh that leaves older data on screen. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Pressable onPress={onRetry} className="mx-4 mb-2 flex-row items-center rounded-xl border border-delta-neg/40 bg-delta-neg/10 px-3 py-2">
      <SymbolView name="exclamationmark.triangle.fill" size={14} tintColor={colors.neg} />
      <Text className="ml-2 flex-1 text-[13px] text-night-100">{message}</Text>
      {onRetry ? <Text className="text-[13px] font-semibold text-owl-cyan">Retry</Text> : null}
    </Pressable>
  );
}
