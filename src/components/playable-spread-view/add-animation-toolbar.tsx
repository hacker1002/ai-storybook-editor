// add-animation-toolbar.tsx - Dropdown menu for adding animations to selected items
import { ImageIcon, VideoIcon, Volume2, Type } from 'lucide-react';
import type { AddAnimationToolbarProps, AnimationMediaType } from './types';

// Animation options for object items (image, video, sound)
const OBJECT_OPTIONS: { type: AnimationMediaType; label: string; icon: typeof ImageIcon }[] = [
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'video', label: 'Video', icon: VideoIcon },
  { type: 'sound', label: 'Sound', icon: Volume2 },
];

// Animation options for textbox items (textbox only)
const TEXTBOX_OPTIONS: { type: AnimationMediaType; label: string; icon: typeof Type }[] = [
  { type: 'textbox', label: 'Textbox', icon: Type },
];

/**
 * AddAnimationToolbar - Dropdown menu for animation options
 *
 * Renders a menu with animation type options based on the target item type.
 * Parent component handles portal rendering and positioning.
 */
export function AddAnimationToolbar({
  position,
  targetType,
  onSelectOption,
  onClose,
}: AddAnimationToolbarProps) {
  if (!position) return null;

  const options = targetType === 'object' ? OBJECT_OPTIONS : TEXTBOX_OPTIONS;

  return (
    <div
      data-toolbar="animation"
      role="menu"
      aria-label="Add animation menu"
      className="min-w-[180px] bg-white border border-gray-200 rounded-lg shadow-lg py-1"
    >
      {/* Toolbar header */}
      <div className="px-3 py-2 text-sm font-medium text-gray-500 border-b">
        Add Animation
      </div>

      {/* Animation type options */}
      {options.map(({ type, label, icon: Icon }) => (
        <button
          key={type}
          role="menuitem"
          aria-label={`Add ${label} animation`}
          onClick={() => {
            onSelectOption(type);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
