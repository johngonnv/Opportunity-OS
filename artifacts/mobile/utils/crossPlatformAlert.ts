import { Alert, Platform } from "react-native";

/**
 * Cross-platform confirmation and notification helpers.
 *
 * On Expo web, React Native's `Alert.alert` is a silent no-op for
 * dialogs that include action buttons (and the OK-only variant only
 * works inconsistently). That means every "Are you sure?" confirm and
 * many error toasts in the admin app were invisible in a desktop
 * browser, which led to admins thinking buttons did nothing.
 *
 * These helpers fall back to the browser's native `window.confirm` /
 * `window.alert` on web, and use `Alert.alert` on native.
 */

export interface ConfirmOptions {
  /** Label for the confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** When true, the native confirm button uses the destructive style. */
  destructive?: boolean;
}

/**
 * Show a confirmation dialog and resolve to true if the user confirms,
 * false if they cancel (or if no confirm UI is available on web).
 */
export function confirmAction(
  title: string,
  message: string,
  opts: ConfirmOptions = {},
): Promise<boolean> {
  const { confirmLabel = "Confirm", cancelLabel = "Cancel", destructive = false } = opts;

  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }
    // Fail safe: never auto-confirm a destructive action when no
    // confirm UI is available. Better to do nothing than to act
    // without consent.
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}

/**
 * Show a plain notification (no buttons besides OK). Resolves when
 * the user dismisses, so callers can `await` it if they want.
 */
export function alertMessage(title: string, message?: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message ? `${title}\n\n${message}` : title);
    } else if (typeof console !== "undefined") {
      console.warn(`[alert] ${title}${message ? ": " + message : ""}`);
    }
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [{ text: "OK", onPress: () => resolve() }]);
  });
}

/** Convenience: extract a useful message from an unknown thrown value. */
export function errorMessage(err: unknown, fallback = "Unexpected error"): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}
