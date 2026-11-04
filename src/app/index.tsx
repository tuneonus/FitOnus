import React from 'react';
import { NavigationProvider } from './navigation/NavigationContext';
import { AppShell } from './AppShell';

export default function Index() {
  return (
    <NavigationProvider initialRoute="home">
      <AppShell />
    </NavigationProvider>
  );
}
