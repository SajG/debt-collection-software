import type { PickedPhoto } from "@/components/PhotoPicker";

// Client-side compression for camera / gallery assets before they hit
// the offline queue and Supabase Storage. Target: 1600 px longest edge
// at ~80% JPEG quality. Field phones on 3G at a factory cannot afford
// to push raw 12 MP frames — an uncompressed camera capture is 4–6 MB;
// this brings it under 400 KB.
//
// Optional dep: `expo-image-manipulator`. If the module isn't
// installed (or the runtime is web where it's not supported), we log
// once and pass the asset through untouched — the upload still works,
// it's just heavier.

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;

type ManipulatorAction = { resize: { width?: number; height?: number } };
type ManipulatorResult = { uri: string; width: number; height: number };
type ManipulatorModule = {
  manipulateAsync: (
    uri: string,
    actions: ManipulatorAction[],
    options: { compress: number; format: "jpeg" | "png" | "webp" },
  ) => Promise<ManipulatorResult>;
  SaveFormat: { JPEG: "jpeg" };
};

let cached: ManipulatorModule | null | "unavailable" = null;
let warned = false;

function loadManipulator(): ManipulatorModule | null {
  if (cached === "unavailable") return null;
  if (cached) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-image-manipulator") as ManipulatorModule;
    cached = mod;
    return mod;
  } catch {
    cached = "unavailable";
    if (!warned) {
      console.warn(
        "[image-compress] expo-image-manipulator not installed — uploads will use full-resolution captures. Run: npx expo install expo-image-manipulator",
      );
      warned = true;
    }
    return null;
  }
}

export async function compressImage(photo: PickedPhoto): Promise<PickedPhoto> {
  const mani = loadManipulator();
  if (!mani) return photo;

  try {
    // Resize by the longer edge only — omitting the other dimension
    // preserves aspect ratio in expo-image-manipulator.
    const action: ManipulatorAction =
      // Best-effort orientation: portrait vs landscape unknown until
      // we ask the OS, so cap width and let height auto-scale. The
      // resulting file has the longer edge at MAX_EDGE regardless.
      { resize: { width: MAX_EDGE } };

    const result = await mani.manipulateAsync(photo.uri, [action], {
      compress: JPEG_QUALITY,
      format: mani.SaveFormat.JPEG,
    });

    return {
      uri: result.uri,
      fileName: photo.fileName?.replace(/\.[^.]+$/, ".jpg") ?? "capture.jpg",
      mimeType: "image/jpeg",
      // fileSize unknown without a stat — leave null; the upload path
      // doesn't rely on it.
      fileSize: null,
    };
  } catch (e) {
    console.warn("[image-compress] manipulator failed, passing through:", e);
    return photo;
  }
}
