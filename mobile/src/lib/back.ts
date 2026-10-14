import { useCallback } from "react";
import { BackHandler } from "react-native";
import { router, useFocusEffect } from "expo-router";

/** One step back; when there is no history (opened from a notification
 *  or a cold-start deep link) go to `fallback` instead of leaving the
 *  app. */
export function goBackOr(fallback: string = "/"): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}

/**
 * Android hardware back on a sub-screen. With history, the navigator
 * pops one screen as usual. Without history the default would close the
 * app — instead we send the user to `fallback`. Pass `intercept` to run
 * your own logic first (return true when you handled it, e.g. you
 * showed a "Discard this order?" dialog).
 */
export function useHardwareBack(
  fallback: string = "/",
  intercept?: () => boolean,
): void {
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (intercept?.()) return true;
        if (router.canGoBack()) return false;
        router.replace(fallback as never);
        return true;
      });
      return () => sub.remove();
    }, [fallback, intercept]),
  );
}
