// demo-rive-player.tsx — Isolation test page for .riv interactivity
// Side A: raw @rive-app/react-canvas (no wrappers)
// Side B: project's <RivePlayer> (same component used in editor)
// Remounts on src/artboard/stateMachine change via React key to guarantee fresh init.
"use client";

import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  useCallback,
} from "react";
import {
  useRive,
  Fit,
  Alignment,
  Layout,
  RuntimeLoader,
  EventType,
} from "@rive-app/react-canvas";
import riveWasmUrl from "@rive-app/canvas/rive.wasm?url";

RuntimeLoader.setWasmUrl(riveWasmUrl);

const RivePlayer = lazy(() =>
  import(
    "@/features/editor/components/shared-components/auto-pic-players/rive-player"
  ).then((m) => ({ default: m.RivePlayer }))
);

const DEFAULT_SRC =
  "https://kiprvibenjkhvzekbkrw.supabase.co/storage/v1/object/public/storybook-assets/auto-pics/1776517008713-24876-46460-interactive-bunny-character.riv";

type LogEntry = {
  ts: number;
  source: "A" | "B" | "sys";
  msg: string;
  data?: unknown;
};
type Meta = {
  activeArtboard: string | null;
  allArtboards: string[];
  stateMachinesOnActive: string[];
};

// === Side A raw runtime — keyed subcomponent so useRive reinits on param change ===
interface RiveRawCanvasProps {
  src: string;
  artboard?: string;
  stateMachine?: string;
  onLog: (entry: Omit<LogEntry, "ts">) => void;
  onMeta: (m: Meta) => void;
  onInstance: (r: unknown) => void;
}

function RiveRawCanvas({
  src,
  artboard,
  stateMachine,
  onLog,
  onMeta,
  onInstance,
}: RiveRawCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { RiveComponent, rive } = useRive({
    src,
    artboard,
    stateMachines: stateMachine ? stateMachine : undefined,
    autoplay: true,
    // CRITICAL: without this, Rive does NOT auto-play audio events / open URLs
    // Default is `false` in @rive-app/canvas — must be true for interactive files.
    automaticallyHandleEvents: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    onLoadError: () => onLog({ source: "A", msg: "onLoadError" }),
  });

  useEffect(() => {
    if (!rive) return;
    onInstance(rive);
    const contents = (
      rive as unknown as {
        contents?: {
          artboards?: Array<{
            name: string;
            stateMachines?: Array<{ name: string }>;
          }>;
        };
      }
    )?.contents;
    const abEntries = contents?.artboards ?? [];
    const activeAb = rive.activeArtboard ?? null;
    const activeAbEntry = abEntries.find((a) => a.name === activeAb);
    const smForActive = activeAbEntry?.stateMachines?.map((s) => s.name) ?? [];
    onMeta({
      activeArtboard: activeAb,
      allArtboards: abEntries.map((a) => a.name),
      stateMachinesOnActive: smForActive,
    });
    onLog({
      source: "A",
      msg: "probe",
      data: {
        activeArtboard: activeAb,
        allArtboards: abEntries.map((a) => a.name),
        stateMachinesOnActive: smForActive,
        runtimeStateMachineNames: rive.stateMachineNames,
        isPlaying: rive.isPlaying,
        requestedArtboard: artboard ?? null,
        requestedStateMachine: stateMachine ?? null,
      },
    });

    const onStateChange = (e: unknown) =>
      onLog({ source: "A", msg: "StateChange", data: e });
    const onEvent = (e: unknown) =>
      onLog({ source: "A", msg: "RiveEvent", data: e });
    rive.on(EventType.StateChange, onStateChange);
    rive.on(EventType.RiveEvent, onEvent);
    return () => {
      rive.off(EventType.StateChange, onStateChange);
      rive.off(EventType.RiveEvent, onEvent);
    };
  }, [rive, artboard, stateMachine, onInstance, onMeta, onLog]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const logEvt = (type: string) => (e: Event) => {
      const pe = e as PointerEvent;
      onLog({
        source: "A",
        msg: `dom:${type}`,
        data: {
          target: (e.target as HTMLElement)?.tagName,
          x: pe.clientX,
          y: pe.clientY,
        },
      });
    };
    const pd = logEvt("pointerdown");
    const pu = logEvt("pointerup");
    const cl = logEvt("click");
    el.addEventListener("pointerdown", pd);
    el.addEventListener("pointerup", pu);
    el.addEventListener("click", cl);
    return () => {
      el.removeEventListener("pointerdown", pd);
      el.removeEventListener("pointerup", pu);
      el.removeEventListener("click", cl);
    };
  }, [onLog]);

  return (
    <div
      ref={wrapperRef}
      className="w-[480px] h-[360px] border border-neutral-200 shadow-sm"
    >
      <RiveComponent className="w-full h-full" />
    </div>
  );
}

