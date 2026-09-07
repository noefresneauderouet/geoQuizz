import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Palette } from '@/constants/theme';

/** Deux onglets, pas plus : on apprend, ou on regarde sa progression. */
export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={Palette.card}
      indicatorColor={Palette.yellowLight}
      tintColor={Palette.green}
      labelStyle={{ color: Palette.inkSoft, selected: { color: Palette.green } }}>
      <NativeTabs.Trigger name="(apprendre)">
        <NativeTabs.Trigger.Label>Apprendre</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="globe.europe.africa.fill" md="public" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profil">
        <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
