declare module 'react' {
  export type ReactNode = any;
  export type Dispatch<A> = (a: A) => void;
  export type SetStateAction<S> = S | ((p: S) => S);
  export function useState<S>(v: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useMemo<T>(f: () => T, deps: any[]): T;
  export function useCallback<T extends (...a: any[]) => any>(f: T, deps: any[]): T;
  export function useEffect(f: () => any, deps?: any[]): void;
  export function useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, get: () => T): T;
  export function useRef<T>(v: T): { current: T };
  export function useContext<T>(c: Context<T>): T;
  export interface Context<T> { Provider: any }
  export function createContext<T>(v: T): Context<T>;
  const React: any;
  export default React;
}
declare module 'react/jsx-runtime' { export const jsx: any; export const jsxs: any; export const Fragment: any; }
declare namespace JSX { interface IntrinsicElements { [k: string]: any } interface Element {} interface ElementChildrenAttribute { children: {} } }
declare module 'react-native' {
  export const Linking: { openURL(url: string): Promise<any> };
  export const Share: { share(c: { message: string; title?: string }): Promise<any> };
  export const AppState: { addEventListener(type: 'change', cb: (state: 'active' | 'background' | 'inactive' | 'unknown' | 'extension') => void): { remove(): void } };
  export const Modal: any, Image: any, View: any, Text: any, Pressable: any, ScrollView: any, TextInput: any, ActivityIndicator: any, BackHandler: any, Keyboard: any;
  export const StyleSheet: { create<T>(s: T): T; absoluteFill: any };
  export function useWindowDimensions(): { width: number; height: number };
  export type StyleProp<T> = any; export type ViewStyle = any; export type TextStyle = any; export type KeyboardTypeOptions = string;
}
declare module 'react-native-svg' { const Svg: any; export default Svg; export const Circle: any, Path: any, Line: any, Text: any, Rect: any; }
declare module 'react-native-safe-area-context' { export const SafeAreaProvider: any; export function useSafeAreaInsets(): { top: number; bottom: number; left: number; right: number }; }
declare module 'expo-status-bar' { export const StatusBar: any; }
declare module 'expo-font' { export function useFonts(m: any): [boolean, Error | null]; }
declare module 'expo' { export function registerRootComponent(c: any): void; }
declare module 'expo-camera' { export const CameraView: any; export function useCameraPermissions(): [{ granted: boolean } | null, () => Promise<any>]; }
declare module '@expo-google-fonts/bricolage-grotesque' { export const BricolageGrotesque_700Bold: any; }
declare module '@expo-google-fonts/figtree' { export const Figtree_400Regular: any, Figtree_600SemiBold: any, Figtree_700Bold: any; }
declare module '@react-native-async-storage/async-storage' { const A: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> }; export default A; }
declare namespace React { type ReactNode = any; }
declare namespace JSX { interface IntrinsicAttributes { key?: any } }
declare module 'expo-clipboard' { export function getStringAsync(): Promise<string>; export function setStringAsync(t: string): Promise<boolean>; }
declare module 'expo-file-system' {
  export class File {
    constructor(...parts: any[]); readonly exists: boolean; readonly uri: string;
    create(o?: { overwrite?: boolean; intermediates?: boolean }): void; write(c: string): void; delete(): void; text(): Promise<string>;
    static pickFileAsync(o?: { initialUri?: string; mimeTypes?: string | string[]; multipleFiles?: false }): Promise<{ result: File; canceled: false } | { result: null; canceled: true }>;
  }
  export class Directory { constructor(...parts: any[]); readonly uri: string; createFile(name: string, mimeType: string | null): File; static pickDirectoryAsync(initialUri?: string): Promise<Directory>; }
  export const Paths: { cache: any; document: any };
}
declare module 'expo-sharing' { export function isAvailableAsync(): Promise<boolean>; export function shareAsync(url: string, o?: { mimeType?: string; dialogTitle?: string; UTI?: string }): Promise<void>; }
declare module '@react-native-community/datetimepicker' { export const DateTimePickerAndroid: { open(o: { value: Date; mode: 'date' | 'time'; maximumDate?: Date; onChange: (event: { type: string }, date?: Date) => void }): void }; }
declare module 'expo-image-manipulator' { const x: any; export = x; }
declare module '@zxing/library' { const x: any; export = x; }
declare module 'jpeg-js' { const x: any; export = x; }
declare module 'expo-modules-core' { export function requireOptionalNativeModule<T = any>(name: string): T | null; }

declare module 'expo-web-browser' { export function openAuthSessionAsync(url: string, redirectUrl?: string | null, o?: any): Promise<{ type: 'success'; url: string } | { type: 'cancel' | 'dismiss' | 'locked'; url?: undefined }>; }
declare module 'expo-constants' { const Constants: { expoConfig?: { extra?: Record<string, unknown> } | null }; export default Constants; }
declare module 'expo-image-picker' {
  export type MediaType = 'images' | 'videos' | 'livePhotos';
  export type ImagePickerAsset = { uri: string; width: number; height: number; base64?: string | null };
  export type ImagePickerResult = { canceled: true; assets: null } | { canceled: false; assets: ImagePickerAsset[] };
  export type ImagePickerOptions = { mediaTypes?: MediaType[]; quality?: number; base64?: boolean; allowsEditing?: boolean };
  export function requestCameraPermissionsAsync(): Promise<{ granted: boolean }>;
  export function launchCameraAsync(o?: ImagePickerOptions): Promise<ImagePickerResult>;
  export function launchImageLibraryAsync(o?: ImagePickerOptions): Promise<ImagePickerResult>;
}
