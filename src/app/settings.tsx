import { ScrollView } from 'react-native';

import { ChipRow, Section } from '../components/ui';
import { ThemePref, useSettings } from '../lib/settings';
import { useTheme } from '../lib/theme';

const THEMES: Record<string, ThemePref> = { 'Match phone': 'system', Light: 'light', Dark: 'dark' };

export default function SettingsScreen() {
  const { ui } = useTheme();
  const { settings, update } = useSettings();
  const themeLabel = Object.keys(THEMES).find((k) => THEMES[k] === settings.theme)!;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.pad, { gap: 8, maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
      <Section title="Appearance">
        <ChipRow options={Object.keys(THEMES)} selected={[themeLabel]} onToggle={(k) => update({ theme: THEMES[k] })} scroll={false} />
      </Section>
    </ScrollView>
  );
}
