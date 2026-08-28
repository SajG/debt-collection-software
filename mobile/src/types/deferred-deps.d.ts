// Ambient shims for packages listed in package.json but not yet
// installed in this workspace (they land after `npm install`). Keeps
// tsc green while the working tree is mid-upgrade. Delete once the
// real @types (or bundled types) are present.

declare module "expo-local-authentication" {
  export function hasHardwareAsync(): Promise<boolean>;
  export function isEnrolledAsync(): Promise<boolean>;
  export function authenticateAsync(options?: {
    promptMessage?: string;
    fallbackLabel?: string;
    disableDeviceFallback?: boolean;
    cancelLabel?: string;
  }): Promise<{ success: boolean; error?: string; warning?: string }>;
}

declare module "expo-crypto" {
  export const CryptoDigestAlgorithm: {
    SHA1: "SHA-1";
    SHA256: "SHA-256";
    SHA384: "SHA-384";
    SHA512: "SHA-512";
    MD2: "MD2";
    MD4: "MD4";
    MD5: "MD5";
  };
  export function digestStringAsync(
    algorithm: string,
    data: string,
    options?: { encoding?: "hex" | "base64" },
  ): Promise<string>;
  export function getRandomBytes(byteCount: number): Uint8Array;
  export function getRandomBytesAsync(byteCount: number): Promise<Uint8Array>;
}

declare module "expo-font" {
  export function useFonts(
    map: Record<string, number | { default: number } | string>,
  ): [boolean, Error | null];
  export function loadAsync(
    map: Record<string, number | string>,
  ): Promise<void>;
}

declare module "expo-updates" {
  export const isEnabled: boolean;
  export const channel: string | null;
  export const runtimeVersion: string | null;
  export function checkForUpdateAsync(): Promise<{ isAvailable: boolean }>;
  export function fetchUpdateAsync(): Promise<{ isNew: boolean }>;
  export function reloadAsync(): Promise<void>;
  export function addListener(
    listener: (event: {
      type: "updateAvailable" | "noUpdateAvailable" | "error";
    }) => void,
  ): { remove(): void };
}

declare module "expo-localization" {
  export const locale: string;
  export const locales: string[];
  export function getLocales(): {
    languageCode: string | null;
    regionCode: string | null;
    languageTag: string;
  }[];
}

declare module "expo-haptics" {
  export enum ImpactFeedbackStyle {
    Light = "light",
    Medium = "medium",
    Heavy = "heavy",
  }
  export enum NotificationFeedbackType {
    Success = "success",
    Warning = "warning",
    Error = "error",
  }
  export function impactAsync(style?: ImpactFeedbackStyle): Promise<void>;
  export function notificationAsync(
    type?: NotificationFeedbackType,
  ): Promise<void>;
  export function selectionAsync(): Promise<void>;
}

declare module "@sentry/react-native" {
  export function init(opts: Record<string, unknown>): void;
  export function setTag(key: string, value: string): void;
  export function captureException(
    e: unknown,
    extra?: Record<string, unknown>,
  ): void;
  export function addBreadcrumb(bc: Record<string, unknown>): void;
  export function wrap<T>(app: T): T;
}

declare module "expo-application" {
  export const nativeApplicationVersion: string | null;
  export const nativeBuildVersion: string | null;
}

declare module "react-native-svg" {
  import * as React from "react";
  import type { ViewProps } from "react-native";
  export interface SvgProps extends ViewProps {
    width?: number | string;
    height?: number | string;
    viewBox?: string;
    accessibilityLabel?: string;
    children?: React.ReactNode;
  }
  export interface ShapeProps {
    fill?: string;
    stroke?: string;
    strokeWidth?: number | string;
    d?: string;
    cx?: number | string;
    cy?: number | string;
    r?: number | string;
    x1?: number | string;
    y1?: number | string;
    x2?: number | string;
    y2?: number | string;
    x?: number | string;
    y?: number | string;
    rx?: number | string;
    ry?: number | string;
    width?: number | string;
    height?: number | string;
    offset?: number | string;
    stopColor?: string;
    id?: string;
    children?: React.ReactNode;
  }
  const Svg: React.ComponentType<SvgProps>;
  export default Svg;
  export const Circle: React.ComponentType<ShapeProps>;
  export const Path: React.ComponentType<ShapeProps>;
  export const Rect: React.ComponentType<ShapeProps>;
  export const Defs: React.ComponentType<{ children?: React.ReactNode }>;
  export const LinearGradient: React.ComponentType<ShapeProps>;
  export const Stop: React.ComponentType<ShapeProps>;
}
