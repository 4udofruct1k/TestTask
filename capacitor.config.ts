import type { CapacitorConfig } from '@capacitor/cli';

/** Настройки оболочки. Раздел 5.8. */
const config: CapacitorConfig = {
  // appId прежний: новая версия ставится поверх «Бюджета» и сохраняет его данные
  appId: 'ru.budget.app',
  appName: 'Дом на двоих',
  webDir: 'dist',
  android: {
    // Сеть — только сводка общих данных с облачной функцией, по HTTPS.
    // Бюджет в сеть не уходит
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
