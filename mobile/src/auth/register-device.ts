import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { supabase } from "@/lib/supabase";
import { setDeviceId } from "@/auth/device-lock";

// SY42 — the step every sign-in path shares once a Supabase session
// exists: register this phone (revoking any previous device — the
// one-active-device rule) and remember its id for the app lock.
// Extracted from the code screen so the invite Join screen uses the
// exact same logic.

function deviceLabel(): string {
  const model = Device.modelName ?? Device.deviceName ?? "device";
  return model.slice(0, 60);
}

function platformString(): string {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return Platform.OS;
}

export type RegisterDeviceResult =
  | { ok: true }
  | { ok: false; message: string | null; accountDisabled: boolean };

export async function registerThisDevice(): Promise<RegisterDeviceResult> {
  const { data: reg, error: regErr } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: { device_id: string }[] | null;
      error: { message: string } | null;
    }>
  )("register_device", {
    p_device: {
      label: deviceLabel(),
      platform: platformString(),
      osVersion: Device.osVersion ?? null,
      appVersion: (Constants.expoConfig?.version as string | undefined) ?? null,
    },
  });
  if (regErr || !reg?.[0]) {
    const accountDisabled = !!regErr?.message?.includes("Account disabled");
    // SY15.9: a disabled account holds a live session at this point.
    if (accountDisabled) await supabase.auth.signOut();
    return { ok: false, message: regErr?.message ?? null, accountDisabled };
  }
  await setDeviceId(reg[0].device_id);
  return { ok: true };
}
