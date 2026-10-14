import { useEffect, useRef, useState } from "react";
import { Animated, Image, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { Text } from "./Text";
import { useAuth } from "@/auth/AuthContext";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// SY41 — the opening screen, Biz Analyst style: logo + wordmark on bond
// green with a trust line at the bottom, held until the session and
// profile are loaded, then faded straight into the dashboard.
//
// The native splash (app.json → expo-splash-screen) shows the same
// image at the same width, centred on the full screen, so swapping to
// this view is invisible; this one adds the trust line and stays up
// while AuthContext loads instead of the old "Loading…" spinner.

// Must match the expo-splash-screen imageWidth in app.json.
const IMAGE_WIDTH = 300;
// Never trap the user behind the splash if loading hangs.
const MAX_MS = 8000;

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export function BrandSplash() {
  const { loading } = useAuth();
  const opacity = useRef(new Animated.Value(1)).current;
  const [gone, setGone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), MAX_MS);
    return () => clearTimeout(id);
  }, []);

  const ready = !loading || timedOut;
  useEffect(() => {
    if (!ready) return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setGone(true));
  }, [ready, opacity]);

  if (gone) return null;
  return (
    <Animated.View
      pointerEvents={ready ? "none" : "auto"}
      style={[StyleSheet.absoluteFill, styles.wrap, { opacity }]}
      // This view is identical to the native splash, so hide that one
      // as soon as this has painted.
      onLayout={() => void SplashScreen.hideAsync().catch(() => undefined)}
      accessible
      accessibilityLabel={t("splash.trust")}
    >
      <Image
        source={require("../../assets/splash.png")}
        style={styles.image}
        resizeMode="contain"
      />
      <View style={styles.trust}>
        <Text style={styles.trustText}>🔒 {t("splash.trust")}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.bond,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  image: { width: IMAGE_WIDTH, height: IMAGE_WIDTH },
  trust: {
    position: "absolute",
    bottom: 48,
    left: 24,
    right: 24,
    alignItems: "center",
  },
  trustText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    opacity: 0.9,
  },
});
