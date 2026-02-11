import clsx from "clsx";
import type { ClassValue } from "clsx";
import copy from "copy-to-clipboard";
import { addToast } from "@/stores/toast";

/**
 * Utility to merge className strings
 * Usage: cn("base", condition && "conditional", "always")
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Copy text to clipboard with toast feedback
 */
export function copyToClipboard(text: string, successMessage = "Copied to clipboard!") {
  const success = copy(text);
  if (success) {
    addToast(successMessage, "success");
  } else {
    addToast("Failed to copy", "error");
  }
  return success;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(str: string, length: number) {
  return str.length > length ? str.slice(0, length) + "…" : str;
}

/**
 * Sleep utility for delays
 */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Generate a random color for avatars (based on user ID)
 */
export function getAvatarColor(userId: string) {
  const colors = [
    "var(--color-accent)",
    "#5865f2",
    "#57f287",
    "#fee75c",
    "#eb459e",
    "#ed4245",
    "#f26522",
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
