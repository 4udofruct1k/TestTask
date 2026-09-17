import type { CapacitorConfig } from '@capacitor/cli';

/** Настройки оболочки. Раздел 5.8. */
const config: CapacitorConfig = {
  appId: 'ru.budget.app',
  appName: 'Бюджет',
  webDir: 'dist',
  android: {
    // Сеть не используется вообще
    allowMixedContent: false,
  },
  plugins: {
    StatusBar: {
      // Цвет задаётся из кода при смене темы, здесь только стартовое значение
      style: 'LIGHT',
      backgroundColor: '#F1F4F1',
      overlaysWebView: false,
    },
  },
};

export default config;
