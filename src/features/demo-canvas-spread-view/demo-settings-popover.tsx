// features/demo-canvas-spread-view/demo-settings-popover.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Settings, RefreshCw } from "lucide-react";

export interface MockOptions {
  spreadCount: number;
  imageCount: number;
  textboxCount: number;
  objectCount: number;
  withGeneratedImages: boolean;
  isDPS: boolean;
  language: "en_US" | "vi_VN";
}

export interface FeatureFlags {
  isEditable: boolean;
  canAddSpread: boolean;
  canReorderSpread: boolean;
  canDeleteSpread: boolean;
  canAddItem: boolean;
  canDeleteItem: boolean;
  canResizeItem: boolean;
  canDragItem: boolean;
  renderImageToolbar: boolean;
  renderTextToolbar: boolean;
  renderPageToolbar: boolean;
  renderObjectToolbar: boolean;
}

export interface ItemFlags {
  showImages: boolean;
  showTexts: boolean;
  showObjects: boolean;
}

interface DemoSettingsPopoverProps {
  mockOptions: MockOptions;
  featureFlags: FeatureFlags;
  itemFlags: ItemFlags;
  onMockOptionChange: <K extends keyof MockOptions>(key: K, value: MockOptions[K]) => void;
  onFeatureFlagChange: <K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]) => void;
  onItemFlagChange: <K extends keyof ItemFlags>(key: K, value: ItemFlags[K]) => void;
  onRegenerate: () => void;
}

export function DemoSettingsPopover({
  mockOptions,
  featureFlags,
  itemFlags,
  onMockOptionChange,
  onFeatureFlagChange,
  onItemFlagChange,
  onRegenerate,
}: DemoSettingsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9">
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Demo Settings</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              className="h-7 gap-1.5 text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </Button>
          </div>

          <Separator />

          {/* Mock Data Options */}
          <div className="space-y-3">
            <Label className="text-xs font-medium text-muted-foreground">
              MOCK DATA
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Spreads: {mockOptions.spreadCount}
                </Label>
                <Slider
                  value={[mockOptions.spreadCount]}
                  onValueChange={([v]) => onMockOptionChange("spreadCount", v)}
                  min={1}
                  max={20}
                  step={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Images: {mockOptions.imageCount}
                </Label>
                <Slider
                  value={[mockOptions.imageCount]}
                  onValueChange={([v]) => onMockOptionChange("imageCount", v)}
                  min={0}
                  max={5}
                  step={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Textboxes: {mockOptions.textboxCount}
                </Label>
                <Slider
                  value={[mockOptions.textboxCount]}
                  onValueChange={([v]) => onMockOptionChange("textboxCount", v)}
                  min={0}
                  max={5}
                  step={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Objects: {mockOptions.objectCount}
                </Label>
                <Slider
                  value={[mockOptions.objectCount]}
                  onValueChange={([v]) => onMockOptionChange("objectCount", v)}
                  min={0}
                  max={5}
                  step={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Language</Label>
                <Select
                  value={mockOptions.language}
                  onValueChange={(v) =>
                    onMockOptionChange("language", v as "en_US" | "vi_VN")
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en_US">English</SelectItem>
                    <SelectItem value="vi_VN">Vietnamese</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <div className="flex items-center gap-1.5">
                <Switch
                  id="isDPS"
                  checked={mockOptions.isDPS}
                  onCheckedChange={(v) => onMockOptionChange("isDPS", v)}
                  className="scale-75"
                />
                <Label htmlFor="isDPS" className="text-xs">
                  DPS
                </Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Switch
                  id="withImages"
                  checked={mockOptions.withGeneratedImages}
                  onCheckedChange={(v) =>
                    onMockOptionChange("withGeneratedImages", v)
                  }
                  className="scale-75"
                />
                <Label htmlFor="withImages" className="text-xs">
                  Images
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Item Flags */}
          <div className="space-y-3">
            <Label className="text-xs font-medium text-muted-foreground">
              ITEM FLAGS
            </Label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {(["showImages", "showTexts"] as const).map((key) => (
                <div key={key} className="flex items-center gap-1.5">
                  <Switch
                    id={key}
                    checked={itemFlags[key]}
                    onCheckedChange={(v) => onItemFlagChange(key, v)}
                    className="scale-75"
                  />
                  <Label htmlFor={key} className="text-xs">
                    {key}
                  </Label>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Switch
                id="showObjects"
                checked={itemFlags.showObjects}
                onCheckedChange={(v) => onItemFlagChange("showObjects", v)}
                className="scale-75"
              />
              <Label htmlFor="showObjects" className="text-xs">
                showObjects
              </Label>
            </div>
          </div>

          <Separator />

          {/* Feature Flags */}
          <div className="space-y-3">
            <Label className="text-xs font-medium text-muted-foreground">
              FEATURE FLAGS
            </Label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {(Object.keys(featureFlags) as Array<keyof FeatureFlags>).map(
                (key) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <Switch
                      id={key}
                      checked={featureFlags[key]}
                      onCheckedChange={(v) => onFeatureFlagChange(key, v)}
                      className="scale-75"
                    />
                    <Label htmlFor={key} className="text-xs">
                      {key}
                    </Label>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default DemoSettingsPopover;
