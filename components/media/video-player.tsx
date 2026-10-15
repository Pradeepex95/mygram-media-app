"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

type VideoPlayerProps = {
  src: string;
  poster?: string | null;
  className?: string;
};

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const clock = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

export function VideoPlayer({ src, poster, className }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [clockSrc, setClockSrc] = useState(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;

  if (clockSrc !== src) {
    setClockSrc(src);
    setCurrent(0);
    setDuration(0);
  }

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6 && video.error == null) {
          void video.play().then(() => setPlaying(true)).catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError") return;
            if (video.error && video.error.code >= 3) setFailedSrc(src);
          });
        } else {
          video.pause();
          setPlaying(false);
        }
      },
      { threshold: [0, 0.6, 1] },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [src]);

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().then(() => setPlaying(true)).catch(() => undefined);
      return;
    }
    video.pause();
    setPlaying(false);
  }

  function seekTo(next: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(duration) || duration <= 0) return;
    const time = Math.min(Math.max(0, next), duration);
    video.currentTime = time;
    setCurrent(time);
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden bg-black", className)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {failed ? (
        <div className="flex h-full min-h-40 items-center justify-center px-6 text-center text-sm text-zinc-300">
          This video can’t be played. Upload it again.
        </div>
      ) : (
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        className="h-full w-full object-contain"
        playsInline
        loop
        muted={muted}
        preload="metadata"
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        onClick={toggleMute}
        onLoadedMetadata={(event) => {
          const next = event.currentTarget.duration;
          setDuration(Number.isFinite(next) ? next : 0);
          setCurrent(event.currentTarget.currentTime || 0);
        }}
        onTimeUpdate={(event) => {
          if (scrubbing.current) return;
          setCurrent(event.currentTarget.currentTime || 0);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          const code = videoRef.current?.error?.code ?? 0;
          if (code >= 3) setFailedSrc(src);
        }}
      />
      )}
      {!failed && (
      <div className="absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-full bg-zinc-950/90 px-2 py-1.5 text-white shadow-lg">
        <button
          type="button"
          className="rounded-full p-1.5 hover:bg-white/10"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          className="rounded-full p-1.5 hover:bg-white/10"
          onClick={toggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <span className="w-10 shrink-0 text-center text-[11px] tabular-nums">{formatClock(current)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(current, duration || 0)}
          disabled={!duration}
          aria-label="Video position"
          className="h-1 min-w-0 flex-1 cursor-pointer accent-sky-400 disabled:cursor-default"
          onPointerDown={(event) => {
            scrubbing.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onChange={(event) => seekTo(Number(event.target.value))}
          onPointerUp={() => {
            scrubbing.current = false;
          }}
          onPointerCancel={() => {
            scrubbing.current = false;
          }}
        />
        <span className="w-10 shrink-0 text-center text-[11px] tabular-nums">{formatClock(duration)}</span>
      </div>
      )}
      {muted && !failed && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
          Tap to unmute
        </div>
      )}
    </div>
  );
}
