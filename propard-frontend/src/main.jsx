import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppWithOfflineGate } from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { setupNotificationNavigation } from './utils/pushNotifications.js';

setupNotificationNavigation().catch(error => {
  console.error('❌ Impossible d’initialiser les actions de notifications:', error);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', {
        scope: '/'
      })
      .then(registration => {
        console.log(
          '🛜 Propard Service Worker enregistré:',
          registration.scope
        );
      })
      .catch(error => {
        console.error(
          '❌ Impossible d’enregistrer le Service Worker:',
          error
        );
      });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <AppWithOfflineGate />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
);