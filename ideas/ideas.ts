// The only script on the static ideas pages: the theme, and which feature row shows its picture.
const root = document.documentElement;
const system = matchMedia('(prefers-color-scheme: dark)');

/** Point the pictures at the theme in use when it differs from the system's. */
function applyTheme(dark: boolean) {
  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
  for (const s of document.querySelectorAll<HTMLSourceElement>('picture source[data-dark]')) s.media = dark ? 'all' : 'not all';
}

const chosen = root.classList.contains('dark') ? true : root.classList.contains('light') ? false : undefined;
if (chosen !== undefined && chosen !== system.matches) applyTheme(chosen);

document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
  const dark = !(root.classList.contains('dark') || (!root.classList.contains('light') && system.matches));
  applyTheme(dark);
  try {
    sessionStorage.setItem('ideas-theme', dark ? 'dark' : 'light');
  } catch {
    /* storage unavailable */
  }
});

// Product-first page: the row under the pointer, focused or tapped keeps its picture up.
const rows = [...document.querySelectorAll<HTMLElement>('[data-row]')];
for (const row of rows) {
  const pick = () => {
    for (const r of rows) r.classList.toggle('is-active', r === row);
  };
  row.addEventListener('pointerenter', pick);
  row.addEventListener('focus', pick);
  row.addEventListener('click', pick);
}
