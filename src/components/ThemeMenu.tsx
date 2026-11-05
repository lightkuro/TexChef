import { Check, Monitor, Moon, Palette as PaletteIcon, Sun } from 'lucide-react';
import { PALETTES, usePrefs, type Theme } from '@/app/prefs';
import { Button, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tip } from '@/components/ui';

export function Swatch({ colors, className }: { colors: [string, string, string]; className?: string }) {
  const [bg, panel, accent] = colors;
  return (
    <span className={`inline-flex h-4 w-7 overflow-hidden rounded border border-black/10 ${className ?? ''}`} aria-hidden="true">
      <span className="flex-1" style={{ background: bg }} />
      <span className="flex-1" style={{ background: panel }} />
      <span className="flex-1" style={{ background: accent }} />
    </span>
  );
}

const MODES: { id: Theme; label: string; icon: React.ReactNode }[] = [
  { id: 'light', label: 'Light', icon: <Sun className="size-4" /> },
  { id: 'dark', label: 'Dark', icon: <Moon className="size-4" /> },
  { id: 'system', label: 'Match system', icon: <Monitor className="size-4" /> },
];

/** Header menu: light/dark mode and color theme. */
export function ThemeMenu() {
  const theme = usePrefs((s) => s.theme);
  const palette = usePrefs((s) => s.palette);
  const setPref = usePrefs((s) => s.set);
  const dark = document.documentElement.classList.contains('dark');
  return (
    <Menu>
      <Tip content="Theme">
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Theme" data-testid="theme-menu">
            <PaletteIcon className="size-4" />
          </Button>
        </MenuTrigger>
      </Tip>
      <MenuContent className="min-w-52">
        <MenuLabel>Mode</MenuLabel>
        {MODES.map((m) => (
          <MenuItem key={m.id} onSelect={() => setPref({ theme: m.id })}>
            {m.icon} <span className="flex-1">{m.label}</span> {theme === m.id && <Check className="size-4 text-accent" />}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuLabel>Colors</MenuLabel>
        {PALETTES.map((p) => (
          <MenuItem key={p.id} onSelect={() => setPref({ palette: p.id })}>
            <Swatch colors={dark ? p.dark : p.light} />
            <span className="flex-1" data-testid={`palette-${p.id}`}>
              {p.name}
            </span>
            {palette === p.id && <Check className="size-4 text-accent" />}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
