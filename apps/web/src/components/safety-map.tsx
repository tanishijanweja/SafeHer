"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createPortal } from "react-dom";

import { divIcon, type LeafletMouseEvent } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

import { cn } from "@safe-her/ui/lib/utils";

import "leaflet/dist/leaflet.css";

const pinIcon = divIcon({
  className: "",
  html: `<div style="filter:drop-shadow(0 2px 4px rgba(225,29,72,.35))">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="#e11d48" stroke="#ffffff" stroke-width="1.75">
      <path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z"/>
      <circle cx="12" cy="10" r="2.5" fill="#ffffff" stroke="none"/>
    </svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

type MapPoint = {
  id?: string;
  lat: number;
  lng: number;
  color?: string;
  /** Renders a coloured circular pin with this emoji instead of a plain marker. */
  emoji?: string;
  /**
   * Renders a distinct teardrop pin with the given icon (SVG glyph). Pick
   * different glyphs + colours for each category so pins stay easy to tell apart.
   */
  glyph?: GlyphKey;
  /** Renders a large pulsing "you are here" pin. */
  live?: boolean;
  popup?: React.ReactNode;
  hover?: React.ReactNode;
};

/** Distinct pin glyphs used to label points on the map. */
export type GlyphKey = "police" | "hospital" | "fire" | "helpline";

/** White inner icon SVG for each glyph (drawn on the teardrop body). */
const GLYPH_ICON: Record<GlyphKey, string> = {
  police: `<path d="M12 3 19.5 5.3v5.65C19.5 14.6 16.4 18.4 12 20 7.6 18.4 4.5 14.6 4.5 10.95V5.3L12 3Z" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.4 9.6h7.2v3.2a3.55 3.55 0 0 1-7.2 0V9.6Z" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>`,
  hospital: `<path d="M8.2 5.5h3.8v2.7a1 1 0 0 0 2 0V5.5h3.8a1 1 0 0 1 1 1v3.8h-2.8a1 1 0 0 0 0 2h2.8v3.8a1 1 0 0 1-1 1h-3.8v-2.7a1 1 0 0 0-2 0v2.7H8.2a1 1 0 0 1-1-1v-3.8h2.8a1 1 0 0 0 0-2H7.2V6.5a1 1 0 0 1 1-1Z" fill="#fff"/>`,
  fire: `<path d="M12 3.5c.6 1.6 2.3 2.7 2.3 5.1a3.2 3.2 0 0 1-6.4-.4C8 10 6.6 11 6.6 13.2a6 6 0 0 0 12 0C18.6 8.4 14.6 6.6 12 3.5Z" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.3 14.2a3 3 0 0 0 1.9 2.1" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>`,
  helpline: `<rect x="7.2" y="3.2" width="7.6" height="17.6" rx="2.2" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M10.3 16.6h1.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`,
};

/** Teardrop pin colour per glyph (fallback when a point has no `color`). */
export const GLYPH_COLOR: Record<GlyphKey, string> = {
  police: "#2563eb",
  hospital: "#16a34a",
  fire: "#dc2626",
  helpline: "#7c3aed",
};

export function glyphPinHtml(glyph: GlyphKey, color = GLYPH_COLOR[glyph]): string {
  return `<svg width="38" height="44" viewBox="0 0 38 44" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 43s-15-11.4-15-24a15 15 0 1 1 30 0c0 12.6-15 24-15 24Z"
          fill="${color}" stroke="#fff" stroke-width="1.6"/>
    <circle cx="19" cy="18.2" r="9.6" fill="#fff" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>
    <g transform="translate(10.6 9.8) scale(0.7)">
      ${GLYPH_ICON[glyph]}
    </g>
  </svg>`;
}

export type MapPolygon = {
  id: string;
  positions: [number, number][];
  color: string;
  hover?: React.ReactNode;
};

type SafetyMapProps = {
  center: { lat: number; lng: number };
  points?: MapPoint[];
  polygons?: MapPolygon[];
  height?: number | string;
  className?: string;
  zoom?: number;
  darkTiles?: boolean;
  interactive?: boolean;
  zoomControl?: boolean;
  /** Floating glass risk legend over the map */
  showLegend?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
};

type HoverCardState = {
  id: string;
  node: React.ReactNode;
  lat: number;
  lng: number;
  closing?: boolean;
};

const HOVER_CLOSE_DELAY_MS = 150;
const HOVER_OPEN_DELAY_MS = 250;
const HOVER_FADE_MS = 120;
const HOVER_CARD_WIDTH = 360;
const HOVER_CARD_MARGIN = 10;

function useIsCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}

