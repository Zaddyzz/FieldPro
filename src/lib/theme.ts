import { useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'covaro.theme';

function read(): ThemeChoice {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; }
}

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  
}

/** Theme preference is kept on this device only (no server storage). */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(read);
  useEffect(() => {
    const sync = (e: Event) => setChoice((e as CustomEvent<ThemeChoice>).detail);
    window.addEventListener('covaro-theme', sync);
    return () => window.removeEventListener('covaro-theme', sync);
  }, []);
  useEffect(() => {
    apply(choice);
    try { localStorage.setItem(KEY, choice); } catch { /* storage unavailable */ }
    if (choice !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => apply('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [choice]);
  const resolved = (): 'light' | 'dark' => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const choose = (c: ThemeChoice) => { setChoice(c); window.dispatchEvent(new CustomEvent('covaro-theme', { detail: c })); };
  return { choice, setChoice: choose, resolved, toggle: () => choose(resolved() === 'dark' ? 'light' : 'dark') };
}
