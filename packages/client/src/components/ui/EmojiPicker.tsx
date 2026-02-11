import EmojiPicker, { Theme } from "emoji-picker-react";
import { useEffect, useRef } from "react";

interface EmojiPickerPopupProps {
  onEmojiClick: (emoji: string) => void;
  onClose: () => void;
}

/**
 * Emoji picker using emoji-picker-react library
 * Full-featured with search, categories, skin tones
 */
export function EmojiPickerPopup({ onEmojiClick, onClose }: EmojiPickerPopupProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute bottom-full right-0 mb-2 animate-fadeIn">
      <EmojiPicker
        onEmojiClick={(emojiData) => {
          onEmojiClick(emojiData.emoji);
          onClose();
        }}
        theme={Theme.DARK}
        searchPlaceHolder="Search emoji..."
        width={350}
        height={400}
        previewConfig={{ showPreview: false }}
      />
    </div>
  );
}
