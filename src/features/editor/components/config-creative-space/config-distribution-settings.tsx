// config-distribution-settings.tsx — Distribution section root. Multi-source
// (ORIGINAL book + N remixes) export-artifact hub. v1: only Printing Book
// 300 DPI is export-able; all channels toggle is_enabled (persisted).
//
// Status ownership (design §4.6): job handler is single-writer of status/media.
// Client enqueues + toggles is_enabled. UI reflects DB via:
//   - refetch-on-mount (self-heal stuck EXPORTING)
//   - standalone export_pdf watcher (refetch on running/terminal)
//   - post-enqueue refetch (in useDistributionActions)
// No FE polling — backend reaper guards permanent stuck.

import * as React from 'react';
import { useCurrentBook, useBookActions } from '@/stores/book-store';
import { useRemixes, useRemixActions } from '@/stores/remix-store';
import {
  useDistributionActions,
  type EnqueueExportOutcome,
} from '@/hooks/use-distribution-actions';
import { useExportJobWatcher } from '@/hooks/use-export-job-watcher';
import {
  CHANNELS,
  V1_EXPORT_CAPABILITY,
  VIDEO_TYPE_LABELS,
  coalesceDistribution,
  getLeaf,
  patchLeafEnabled,
} from './distribution-helpers';
import {
  DistributionSourceSection,
  ChannelExportGroup,
} from './config-distribution-settings/index';
import type {
  ChannelKey,
  Distribution,
  ExportVariantLeaf,
  VideoType,
} from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'ConfigDistributionSettings');

const EXPORT_OPTS = { dpi: 300, color_mode: 'cmyk' } as const;

type SourceKind = 'book' | 'remix';
interface DistSource {
  kind: SourceKind;
  id: string;
  key: string; // 'book' | remix.id — accordion expand key
  label: string;
  dist: Distribution;
}

interface ChannelView {
  groupKey: string;
  label: string;
  channelKey: ChannelKey;
  videoType?: VideoType;
  variants: Array<{ descriptor: { leafKey: string; label: string }; leaf: ExportVariantLeaf }>;
  canExport: boolean;
  anyExporting: boolean;
}

/** Build the per-channel view (variants + gating) for one source. */
function buildChannelViews(dist: Distribution): ChannelView[] {
  const views: ChannelView[] = [];
  for (const ch of CHANNELS) {
    const cap = V1_EXPORT_CAPABILITY[ch.key];
    if (ch.key === 'video') {
      for (const entry of dist.videos) {
        const variants = ch.variants.map((descriptor) => ({
          descriptor,
          leaf: getLeaf(dist, 'video', descriptor.leafKey, entry.type),
        }));
        const exportable = variants.filter((v) =>
          cap.exportableLeafKeys.includes(v.descriptor.leafKey),
        );
        const anyChecked = exportable.some((v) => v.leaf.is_enabled);
        const anyExporting = exportable.some((v) => v.leaf.status === 'exporting');
        views.push({
          groupKey: `video-${entry.type}`,
          label: VIDEO_TYPE_LABELS[entry.type],
          channelKey: 'video',
          videoType: entry.type,
          variants,
          canExport: exportable.length > 0 && anyChecked && !anyExporting,
          anyExporting,
        });
      }
      continue;
    }
    const variants = ch.variants.map((descriptor) => ({
      descriptor,
      leaf: getLeaf(dist, ch.key, descriptor.leafKey),
    }));
    const exportable = variants.filter((v) =>
      cap.exportableLeafKeys.includes(v.descriptor.leafKey),
    );
    const anyChecked = exportable.some((v) => v.leaf.is_enabled);
    const anyExporting = exportable.some((v) => v.leaf.status === 'exporting');
    views.push({
      groupKey: ch.key,
      label: ch.label,
      channelKey: ch.key,
      variants,
      canExport: exportable.length > 0 && anyChecked && !anyExporting,
      anyExporting,
    });
  }
  return views;
}

