const appJson = require('./app.json');

module.exports = () => {
  const app = appJson.expo;
  return {
    ...app,
    extra: {
      ...app.extra,
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? '',
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
  };
};
