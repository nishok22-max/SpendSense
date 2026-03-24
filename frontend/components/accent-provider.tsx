'use client';

import { useEffect } from 'react';
import { useSettings } from '@/hooks/use-settings';

export function AccentProvider({ children }: { children: React.ReactNode }) {
  const { settings, isLoaded } = useSettings();

  useEffect(() => {
    if (!isLoaded) return;
    
    // settings.appearance.accentColor is something like 'bg-chart-1'
    const colorVar = settings.appearance.accentColor.replace('bg-', '--');
    
    // Get the computed value of the chart color
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    const colorValue = computedStyle.getPropertyValue(colorVar);
    
    if (colorValue) {
      root.style.setProperty('--primary', colorValue);
      root.style.setProperty('--ring', colorValue);
    }
  }, [settings.appearance.accentColor, isLoaded]);

  return <>{children}</>;
}
