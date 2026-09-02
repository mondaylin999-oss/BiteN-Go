// ===========================================================================
//  prefs.tsx — the two switches in the top-right corner.
//
//    LANGUAGE   English ⇄ မြန်မာ, one click, every role.
//    THEME      light ⇄ dark, one click, every role.
//
//  Both are remembered in this browser (localStorage), so a student on their
//  phone and the office on its desktop each keep their own choice. The theme
//  starts from what the device itself prefers; the language starts in English.
//
//  Nothing here talks to the server: these are per-person, per-device choices,
//  not account settings, so switching is instant and works while signed out.
// ===========================================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translate, type Language } from "./i18n";

type Theme = "light" | "dark";

type Prefs = {
  language: Language;
  theme: Theme;
  toggleLanguage: () => void;
  toggleTheme: () => void;
  /** Translate one string. The key is the English text itself. */
  t: (text: string) => string;
};

const PrefsContext = createContext<Prefs | null>(null);

const LANGUAGE_KEY = "biten_go_language";
const THEME_KEY = "biten_go_theme";

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key) as T | null;
    if (stored && allowed.includes(stored)) return stored;
  } catch {
    /* private browsing — fall through to the default */
  }
  return fallback;
}

function devicePrefersDark() {
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  } catch {
    return false;
  }
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => readStored(LANGUAGE_KEY, ["en", "my"] as const, "en"));
  const [theme, setTheme] = useState<Theme>(() => readStored(THEME_KEY, ["light", "dark"] as const, devicePrefersDark() ? "dark" : "light"));

  // The theme is a class on <html>, which is what index.css keys its dark
  // palette off. Setting it here means every screen follows at once.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // `lang` on <html> matters for line breaking and for screen readers.
  useEffect(() => {
    document.documentElement.lang = language === "my" ? "my" : "en";
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      /* ignore */
    }
  }, [language]);

  const t = useCallback((text: string) => translate(text, language), [language]);
  const toggleLanguage = useCallback(() => setLanguage(current => (current === "en" ? "my" : "en")), []);
  const toggleTheme = useCallback(() => setTheme(current => (current === "light" ? "dark" : "light")), []);

  const value = useMemo<Prefs>(() => ({ language, theme, toggleLanguage, toggleTheme, t }), [language, theme, toggleLanguage, toggleTheme, t]);

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const context = useContext(PrefsContext);
  if (!context) throw new Error("usePrefs must be used inside <PrefsProvider>.");
  return context;
}

/** Shorthand for the common case: `const t = useT();  t("Seat requests")`. */
export function useT() {
  return usePrefs().t;
}
