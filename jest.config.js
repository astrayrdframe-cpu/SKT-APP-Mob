module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      [
        'react-native',
        '@react-native',
        '@react-native-async-storage',
        '@react-navigation',
        'react-native-vector-icons',
        'react-native-safe-area-context',
        'react-native-screens',
        'react-native-gesture-handler',
        'react-native-vision-camera',
        'react-native-vision-camera-barcode-scanner',
        'react-native-toast-message',
      ].join('|') +
      ')/)',
  ],
};
