import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ORDER_DOC_BUCKET, getSignedUrl } from "@/lib/uploads";
import { theme } from "@/theme";

// Full-screen viewer for order documents. Given a list of pages
// (storage paths + display info), renders one horizontal pager where
// each page is a zoomable image. Pinch-zoom is native (iOS
// ScrollView maximumZoomScale). Android ScrollView doesn't
// implement pinch — accepted trade for zero new deps; the swipe/share
// flow is what factory + salespeople care about day-to-day.
//
// Share uses expo-sharing (optional dep). If absent, we degrade to a
// share-URL Alert so the salesperson can copy the signed URL. In
// practice we'll `npx expo install expo-sharing` — see the note in
// docs/NOTIFICATIONS.md's follow-up.

export type ViewerPage = {
  id: string;
  storagePath: string;
  label: string;
};

type SharingModule = {
  isAvailableAsync: () => Promise<boolean>;
  shareAsync: (uri: string, options?: { mimeType?: string; dialogTitle?: string }) => Promise<void>;
};

function loadSharing(): SharingModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-sharing") as SharingModule;
  } catch {
    return null;
  }
}

export function DocumentViewer({
  visible,
  pages,
  startIndex,
  onClose,
}: {
  visible: boolean;
  pages: ViewerPage[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const listRef = useRef<FlatList<ViewerPage>>(null);
  const width = Dimensions.get("window").width;

  useEffect(() => {
    if (visible) setIndex(startIndex);
  }, [visible, startIndex]);

  // Sign every page's storage path when the viewer opens. Signed URLs
  // are 5 min TTL — plenty for a review + share session.
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        pages.map(async (p) => [
          p.id,
          await getSignedUrl(ORDER_DOC_BUCKET, p.storagePath, 60 * 15),
        ]),
      );
      if (!alive) return;
      const next: Record<string, string | null> = {};
      for (const [id, url] of entries) next[id as string] = url as string | null;
      setUrls(next);
    })();
    return () => {
      alive = false;
    };
  }, [visible, pages]);

  async function shareCurrent() {
    const page = pages[index];
    const url = urls[page.id];
    if (!url) return;
    const sharing = loadSharing();
    // Download to cache first — Android share sheets in particular
    // reject `https://` URIs for images and expect `file://`.
    let localUri: string | null = null;
    try {
      const ext = page.storagePath.split(".").pop()?.toLowerCase() ?? "jpg";
      const target = `${FileSystem.cacheDirectory ?? ""}share-${page.id}.${ext}`;
      const dl = await FileSystem.downloadAsync(url, target);
      if (dl.status === 200) localUri = dl.uri;
    } catch {
      /* fall through */
    }
    if (sharing && (await sharing.isAvailableAsync()) && localUri) {
      await sharing.shareAsync(localUri, {
        mimeType: mimeFor(page.storagePath),
        dialogTitle: page.label,
      });
      return;
    }
    // Fallback: hand the signed URL to the OS via the share sheet's
    // URL affordance. If expo-sharing is missing we can't invoke it;
    // surface the URL so the user can copy-paste into WhatsApp.
    Alert.alert(
      "Share this document",
      "Long-press to copy the link below (valid for 15 min):\n\n" + url,
    );
  }

  const current = pages[index];
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* Pad by insets.top so the Close / Share buttons don't hide
            under the status bar / notch. Was the reason "Close doesn't
            work" — the tap target was behind the system UI. */}
        <View
          style={[
            styles.topBar,
            { paddingTop: Math.max(insets.top, 12), height: 56 + insets.top },
          ]}
        >
          <Pressable
            onPress={onClose}
            hitSlop={16}
            style={styles.topBtn}
            accessibilityRole="button"
            accessibilityLabel="Close viewer"
          >
            <Text style={styles.topBtnText}>✕ Close</Text>
          </Pressable>
          <Text style={styles.topLabel} numberOfLines={1}>
            {current ? current.label : ""}
            {pages.length > 1 ? `  ·  ${index + 1} / ${pages.length}` : ""}
          </Text>
          <Pressable
            onPress={shareCurrent}
            hitSlop={16}
            style={styles.topBtn}
            accessibilityRole="button"
            accessibilityLabel="Share via WhatsApp or other"
          >
            <Text style={styles.topBtnText}>Share</Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          horizontal
          pagingEnabled
          data={pages}
          keyExtractor={(p) => p.id}
          initialScrollIndex={startIndex}
          getItemLayout={(_data, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            setIndex(i);
          }}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <PageView width={width} url={urls[item.id] ?? null} />
          )}
        />

        {pages.length > 1 ? (
          <View style={styles.dotsRow}>
            {pages.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === index && styles.dotActive]}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function PageView({ width, url }: { width: number; url: string | null }) {
  return (
    <View style={[styles.page, { width }]}>
      {url ? (
        <ScrollView
          contentContainerStyle={styles.zoomer}
          // iOS-native pinch zoom. Android caps at 1x (no pinch) but
          // horizontal swipe between pages still works via the parent
          // FlatList — the primary use case (open, glance, share).
          maximumZoomScale={4}
          minimumZoomScale={1}
          bouncesZoom
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          pinchGestureEnabled={Platform.OS === "ios"}
        >
          <Image source={{ uri: url }} style={styles.image} resizeMode="contain" />
        </ScrollView>
      ) : (
        <View style={styles.loader}>
          <Text style={styles.loaderText}>Loading…</Text>
        </View>
      )}
    </View>
  );
}

function mimeFor(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "pdf":
      return "application/pdf";
    default:
      return undefined;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  topBar: {
    // height is set inline (base 56 + safe-area inset) so the buttons
    // don't hide under the status bar on Android + notched iPhones.
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  topBtn: {
    minHeight: theme.tap,
    minWidth: theme.tap,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  topBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  topLabel: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
    flex: 1,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  page: { alignItems: "center", justifyContent: "center" },
  zoomer: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  image: {
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height - 56 - 40,
  },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  loaderText: { color: "#fff", fontSize: 16 },
  dotsRow: {
    height: 40,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  dotActive: { backgroundColor: "#fff", width: 16 },
});
