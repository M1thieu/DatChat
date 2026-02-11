import { Toaster } from "sonner";

/**
 * Toast notifications using Sonner library
 * Beautiful, accessible, and feature-rich
 */
export function ToastContainer() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--color-bg-secondary)",
          color: "var(--color-text-primary)",
          border: "1px solid var(--color-bg-active)",
        },
        className: "sonner-toast",
      }}
      theme="dark"
    />
  );
}
