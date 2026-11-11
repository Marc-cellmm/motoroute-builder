import type { CapacitorConfig } from '@capacitor/cli';

// App nativa (iPhone): la mateixa web empaquetada amb Capacitor.
const config: CapacitorConfig = {
  appId: 'com.marccellmm.motoroute',
  appName: 'MotoRoute',
  webDir: 'dist',
  backgroundColor: '#08080a',
  ios: {
    contentInset: 'never',
    zoomEnabled: false,
    backgroundColor: '#08080a',
  },
};

export default config;
