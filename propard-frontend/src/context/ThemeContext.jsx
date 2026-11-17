import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

const accents = {
  blue: { accent: '#5b8af0', hover: '#7aa0f5', glow: 'rgba(91, 138, 240, 0.2)' },
  purple: { accent: '#9b72f2', hover: '#b08ff7', glow: 'rgba(155, 114, 242, 0.2)' },
  green: { accent: '#38b879', hover: '#58cf96', glow: 'rgba(56, 184, 121, 0.2)' },
  pink: { accent: '#e46ca8', hover: '#f08abd', glow: 'rgba(228, 108, 168, 0.2)' },
  orange: { accent: '#e58a42', hover: '#f0a15f', glow: 'rgba(229, 138, 66, 0.2)' }
};

function applyAccent(name) {
  const selected = accents[name] || accents.blue;
  const root = document.documentElement;
  root.style.setProperty('--accent', selected.accent);
  root.style.setProperty('--accent-hover', selected.hover);
  root.style.setProperty('--accent-glow', selected.glow);
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('propard_theme') || 'dark'; } catch { return 'dark'; }
  });
  const [accent, setAccentState] = useState(() => {
    try {
      const saved = localStorage.getItem('propard_accent') || 'blue';
      return accents[saved] ? saved : 'blue';
    } catch {
      return 'blue';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    applyAccent(accent);
  }, [theme, accent]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('propard_theme', next);
  };

  const setAccent = name => {
    if (!accents[name]) return;
    setAccentState(name);
    applyAccent(name);
    localStorage.setItem('propard_accent', name);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
