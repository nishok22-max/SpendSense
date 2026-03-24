import { useState, useEffect } from 'react';

const SETTINGS_KEY = 'app_settings';

export interface UserSettings {
  appearance: {
    accentColor: string;
  };
}

const defaultSettings: UserSettings = {
  appearance: {
    accentColor: 'bg-chart-1',
  },
};

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Merge: only pick known keys so old schemas don't break things
        setSettings({
          appearance: parsed.appearance ?? defaultSettings.appearance,
        });
      } catch (e) {
        console.error('Failed to parse settings', e);
      }
    }
    setIsLoaded(true);
  }, []);

  const updateSettings = (updater: (prev: UserSettings) => UserSettings) => {
    setSettings((prev) => {
      const nextSettings = updater(prev);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings));
      return nextSettings;
    });
  };

  return { settings, updateSettings, isLoaded };
}
