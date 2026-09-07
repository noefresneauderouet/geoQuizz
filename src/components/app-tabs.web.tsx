import { Tabs, TabList, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MaxContentWidth, Palette, Radius, Shadow, Spacing } from '@/constants/theme';

/** Équivalent web des onglets natifs : même deux destinations. */
export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <View style={styles.bar}>
          <View style={styles.inner}>
            <Text style={styles.brand}>GeoLearn</Text>
            <TabTrigger name="apprendre" href="/" asChild>
              <TabButton>Apprendre</TabButton>
            </TabTrigger>
            <TabTrigger name="profil" href="/profil" asChild>
              <TabButton>Profil</TabButton>
            </TabTrigger>
          </View>
        </View>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <View style={[styles.buttonInner, isFocused && styles.buttonInnerActive]}>
        <Text style={[styles.buttonText, isFocused && styles.buttonTextActive]}>{children}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    padding: Spacing.three,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.border,
    maxWidth: MaxContentWidth,
    flexGrow: 1,
    ...Shadow.card,
  },
  brand: {
    marginRight: 'auto',
    fontWeight: '800',
    color: Palette.green,
    fontSize: 16,
  },
  button: {},
  pressed: { opacity: 0.7 },
  buttonInner: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  buttonInnerActive: { backgroundColor: Palette.green },
  buttonText: { fontWeight: '700', color: Palette.inkSoft },
  buttonTextActive: { color: Palette.card },
});
