import { toast } from "sonner";

/**
 * Toast notification helpers using Sonner
 * Usage: addToast("Message", "success")
 */
export const addToast = (message: string, type: "success" | "error" | "info" = "info") => {
  switch (type) {
    case "success":
      return toast.success(message);
    case "error":
      return toast.error(message);
    case "info":
    default:
      return toast(message);
  }
};

// For backward compatibility with existing code
export const useToastStore = () => ({
  addToast,
});