function MapChrome({
  onMapClick,
  onBackgroundClick,
}: {
  onMapClick?: (lat: number, lng: number) => void;
  onBackgroundClick: () => void;
}) {
  useMapEvents({
    click(e) {
      onBackgroundClick();
      onMapClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function CenterController({
  center,
  zoom,
}: {
  center: { lat: number; lng: number };
  zoom: number;
}) {
  const map = useMap();
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true;
      return;
    }
    const c = map.getCenter();
    if (Math.abs(center.lat - c.lat) > 0.008 || Math.abs(center.lng - c.lng) > 0.008) {
      map.setView([center.lat, center.lng], zoom, { animate: true });
    }
  }, [map, center.lat, center.lng, zoom]);
  return null;
}

function ActivePopupOpener({
  activeId,
  markerRefs,
}: {
  activeId: string | null;
  markerRefs: React.MutableRefObject<
    Map<string, { openPopup: () => void; closePopup: () => void }>
  >;
}) {
  const map = useMap();
  useEffect(() => {
    if (!activeId) {
      for (const m of markerRefs.current.values()) {
        try {
          m.closePopup();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    const marker = markerRefs.current.get(activeId);
    if (!marker) return;
    const t = window.setTimeout(() => {
      try {
        marker.openPopup();
      } catch {
        /* ignore */
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [activeId, map, markerRefs]);
  return null;
}

function PointMarker({
  point,
  id,
  isActive,
  isCoarse,
  onActivate,
  onDeactivate,
  onHover,
  onHoverEnd,
  registerMarker,
}: {
  point: MapPoint;
  id: string;
  isActive: boolean;
  isCoarse: boolean;
  onActivate: (id: string) => void;
  onDeactivate: () => void;
  onHover: (id: string, node: React.ReactNode, lat: number, lng: number) => void;
  onHoverEnd: () => void;
  registerMarker: (
    id: string,
    marker: { openPopup: () => void; closePopup: () => void } | null,
  ) => void;
}) {
  const setRef = useCallback(
    (instance: { openPopup: () => void; closePopup: () => void } | null) => {
      registerMarker(id, instance);
    },
    [id, registerMarker],
  );

  const openDetails = useCallback(
    (e?: LeafletMouseEvent) => {
      e?.originalEvent?.stopPropagation?.();
      onActivate(id);
    },
    [id, onActivate],
  );

  const hasHover = point.hover != null && !isCoarse;

  const eventHandlers = useMemo(
    () => ({
      click: (e: LeafletMouseEvent) => openDetails(e),
      mouseover: (e: LeafletMouseEvent) => {
        if (hasHover) {
          e.originalEvent?.stopPropagation?.();
          onHover(id, point.hover, point.lat, point.lng);
        }
      },
      mouseout: (e: LeafletMouseEvent) => {
        if (hasHover) {
          e.originalEvent?.stopPropagation?.();
          onHoverEnd();
        }
      },
    }),
    [openDetails, hasHover, onHover, onHoverEnd, id, point.hover, point.lat, point.lng],
  );

  const detailPopup = point.popup ? (
    <Popup
      className="safeher-map-popup"
      maxWidth={280}
      minWidth={210}
      autoPan
      autoPanPadding={[48, 48]}
      keepInView
      closeButton
      autoClose
      closeOnClick={false}
      closeOnEscapeKey
      eventHandlers={{
        remove: () => {
          if (isActive) onDeactivate();
        },
      }}
    >
      {point.popup}
    </Popup>
  ) : null;

  if (point.glyph) {
    const glyphIcon = divIcon({
      className: "safeher-glyph-marker",
      html: `<div style="filter:drop-shadow(0 3px 6px rgba(0,0,0,.35));width:38px;height:44px;position:relative;">${glyphPinHtml(
        point.glyph,
        point.color ?? GLYPH_COLOR[point.glyph],
      )}</div>`,
      iconSize: [38, 44],
      iconAnchor: [19, 43],
      popupAnchor: [0, -24],
    });
    return (
      <Marker
        ref={setRef as never}
        position={[point.lat, point.lng]}
        icon={glyphIcon}
        eventHandlers={eventHandlers}
        zIndexOffset={500}
      >
        {detailPopup}
      </Marker>
    );
  }

  if (point.emoji || point.live) {
    const isLive = point.live === true;
    const size = isLive ? 30 : 36;
    const color = point.color ?? "#ffffff";
    const emoji = point.emoji ?? "📍";
    const emojiIcon = divIcon({
      className: "",
      html: isLive
        ? `<div style="font-size:30px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));">${emoji}</div>`
        : `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${color};box-shadow:0 4px 14px rgba(0,0,0,.35);border:3px solid #fff;font-size:${isLive ? 20 : 18}px;line-height:1;transform:${isLive ? "scale(1.05)" : "none"};">${emoji}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
    return (
      <Marker
        ref={setRef as never}
        position={[point.lat, point.lng]}
        icon={emojiIcon}
        eventHandlers={eventHandlers}
        zIndexOffset={isLive ? 1000 : 500}
      >
        {detailPopup}
      </Marker>
    );
  }

  if (point.color) {
    return (
      <CircleMarker
        ref={setRef as never}
        center={[point.lat, point.lng]}
        radius={isActive ? 11 : 8}
        pathOptions={{
          color: "#ffffff",
          fillColor: point.color,
          fillOpacity: isActive ? 1 : 0.92,
          weight: isActive ? 3 : 2.5,
          opacity: 1,
        }}
        eventHandlers={eventHandlers}
      >
        {detailPopup}
      </CircleMarker>
    );
  }

  return (
    <Marker
      ref={setRef as never}
      position={[point.lat, point.lng]}
      icon={pinIcon}
      eventHandlers={eventHandlers}
    >
      {detailPopup}
    </Marker>
  );
}

function AreaPolygon({
  region,
  isHovered,
  onHover,
  onLeave,
}: {
  region: MapPolygon;
  isHovered: boolean;
  onHover: (id: string) => void;
  onLeave: () => void;
}) {
  const eventHandlers = useMemo(
    () => ({
      mouseover: () => onHover(region.id),
      mouseout: () => onLeave(),
    }),
    [region.id, onHover, onLeave],
  );

  return (
    <Polygon
      positions={region.positions}
      pathOptions={{
        color: region.color,
        fillColor: region.color,
        fillOpacity: isHovered ? 0.48 : 0.32,
        weight: isHovered ? 2.5 : 1.25,
        opacity: isHovered ? 0.95 : 0.72,
        lineJoin: "round",
        lineCap: "round",
      }}
      eventHandlers={eventHandlers}
    />
  );
}

function FloatingLegend() {
  const items = [
    { color: "#059669", label: "Low" },
    { color: "#d97706", label: "Medium" },
    { color: "#e11d48", label: "High" },
  ];
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[1000]">
      <div className="rounded-xl bg-white/92 px-3 py-2.5 shadow-lg shadow-black/10 ring-1 ring-black/5 backdrop-blur-md">
        <div className="mb-1.5 text-[9px] font-semibold tracking-[0.14em] text-zinc-500 uppercase">
          Risk
        </div>
        <div className="flex items-center gap-3">
          {items.map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-700"
            >
              <span
                className="size-2.5 rounded-full shadow-sm ring-2 ring-white"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders the rich hover card in a fixed-position portal (never clipped by the
 * map/container). Re-anchors on the marker and clamps to the viewport edges so
 * it is always fully visible.
 */
function HoverCardPortal({
  hover,
  onMouseEnter,
  onMouseLeave,
}: {
  hover: HoverCardState;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const map = useMap();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);

  // React's synthetic onMouseEnter/onMouseLeave are unreliable for portal
  // content, so we detect card entry/exit from the native (bubbling)
  // mouseover/mouseout events instead. The relatedTarget containment check
  // ignores moves between the card's own children.
  const handleOver = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const related = e.relatedTarget as Node | null;
      if (related && e.currentTarget.contains(related)) return;
      onMouseEnter();
    },
    [onMouseEnter],
  );

  const handleOut = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const related = e.relatedTarget as Node | null;
      if (related && e.currentTarget.contains(related)) return;
      onMouseLeave();
    },
    [onMouseLeave],
  );

  const updatePosition = useCallback(() => {
    const el = cardRef.current;
    if (!el || typeof window === "undefined") return;
    const mapEl = map.getContainer();
    const pt = map.latLngToContainerPoint([hover.lat, hover.lng]);
    const rect = mapEl.getBoundingClientRect();
    const cardW = Math.min(
      HOVER_CARD_WIDTH,
      window.innerWidth - HOVER_CARD_MARGIN * 2,
    );
    const cardH = el.offsetHeight || 240;
    const vx = rect.left + pt.x;
    const vy = rect.top + pt.y;
    const m = HOVER_CARD_MARGIN;

    let x = vx - cardW / 2;
    if (x < m) x = m;
    else if (x + cardW > window.innerWidth - m) x = window.innerWidth - cardW - m;

    // Prefer above the marker; flip below when there's no room above.
    let y = vy - 18 - cardH;
    if (y < m) y = vy + 14;
    if (y + cardH > window.innerHeight - m) y = Math.max(m, window.innerHeight - cardH - m);

    setPos({ x, y });
    setReady(true);
  }, [map, hover.lat, hover.lng]);

  useEffect(() => {
    updatePosition();
    map.on("move", updatePosition);
    map.on("zoomstart", updatePosition);
    map.on("zoom", updatePosition);
    map.on("resize", updatePosition);

    const onWindow = () => updatePosition();
    window.addEventListener("resize", onWindow);
    window.addEventListener("scroll", onWindow, true);
    return () => {
      map.off("move", updatePosition);
      map.off("zoomstart", updatePosition);
      map.off("zoom", updatePosition);
      map.off("resize", updatePosition);
      window.removeEventListener("resize", onWindow);
      window.removeEventListener("scroll", onWindow, true);
    };
  }, [map, updatePosition]);

  if (typeof document === "undefined" || typeof window === "undefined") return null;

  return createPortal(
    <div
      ref={cardRef}
      onMouseOver={handleOver}
      onMouseOut={handleOut}
      className={cn(
        "safeher-hover-card",
        hover.closing && "safeher-hover-card--closing",
      )}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 4000,
        visibility: ready ? "visible" : "hidden",
        width: Math.min(HOVER_CARD_WIDTH, window.innerWidth - HOVER_CARD_MARGIN * 2),
        maxWidth: "calc(100vw - 16px)",
      }}
    >
      <div key={hover.id}>{hover.node}</div>
    </div>,
    document.body,
  );
}

export default function SafetyMap({
  center,
  points = [],
  polygons = [],
  height = 320,
  className,
  zoom = 12,
  darkTiles = false,
  interactive = true,
  zoomControl = true,
  showLegend = false,
  onMapClick,
}: SafetyMapProps) {
  const isCoarse = useIsCoarsePointer();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredPoly, setHoveredPoly] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverCardState | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverRef = useRef<HoverCardState | null>(null);
  hoverRef.current = hover;
  // Delays opening the hover card so it only pops after a deliberate dwell on
  // the exact dot/pin, not on a quick pass-over. Cancelled if the cursor leaves
  // the source before the delay elapses.
  const hoverOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHoverRef = useRef<HoverCardState | null>(null);
  // Track where the cursor currently is so the card only closes once it has
  // left BOTH the hover source (marker/polygon) and the card itself. Refs keep
  // the check synchronous, so a leave that lands directly on the other target
  // is always caught and never closes the card.
  const inSourceRef = useRef(false);
  const inCardRef = useRef(false);
  const markerRefs = useRef<Map<string, { openPopup: () => void; closePopup: () => void }>>(
    new Map(),
  );

  const registerMarker = useCallback(
    (id: string, marker: { openPopup: () => void; closePopup: () => void } | null) => {
      if (marker) markerRefs.current.set(id, marker);
      else markerRefs.current.delete(id);
    },
    [],
  );

  const cancelHoverOpen = useCallback(() => {
    if (hoverOpenTimer.current) {
      clearTimeout(hoverOpenTimer.current);
      hoverOpenTimer.current = null;
    }
    pendingHoverRef.current = null;
  }, []);

  const activate = useCallback(
    (id: string) => {
      cancelHoverOpen();
      setActiveId(id);
    },
    [cancelHoverOpen],
  );
  const deactivate = useCallback(() => setActiveId(null), []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setHover((s) => (s && s.closing ? { ...s, closing: false } : s));
  }, []);

  // Two-stage close: nothing visually changes during the delay window, so brief
  // leaves that get cancelled (moving from marker to card, or tiny pointer wobble)
  // never cause a flicker. Only after the delay elapses do we fade out.
  const triggerClose = useCallback(() => {
    // Still hovering the marker, polygon, or card: do nothing.
    if (inSourceRef.current || inCardRef.current) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setHover((s) => (s ? { ...s, closing: true } : s));
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null;
        setHover(null);
      }, HOVER_FADE_MS);
    }, HOVER_CLOSE_DELAY_MS);
  }, []);

  const handleSourceLeave = useCallback(() => {
    cancelHoverOpen();
    inSourceRef.current = false;
    triggerClose();
  }, [cancelHoverOpen, triggerClose]);

  const handleCardEnter = useCallback(() => {
    inCardRef.current = true;
    cancelClose();
  }, [cancelClose]);

  const handleCardLeave = useCallback(() => {
    inCardRef.current = false;
    triggerClose();
  }, [triggerClose]);

  const requestHover = useCallback(
    (id: string, node: React.ReactNode, lat: number, lng: number) => {
      inSourceRef.current = true;
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      // Don't pop instantly on mouse-over: wait for a deliberate dwell on the
      // exact dot/pin first. Leaving the source cancels the pending open.
      cancelHoverOpen();
      pendingHoverRef.current = { id, node, lat, lng };
      hoverOpenTimer.current = setTimeout(() => {
        hoverOpenTimer.current = null;
        const pending = pendingHoverRef.current;
        pendingHoverRef.current = null;
        if (!pending) return;
        setHover((prev) => {
          // Already showing this marker and not closing: skip redundant updates
          // so React doesn't churn re-renders while the cursor sits on the pin.
          if (prev && prev.id === pending.id && !prev.closing) return prev;
          return pending;
        });
      }, HOVER_OPEN_DELAY_MS);
    },
    [cancelHoverOpen],
  );

  const onPolyHover = useCallback((id: string) => {
    setHoveredPoly(id);
    const region = polygons.find((p) => p.id === id);
    if (!region?.hover || isCoarse) return;
    let lat = 0;
    let lng = 0;
    for (const [a, b] of region.positions) {
      lat += a;
      lng += b;
    }
    lat /= region.positions.length;
    lng /= region.positions.length;
    requestHover(id, region.hover, lat, lng);
  }, [polygons, isCoarse, requestHover]);

  const onPolyLeave = useCallback(() => {
    setHoveredPoly(null);
    handleSourceLeave();
  }, [handleSourceLeave]);

  const tileUrl = darkTiles
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  const attribution =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

  return (
    <div
      className={cn("relative isolate overflow-hidden bg-zinc-100", className)}
      style={{ height, borderRadius: className ? undefined : 12 }}
    >
      <style>{`
        .safeher-hover-card {
          transform-origin: bottom center;
          animation: safeher-card-in 130ms cubic-bezier(0.16, 1, 0.3, 1);
          will-change: transform, opacity;
        }
        .safeher-hover-card--closing {
          opacity: 0;
          transform: scale(0.97);
          transition: opacity 110ms ease, transform 110ms ease;
          pointer-events: none;
        }
        @keyframes safeher-card-in {
          from {
            opacity: 0;
            transform: scale(0.98) translateY(4px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .safeher-hover-scroll::-webkit-scrollbar,
        .safeher-hover-news-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .safeher-hover-scroll::-webkit-scrollbar-thumb,
        .safeher-hover-news-scroll::-webkit-scrollbar-thumb {
          background: rgba(113, 113, 122, 0.35);
          border-radius: 9999px;
        }
        .safeher-hover-scroll::-webkit-scrollbar-track,
        .safeher-hover-news-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .safeher-map-popup .leaflet-popup-content-wrapper {
          background: rgba(255,255,255,0.98);
          border-radius: 14px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.04);
          border: none;
          padding: 0;
        }
        .safeher-map-popup .leaflet-popup-content {
          margin: 14px 16px;
        }
        .safeher-map-popup .leaflet-popup-tip {
          background: #fff;
          box-shadow: none;
        }
        .safeher-map-popup a.leaflet-popup-close-button {
          top: 8px;
          right: 10px;
          font-size: 18px;
          color: #a1a1aa;
          width: 24px;
          height: 24px;
          padding: 0;
          line-height: 22px;
        }
        .safeher-map-popup a.leaflet-popup-close-button:hover {
          color: #18181b;
        }
        .leaflet-container {
          font-family: inherit;
          background: #f4f4f5;
        }
        .leaflet-control-zoom {
          border: none !important;
          border-radius: 12px !important;
          overflow: hidden;
          box-shadow: 0 4px 16px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.04) !important;
          margin: 12px 12px 0 0 !important;
        }
        .leaflet-control-zoom a {
          width: 34px !important;
          height: 34px !important;
          line-height: 34px !important;
          font-size: 16px !important;
          color: #3f3f46 !important;
          background: rgba(255,255,255,0.95) !important;
          border: none !important;
          border-bottom: 1px solid rgba(0,0,0,0.06) !important;
        }
        .leaflet-control-zoom a:last-child {
          border-bottom: none !important;
        }
        .leaflet-control-zoom a:hover {
          background: #fafafa !important;
          color: #18181b !important;
        }
        .leaflet-control-attribution {
          background: rgba(255,255,255,0.72) !important;
          backdrop-filter: blur(6px);
          color: #a1a1aa !important;
          font-size: 9px !important;
          padding: 2px 6px !important;
          border-radius: 6px 0 0 0 !important;
          margin: 0 !important;
          max-width: 55%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .leaflet-control-attribution a {
          color: #71717a !important;
        }
        .leaflet-interactive {
          outline: none;
        }
      `}</style>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        zoomControl={zoomControl}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer attribution={attribution} url={tileUrl} />
        <CenterController center={center} zoom={zoom} />
        <MapChrome onMapClick={onMapClick} onBackgroundClick={deactivate} />
        <ActivePopupOpener activeId={activeId} markerRefs={markerRefs} />

        {polygons.map((poly) => (
          <AreaPolygon
            key={poly.id}
            region={poly}
            isHovered={hoveredPoly === poly.id}
            onHover={onPolyHover}
            onLeave={onPolyLeave}
          />
        ))}

        {points.map((point, i) => {
          const id = point.id ?? `${point.lat.toFixed(5)}:${point.lng.toFixed(5)}:${i}`;
          return (
            <PointMarker
              key={id}
              id={id}
              point={point}
              isActive={activeId === id}
              isCoarse={isCoarse}
              onActivate={activate}
              onDeactivate={deactivate}
              onHover={requestHover}
              onHoverEnd={handleSourceLeave}
              registerMarker={registerMarker}
            />
          );
        })}

        {hover ? (
          <HoverCardPortal
            hover={hover}
            onMouseEnter={handleCardEnter}
            onMouseLeave={handleCardLeave}
          />
        ) : null}
      </MapContainer>
      {showLegend && (polygons.length > 0 || points.length > 0) ? <FloatingLegend /> : null}
    </div>
  );
}