export function ConfigDistributionSettings() {
  const book = useCurrentBook();
  const remixes = useRemixes();
  const { updateBook, refetchBookDistribution } = useBookActions();
  const { refetchRemix } = useRemixActions();
  const {
    updateRemixDistribution,
    startBookExportPdf,
    startRemixExportPdf,
    startBookRenderVideo,
    startRemixRenderVideo,
  } = useDistributionActions();

  const [expandedSources, setExpandedSources] = React.useState<Set<string>>(
    () => new Set(['book']),
  );

  // Memoized sources keyed on raw store refs (avoid re-render loop — coalesce
  // produces fresh objects, so never select these inline). Memory: useMemo on
  // stable raw refs, not useShallow on mapped arrays.
  const bookId = book?.id ?? null;
  const sources = React.useMemo<DistSource[]>(() => {
    if (!book) return [];
    const list: DistSource[] = [
      {
        kind: 'book',
        id: book.id,
        key: 'book',
        label: 'ORIGINAL',
        dist: coalesceDistribution(book.distribution),
      },
    ];
    remixes.forEach((r, i) => {
      list.push({
        kind: 'remix',
        id: r.id,
        key: r.id,
        label: r.name?.toUpperCase() || `REMIX ${i + 1}`,
        dist: coalesceDistribution(r.distribution),
      });
    });
    return list;
  }, [book, remixes]);

  const remixIds = React.useMemo(() => remixes.map((r) => r.id), [remixes]);

  // Mount the standalone export_pdf watcher (book + current remixes).
  useExportJobWatcher({ bookId, remixIds });

  // Refetch-on-mount self-heal (stuck EXPORTING). Runs once per book id.
  React.useEffect(() => {
    if (!bookId) return;
    log.info('refetchOnMount', 'pull distribution', { bookId, remixCount: remixIds.length });
    void refetchBookDistribution(bookId);
    for (const id of remixIds) void refetchRemix(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const toggleExpand = React.useCallback((key: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const saveSource = React.useCallback(
    (src: DistSource, nextDist: Distribution) => {
      if (src.kind === 'book') {
        void updateBook(src.id, { distribution: nextDist });
      } else {
        void updateRemixDistribution(src.id, nextDist);
      }
    },
    [updateBook, updateRemixDistribution],
  );

  const handleToggleVariant = React.useCallback(
    (src: DistSource, channelKey: ChannelKey, leafKey: string, next: boolean, videoType?: VideoType) => {
      const nextDist = patchLeafEnabled(src.dist, channelKey, leafKey, next, videoType);
      saveSource(src, nextDist);
    },
    [saveSource],
  );

  const handleExportChannel = React.useCallback(
    async (
      src: DistSource,
      channelKey: ChannelKey,
      videoType?: VideoType,
    ): Promise<EnqueueExportOutcome> => {
      if (channelKey === 'printer') {
        log.info('handleExportChannel', 'start export-pdf', { kind: src.kind, id: src.id });
        return src.kind === 'book'
          ? await startBookExportPdf(src.id, EXPORT_OPTS)
          : await startRemixExportPdf(src.id, EXPORT_OPTS);
      }
      if (channelKey === 'video' && videoType) {
        log.info('handleExportChannel', 'start render-book-video', {
          kind: src.kind,
          id: src.id,
          edition: videoType,
        });
        const opts = { edition: videoType } as const;
        return src.kind === 'book'
          ? await startBookRenderVideo(src.id, opts)
          : await startRemixRenderVideo(src.id, opts);
      }
      return { kind: 'skipped', reason: 'channel_not_exportable_v1' };
    },
    [startBookExportPdf, startRemixExportPdf, startBookRenderVideo, startRemixRenderVideo],
  );

  const handleViewVariant = React.useCallback(
    (src: DistSource, channelKey: ChannelKey, leafKey: string, videoType?: VideoType) => {
      const leaf = getLeaf(src.dist, channelKey, leafKey, videoType);
      if (!leaf.media_url) {
        log.warn('handleViewVariant', 'no media_url', { channelKey, leafKey });
        return;
      }
      // Scheme allowlist — artifact is a trusted public http(s) URL; reject any
      // javascript:/data: from a tampered row before opening.
      if (!/^https?:\/\//i.test(leaf.media_url)) {
        log.warn('handleViewVariant', 'rejected non-http url', { channelKey, leafKey });
        return;
      }
      window.open(leaf.media_url, '_blank', 'noopener,noreferrer');
    },
    [],
  );

  if (!book) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <h3 className="text-sm font-semibold">Distribution Settings</h3>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto p-4">
        {sources.map((src) => {
          const views = buildChannelViews(src.dist);
          return (
            <DistributionSourceSection
              key={src.key}
              label={src.label}
              expanded={expandedSources.has(src.key)}
              onToggle={() => toggleExpand(src.key)}
            >
              {views.map((view) => (
                <ChannelExportGroup
                  key={view.groupKey}
                  label={view.label}
                  channelKey={view.channelKey}
                  videoType={view.videoType}
                  variants={view.variants}
                  canExport={view.canExport}
                  anyExporting={view.anyExporting}
                  onExport={() => handleExportChannel(src, view.channelKey, view.videoType)}
                  onToggleVariant={(leafKey, next) =>
                    handleToggleVariant(src, view.channelKey, leafKey, next, view.videoType)
                  }
                  onViewVariant={(leafKey) =>
                    handleViewVariant(src, view.channelKey, leafKey, view.videoType)
                  }
                />
              ))}
            </DistributionSourceSection>
          );
        })}
      </div>
    </div>
  );
}