export function DemoRivePlayer() {
  const [src, setSrc] = useState(DEFAULT_SRC);
  const [draftSrc, setDraftSrc] = useState(DEFAULT_SRC);
  const [artboard, setArtboard] = useState<string | undefined>(undefined);
  const [stateMachine, setStateMachine] = useState<string | undefined>(
    undefined
  );
  const [meta, setMeta] = useState<Meta>({
    activeArtboard: null,
    allArtboards: [],
    stateMachinesOnActive: [],
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [audioState, setAudioState] = useState<string>("unknown");
  const riveRef = useRef<unknown>(null);

  const pushLog = useCallback((entry: Omit<LogEntry, "ts">) => {
    setLogs((prev) => [...prev.slice(-199), { ...entry, ts: Date.now() }]);
  }, []);

  const handleMeta = useCallback((m: Meta) => setMeta(m), []);
  const handleInstance = useCallback((r: unknown) => {
    riveRef.current = r;
    (window as unknown as { __riveA?: unknown }).__riveA = r;
  }, []);

  // Poll AudioContext state from Rive instance
  useEffect(() => {
    const timer = setInterval(() => {
      const ac = (riveRef.current as unknown as { audioContext?: AudioContext })
        ?.audioContext;
      setAudioState(ac ? ac.state : "none");
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const handleLoadUrl = () => {
    setArtboard(undefined);
    setStateMachine(undefined);
    setMeta({
      activeArtboard: null,
      allArtboards: [],
      stateMachinesOnActive: [],
    });
    setLogs([]);
    setSrc(draftSrc);
  };

  const handleUnlockAudio = async () => {
    try {
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext })
          .AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor) {
        const ac = new Ctor();
        if (ac.state === "suspended") await ac.resume();
        pushLog({
          source: "sys",
          msg: "Throwaway AudioContext",
          data: { state: ac.state },
        });
        ac.close();
      }
      const ac = (riveRef.current as unknown as { audioContext?: AudioContext })
        ?.audioContext;
      if (ac?.state === "suspended") {
        await ac.resume();
        pushLog({
          source: "sys",
          msg: "Rive audioContext resumed",
          data: { state: ac.state },
        });
      }
    } catch (err) {
      pushLog({ source: "sys", msg: "Unlock failed", data: String(err) });
    }
  };

  const handleSynthClick = () => {
    const canvas = document.querySelectorAll("canvas")[0];
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = {
      bubbles: true,
      clientX: x,
      clientY: y,
      pointerType: "mouse",
    };
    canvas.dispatchEvent(new PointerEvent("pointerdown", opts));
    canvas.dispatchEvent(new PointerEvent("pointerup", opts));
    canvas.dispatchEvent(new MouseEvent("click", opts));
    pushLog({
      source: "sys",
      msg: "Synthetic click dispatched",
      data: { x, y },
    });
  };

  // Keyed remount: any change to src/artboard/stateMachine -> fresh Rive init
  const remountKey = `${src}|${artboard ?? ""}|${stateMachine ?? ""}`;

  return (
    <div className="h-screen flex flex-col bg-neutral-50 text-sm">
      {/* Header controls */}
      <div className="border-b bg-white p-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={draftSrc}
          onChange={(e) => setDraftSrc(e.target.value)}
          className="flex-1 min-w-[400px] h-8 px-2 border rounded text-xs font-mono"
        />
        <button
          onClick={handleLoadUrl}
          className="h-8 px-3 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Load
        </button>
        <button
          onClick={handleUnlockAudio}
          className="h-8 px-3 bg-amber-600 text-white rounded hover:bg-amber-700"
        >
          Unlock Audio
        </button>
        <button
          onClick={handleSynthClick}
          className="h-8 px-3 bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          Synth Click (center A)
        </button>
        <button
          onClick={() => setLogs([])}
          className="h-8 px-3 bg-neutral-200 rounded hover:bg-neutral-300"
        >
          Clear log
        </button>
      </div>

      {/* Metadata + config row */}
      <div className="border-b bg-white px-3 py-2 flex flex-wrap gap-4 text-xs">
        <div>
          <label className="font-semibold mr-1">Artboard:</label>
          <select
            value={artboard ?? ""}
            onChange={(e) => setArtboard(e.target.value || undefined)}
            className="h-7 border rounded px-1"
          >
            <option value="">(default)</option>
            {meta.allArtboards.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-semibold mr-1">State Machine:</label>
          <select
            value={stateMachine ?? ""}
            onChange={(e) => setStateMachine(e.target.value || undefined)}
            className="h-7 border rounded px-1"
          >
            <option value="">(none — linear)</option>
            {meta.stateMachinesOnActive.map((sm) => (
              <option key={sm} value={sm}>
                {sm}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="font-semibold mr-1">AudioContext:</span>
          <span
            className={
              audioState === "running"
                ? "text-green-600"
                : audioState === "suspended"
                ? "text-red-600"
                : "text-neutral-500"
            }
          >
            {audioState}
          </span>
        </div>
        <div>
          <span className="font-semibold mr-1">Active artboard:</span>
          <span className="font-mono">{meta.activeArtboard ?? "—"}</span>
        </div>
        <div className="text-neutral-500 text-[11px]">
          Changes remount both players (key:{" "}
          <code>{remountKey.slice(-40)}</code>)
        </div>
      </div>

      {/* Two-pane canvas area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Side A: raw runtime */}
        <div className="flex-1 flex flex-col border-r">
          <div className="bg-neutral-100 px-3 py-1 text-xs font-semibold">
            A — Raw <code>useRive</code> (no wrappers)
          </div>
          <div className="flex-1 flex items-center justify-center p-4 bg-white">
            <RiveRawCanvas
              key={remountKey}
              src={src}
              artboard={artboard}
              stateMachine={stateMachine}
              onLog={pushLog}
              onMeta={handleMeta}
              onInstance={handleInstance}
            />
          </div>
        </div>

        {/* Side B: project RivePlayer */}
        <div className="flex-1 flex flex-col">
          <div className="bg-neutral-100 px-3 py-1 text-xs font-semibold">
            B — Project <code>&lt;RivePlayer&gt;</code> (same component used in
            editor)
          </div>
          <div className="flex-1 flex items-center justify-center p-4 bg-white">
            <div className="w-[480px] h-[360px] border border-neutral-200 shadow-sm">
              <Suspense
                fallback={
                  <div className="w-full h-full flex items-center justify-center">
                    Loading…
                  </div>
                }
              >
                <RivePlayer
                  key={remountKey}
                  src={src}
                  options={{
                    artboard,
                    state_machine: stateMachine,
                    fit: "contain",
                  }}
                  onLoad={() => pushLog({ source: "B", msg: "onLoad" })}
                  onError={() => pushLog({ source: "B", msg: "onError" })}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </div>

      {/* Log panel */}
      <div className="h-[30vh] border-t bg-neutral-900 text-neutral-100 overflow-auto font-mono text-[11px] p-2">
        {logs.length === 0 && (
          <div className="text-neutral-500">No events yet…</div>
        )}
        {logs.map((l, i) => (
          <div key={i} className="whitespace-pre-wrap">
            <span className="text-neutral-500">
              {new Date(l.ts).toISOString().slice(11, 23)}
            </span>{" "}
            <span
              className={
                l.source === "A"
                  ? "text-blue-400"
                  : l.source === "B"
                  ? "text-green-400"
                  : "text-amber-400"
              }
            >
              [{l.source}]
            </span>{" "}
            <span>{l.msg}</span>
            {l.data !== undefined && (
              <span className="text-neutral-400">
                {" "}
                {JSON.stringify(l.data)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DemoRivePlayer;
