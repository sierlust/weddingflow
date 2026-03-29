import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

function RootLayoutNav() {
  const { user, isLoading, profileCategory } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const segs = segments as string[];
    const inAuthGroup  = segs[0] === '(auth)';
    const onOnboarding = inAuthGroup && segs[1] === 'onboarding';

    if (!user) {
      // Niet ingelogd → altijd naar login
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    // Ingelogd maar nog geen leverancierstype gekozen → onboarding
    if (!profileCategory) {
      if (!onOnboarding) router.replace('/(auth)/onboarding');
      return;
    }

    // Ingelogd + categorie ingesteld: stuur alleen weg als we NOG in auth-groep zitten
    // (niet als de gebruiker al in de tab-navigatie zit — dat onderbreekt de profielpagina)
    if (inAuthGroup) router.replace('/(tabs)');
  }, [user, isLoading, profileCategory, segments]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
