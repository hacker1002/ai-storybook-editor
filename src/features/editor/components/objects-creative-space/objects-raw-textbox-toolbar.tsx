// objects-raw-textbox-toolbar.tsx - Read-only toolbar for raw textbox items (geometry display + split)
"use client";

import { useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Scissors } from "lucide-react";
import { toast } from "sonner";
import {
  useToolbarPosition,
  type BaseSpread,
  type TextToolbarContext,
} from "@/features/editor/components/canvas-spread-view";
import { createLogger } from "@/utils/logger";
import {
  ReadOnlyGeometrySection,
  ToolbarIconButton,
} from "@/features/editor/components/shared-components";
import { useLanguageCode } from "@/stores/editor-settings-store";
import { getTextboxContentForLanguage } from "@/features/editor/utils/textbox-helpers";

const log = createLogger("Editor", "ObjectsRawTextboxToolbar");

interface ObjectsRawTextboxToolbarProps<TSpread extends BaseSpread> {
  context: TextToolbarContext<TSpread>;
}

export function ObjectsRawTextboxToolbar<TSpread extends BaseSpread>({
  context,
}: ObjectsRawTextboxToolbarProps<TSpread>) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const { item, onSplitTextbox, selectedGeometry, canvasRef } = context;

  const position = useToolbarPosition({
    geometry: selectedGeometry,
    canvasRef,
    toolbarRef,
  });

  const editorLangCode = useLanguageCode();
  const langResult = getTextboxContentForLanguage(
    item as unknown as Record<string, unknown>,
    editorLangCode
  );
  const geometry = langResult?.content?.geometry ?? { x: 0, y: 0, w: 0, h: 0 };

  const handleSplit = useCallback(() => {
    if (onSplitTextbox) {
      log.info("handleSplit", "splitting raw textbox", { itemId: item.id });
      onSplitTextbox();
    } else {
      toast.info("Split not available");
    }
  }, [onSplitTextbox, item.id]);

  const toolbarStyle: React.CSSProperties = position
    ? {
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
      }
    : { position: "fixed", opacity: 0, pointerEvents: "none" };

  if (typeof document === "undefined") return null;

  const toolbarContent = (
    <TooltipProvider delayDuration={300}>
      <div
        ref={toolbarRef}
        data-toolbar="raw-text"
        role="toolbar"
        aria-label="Raw textbox toolbar"
        className="min-w-[280px] rounded-lg border bg-popover p-3 shadow-2xl flex flex-col gap-3"
        style={toolbarStyle}
      >
        <ReadOnlyGeometrySection geometry={geometry} />

        <div className="flex items-center gap-1 border-t border-border pt-2">
          <ToolbarIconButton
            icon={Scissors}
            label="Split textbox"
            onClick={handleSplit}
          />
        </div>
      </div>
    </TooltipProvider>
  );

  return createPortal(toolbarContent, document.body);
}
