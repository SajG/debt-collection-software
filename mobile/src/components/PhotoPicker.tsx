import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { theme } from "@/theme";

export type PickedPhoto = {
  uri: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
};

/**
 * Two big buttons + a preview thumbnail. Optimised for a salesperson
 * standing at a customer's counter: rear camera first (they'll snap the
 * bank / UPI screen), gallery second (they already screenshotted it).
 *
 * Permission prompts fire on-demand — this keeps first-launch clean and
 * lets salespeople deny once without breaking the rest of the app.
 */
export function PhotoPicker({
  photo,
  onChange,
}: {
  photo: PickedPhoto | null;
  onChange: (p: PickedPhoto | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function takePhoto() {
    try {
      setBusy(true);
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Camera access needed",
          "Enable camera in Settings so SynWorks can capture the proof."
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        exif: false,
      });
      if (result.canceled || result.assets.length === 0) return;
      onChange(assetToPhoto(result.assets[0]));
    } finally {
      setBusy(false);
    }
  }

  async function pickFromLibrary() {
    try {
      setBusy(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Photo access needed",
          "Enable photo access in Settings so SynWorks can attach the proof."
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        exif: false,
      });
      if (result.canceled || result.assets.length === 0) return;
      onChange(assetToPhoto(result.assets[0]));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      {photo && (
        <View style={styles.previewWrap}>
          <Image
            source={{ uri: photo.uri }}
            style={styles.preview}
            resizeMode="cover"
          />
          <Pressable
            onPress={() => onChange(null)}
            style={styles.removeBtn}
            hitSlop={12}
            accessibilityLabel="Remove selected photo"
          >
            <Text style={styles.removeBtnText}>✕ Remove</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.actionRow}>
        <Pressable
          onPress={takePhoto}
          disabled={busy}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.actionPrimary,
            pressed && { opacity: 0.85 },
            busy && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.actionPrimaryText}>
            {photo ? "Retake photo" : "Take photo"}
          </Text>
        </Pressable>
        <Pressable
          onPress={pickFromLibrary}
          disabled={busy}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.actionSecondary,
            pressed && { opacity: 0.85 },
            busy && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.actionSecondaryText}>From gallery</Text>
        </Pressable>
      </View>
    </View>
  );
}

function assetToPhoto(asset: ImagePicker.ImagePickerAsset): PickedPhoto {
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? null,
    mimeType: asset.mimeType ?? null,
    fileSize: asset.fileSize ?? null,
  };
}

const styles = StyleSheet.create({
  previewWrap: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.radius,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
  },
  preview: {
    width: "100%",
    height: 220,
  },
  removeBtn: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius,
  },
  removeBtnText: {
    color: "#FFFFFF",
    fontSize: theme.type.bodySmall,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  actionBtn: {
    flex: 1,
    minHeight: theme.tap,
    borderRadius: theme.radius,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.md,
  },
  actionPrimary: {
    backgroundColor: theme.colors.primary,
  },
  actionPrimaryText: {
    color: theme.colors.primaryOn,
    fontSize: theme.type.button,
    fontWeight: "600",
  },
  actionSecondary: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  actionSecondaryText: {
    color: theme.colors.text,
    fontSize: theme.type.button,
    fontWeight: "600",
  },
});
