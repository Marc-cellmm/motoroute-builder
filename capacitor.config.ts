import type { CapacitorConfig } from '@capacitor/cli';

// App nativa (iPhone): la mateixa web empaquetada amb Capacitor.
const config: CapacitorConfig = {
  appId: 'com.marccellmm.motoroute',
  appName: 'MotoRoute',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
  },
};

export default config;
