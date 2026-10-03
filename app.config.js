// Het buildnummer van GitHub Actions wordt het versienummer van de app,
// zodat elke nieuwe APK netjes over de vorige heen installeert.
const build = Number(process.env.GITHUB_RUN_NUMBER || 1);

module.exports = {
  expo: {
    name: 'Freaking Food Tracker',
    slug: 'freaking-food-tracker',
    // Voor inloggen met Google: Supabase stuurt terug naar freakingfoodtracker://login.
    scheme: 'freakingfoodtracker',
    version: `0.1.${build}`,
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    backgroundColor: '#F6F5F1',
    android: {
      package: 'nl.freakingfoodtracker.app',
      versionCode: build,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#15803D',
      },
      softwareKeyboardLayoutMode: 'resize',
    },
    plugins: [
      [
        'expo-camera',
        {
          cameraPermission: 'Freaking Food Tracker gebruikt de camera om barcodes van producten te scannen.',
          recordAudioAndroid: false,
        },
      ],
      'expo-font',
    ],
  },
};
