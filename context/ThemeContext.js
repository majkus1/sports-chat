'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'czat-theme';

const ThemeContext = createContext(null);

function applyTheme(theme) {
	const root = document.documentElement;
	root.classList.toggle('dark', theme === 'dark');
	root.dataset.theme = theme;
	// Informuje przeglądarkę, jak malować scrollbary i kontrolki natywne.
	root.style.colorScheme = theme;
}

export function ThemeProvider({ children }) {
	// Wartość początkowa musi zgadzać się z serwerem, żeby nie wywołać błędu hydracji.
	// Prawdziwy motyw ustawia ThemeScript jeszcze przed pierwszym malowaniem, a poniższy
	// efekt tylko odczytuje to, co ten skrypt już zrobił.
	const [theme, setTheme] = useState('light');

	useEffect(() => {
		setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
	}, []);

	/** Zmiana preferencji systemowej działa tylko, gdy użytkownik nie wybrał motywu ręcznie. */
	useEffect(() => {
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		const onChange = (event) => {
			if (localStorage.getItem(STORAGE_KEY)) return;
			const next = event.matches ? 'dark' : 'light';
			applyTheme(next);
			setTheme(next);
		};
		media.addEventListener('change', onChange);
		return () => media.removeEventListener('change', onChange);
	}, []);

	const setThemePreference = useCallback((next) => {
		applyTheme(next);
		setTheme(next);
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			/* prywatne okno — motyw zadziała do końca sesji */
		}
	}, []);

	const toggleTheme = useCallback(() => {
		setThemePreference(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
	}, [setThemePreference]);

	const value = useMemo(
		() => ({ theme, setTheme: setThemePreference, toggleTheme }),
		[theme, setThemePreference, toggleTheme]
	);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error('useTheme must be used within ThemeProvider');
	}
	return context;
}
