import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { reportError, crumb } from "@/lib/observability";
import { theme } from "@/theme";

// Screen-level ErrorBoundary. Wraps every group layout so a rogue
// render doesn't nuke the app-bar pill + sign-out button — those
// live in the parent layout, which stays mounted.
//
// The "Report a problem" button fires reportError() with the last
// 20 breadcrumbs Sentry has captured. It also drops a "user-
// reported" crumb so the search on the Sentry issue narrows fast.

type State = { error: Error | null };

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportError(error, {
      componentStack: info.componentStack ?? "",
      boundary: this.props.label ?? "screen",
    });
  }

  reset = () => {
    this.setState({ error: null });
  };

  goHome = () => {
    this.reset();
    try {
      router.replace("/");
    } catch {
      /* router not ready */
    }
  };

  report = () => {
    if (!this.state.error) return;
    crumb("user", "Report a problem tapped", {
      boundary: this.props.label ?? "screen",
    });
    reportError(this.state.error, { userReported: true });
    this.reset();
    this.goHome();
  };

  render() {
    if (!this.state.error) return this.props.children as React.ReactElement;
    return (
      <View style={styles.wrap} accessibilityLiveRegion="polite">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          Syncit hit an unexpected error on this screen. Your data is
          safe — nothing has been sent or lost. Tap Report so we can
          fix it, then head back to the home screen.
        </Text>
        {__DEV__ ? (
          <Text style={styles.devDetail} selectable>
            {this.state.error.name}: {this.state.error.message}
          </Text>
        ) : null}
        <View style={styles.row}>
          <Pressable
            onPress={this.report}
            style={({ pressed }) => [
              styles.btn,
              styles.btnPrimary,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Report this problem to the team"
          >
            <Text style={styles.btnLabel}>Report a problem</Text>
          </Pressable>
          <Pressable
            onPress={this.goHome}
            style={({ pressed }) => [
              styles.btn,
              styles.btnSecondary,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
          >
            <Text style={[styles.btnLabel, styles.btnLabelSecondary]}>
              Back to home
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: theme.spacing.lg,
    justifyContent: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
  },
  body: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    lineHeight: 26,
  },
  devDetail: {
    marginTop: 4,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
    fontFamily: "Menlo",
    fontSize: 12,
    color: theme.colors.text,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginTop: theme.spacing.md,
  },
  btn: {
    flex: 1,
    minHeight: theme.tap,
    borderRadius: theme.radius,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.md,
  },
  btnPrimary: { backgroundColor: theme.colors.primary },
  btnSecondary: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  btnLabel: {
    color: "#fff",
    fontWeight: "800",
    fontSize: theme.type.button,
  },
  btnLabelSecondary: { color: theme.colors.text },
});
