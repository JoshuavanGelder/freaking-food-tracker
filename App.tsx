import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState as RNAppState, BackHandler, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { AppProvider, mealForNow, useApp } from './src/store';
import { Nav, NavProvider, Route, Tab, useNav } from './src/nav';
import { dateKey } from './src/logic/calc';
import { C, F } from './src/theme';
import { Icon, IconName } from './src/icons';
import { TodayScreen } from './src/screens/TodayScreen';
import { AddScreen } from './src/screens/AddScreen';
import { ProductScreen } from './src/screens/ProductScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { PhotoScreen } from './src/screens/PhotoScreen';
import { ManualScreen } from './src/screens/ManualScreen';
import { WeightScreen } from './src/screens/WeightScreen';
import { GoalsScreen } from './src/screens/GoalsScreen';
import { FriendsScreen } from './src/screens/FriendsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ImportScreen } from './src/screens/ImportScreen';
import { MicrosScreen } from './src/screens/MicrosScreen';
import { FavMealScreen } from './src/screens/FavMealScreen';
import { CloudScreen } from './src/screens/CloudScreen';
import { FriendScreen } from './src/screens/FriendScreen';
import { isSignedIn, loadCloud, syncNow } from './src/cloud';
import { checkForUpdate } from './src/update';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    Figtree_400Regular,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppProvider>{fontsLoaded || fontError ? <Root /> : <Loading />}</AppProvider>
    </SafeAreaProvider>
  );
}

function Loading() {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.accent} />
    </View>
  );
}

/** Synchroniseert met de cloud: bij het openen, bij terugkomen in en weggaan uit de app, en kort na een wijziging. */
function useAutoSync() {
  const { state, loaded, actions } = useApp();
  const bridge = useMemo(() => ({ apply: actions.syncApply, read: actions.readState }), [actions]);

  useEffect(() => {
    // Pas synchroniseren als de gegevens van de telefoon geladen zijn, anders lijkt alles verwijderd.
    if (loaded) loadCloud().then(() => syncNow(bridge));
  }, [loaded, bridge]);

  useEffect(() => {
    if (!loaded) return;
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active' || st === 'background') syncNow(bridge);
    });
    return () => sub.remove();
  }, [loaded, bridge]);

  useEffect(() => {
    if (!loaded || !isSignedIn()) return;
    const t = setTimeout(() => syncNow(bridge), 8000);
    return () => clearTimeout(t);
  }, [state, loaded, bridge]);
}

/** Kijkt bij het openen en bij terugkomen in de app of er een nieuwere APK klaarstaat (hooguit om de paar uur). */
function useUpdateCheck() {
  useEffect(() => {
    checkForUpdate();
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active') checkForUpdate();
    });
    return () => sub.remove();
  }, []);
}

function Root() {
  const { state, loaded } = useApp();
  useAutoSync();
  useUpdateCheck();
  const [stack, setStack] = useState<Route[]>([{ name: 'tabs' }]);
  const [tab, setTab] = useState<Tab>('today');
  const [day, setDay] = useState(() => dateKey(new Date()));
  const [pickFor, setPickFor] = useState<string | null>(null);

  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const nav: Nav = useMemo(
    () => ({
      tab,
      setTab,
      day,
      setDay,
      push: (r) => setStack((s) => [...s, r]),
      replace: (r) => setStack((s) => [...s.slice(0, -1), r]),
      back,
      popTo: (name) =>
        setStack((s) => {
          const i = s.map((r) => r.name).lastIndexOf(name);
          return i >= 0 ? s.slice(0, i + 1) : s;
        }),
      home: () => {
        setStack([{ name: 'tabs' }]);
        setTab('today');
        setPickFor(null);
      },
      pickFor,
      setPickFor,
    }),
    [tab, day, back, pickFor],
  );

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        back();
        return true;
      }
      if (tab !== 'today') {
        setTab('today');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, tab, back]);

  if (!loaded) return <Loading />;

  const route = stack[stack.length - 1];
  let screen: React.ReactNode;
  // Zonder profiel: onboarding, behalve als je vanaf daar een reservekopie terugzet of inlogt.
  if (!state.profile && route.name !== 'import' && route.name !== 'cloud') {
    screen = <ProfileScreen onboarding />;
  } else {
    switch (route.name) {
      case 'tabs':
        screen = (
          <View style={{ flex: 1 }}>
            {tab === 'today' ? <TodayScreen /> : null}
            {tab === 'weight' ? <WeightScreen /> : null}
            {tab === 'friends' ? <FriendsScreen /> : null}
            {tab === 'goals' ? <GoalsScreen /> : null}
            <TabBar />
          </View>
        );
        break;
      case 'add':
        screen = <AddScreen key={stack.length} meal={route.meal} date={route.date} />;
        break;
      case 'scan':
        screen = <ScanScreen key={stack.length} meal={route.meal} date={route.date} />;
        break;
      case 'photo':
        screen = <PhotoScreen key={stack.length} meal={route.meal} date={route.date} />;
        break;
      case 'product':
        screen = (
          <ProductScreen
            key={`${stack.length}-${route.food.id}`}
            food={route.food}
            meal={route.meal}
            date={route.date}
            entryId={route.entryId}
            grams={route.grams}
          />
        );
        break;
      case 'manual':
        screen = (
          <ManualScreen
            key={stack.length}
            meal={route.meal}
            date={route.date}
            barcode={route.barcode}
            base={route.base}
            editOnly={route.editOnly}
          />
        );
        break;
      case 'favmeal':
        screen = <FavMealScreen key={`${stack.length}-${route.id}`} id={route.id} />;
        break;
      case 'profile':
        screen = <ProfileScreen key={stack.length} />;
        break;
      case 'import':
        screen = <ImportScreen key={stack.length} />;
        break;
      case 'cloud':
        screen = <CloudScreen key={stack.length} />;
        break;
      case 'friend':
        screen = <FriendScreen key={`${stack.length}-${route.friend.id}`} friend={route.friend} />;
        break;
      case 'micros':
        screen = <MicrosScreen key={stack.length} date={route.date} />;
        break;
    }
  }

  return (
    <NavProvider value={nav}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>{screen}</View>
    </NavProvider>
  );
}

function TabBar() {
  const nav = useNav();
  const { tab, setTab, day } = nav;
  const insets = useSafeAreaInsets();
  const item = (t: Tab, icon: IconName, label: string) => {
    const on = tab === t;
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => setTab(t)}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 52 }}
      >
        <Icon name={icon} size={24} color={on ? C.accent : C.muted} />
        <Text style={{ fontFamily: on ? F.bold : F.semibold, fontSize: 11, color: on ? C.accent : C.muted }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 8,
        paddingBottom: 8 + insets.bottom,
        paddingHorizontal: 8,
        backgroundColor: C.card,
        borderTopWidth: 1,
        borderTopColor: '#E9E7E1',
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {item('today', 'home', 'Vandaag')}
      {item('weight', 'weight', 'Gewicht')}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Eten toevoegen"
          onPress={() => nav.push({ name: 'add', meal: mealForNow(), date: day })}
          style={({ pressed }) => ({
            width: 58,
            height: 58,
            marginTop: -30,
            borderRadius: 29,
            backgroundColor: C.accent,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
            elevation: 4,
            shadowColor: '#1C1E1B',
            shadowOpacity: 0.18,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 6 },
          })}
        >
          <Icon name="plus" size={28} color={C.white} strokeWidth={2.4} />
        </Pressable>
      </View>
      {item('friends', 'users', 'Vrienden')}
      {item('goals', 'target', 'Doelen')}
    </View>
  );
}
