import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.poseevaluator.app',
  appName: 'PoseEvaluator',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: [
      'cdn.jsdelivr.net',
      'storage.googleapis.com',
      'aistudiocdn.com'
    ]
  }
};

export default config;
