"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { divIcon, type LeafletMouseEvent } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  Tooltip,
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
  popup?: React.ReactNode;
  hover?: React.ReactNode;
};

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
  registerMarker,
}: {
  point: MapPoint;
  id: string;
  isActive: boolean;
  isCoarse: boolean;
  onActivate: (id: string) => void;
  onDeactivate: () => void;
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

  const eventHandlers = useMemo(
    () => ({
      click: (e: LeafletMouseEvent) => openDetails(e),
    }),
    [openDetails],
  );

  const richHover = typeof point.hover !== "string" && point.hover != null;
  const hoverTip =
    point.hover && !isCoarse ? (
      <Tooltip
        direction="top"
        offset={[0, richHover ? -10 : -8]}
        opacity={1}
        sticky={false}
        className={richHover ? "safeher-area-tooltip" : "safeher-map-hover"}
        permanent={false}
      >
        {point.hover}
      </Tooltip>
    ) : null;

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
        {!isActive ? hoverTip : null}
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
      {!isActive ? hoverTip : null}
      {detailPopup}
    </Marker>
  );
}

function AreaPolygon({
  region,
  isCoarse,
  isHovered,
  onHover,
  onLeave,
}: {
  region: MapPolygon;
  isCoarse: boolean;
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
    >
      {region.hover && !isCoarse ? (
        <Tooltip
          sticky
          direction="top"
          opacity={1}
          className="safeher-area-tooltip"
          permanent={false}
        >
          {region.hover}
        </Tooltip>
      ) : null}
    </Polygon>
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

  const activate = useCallback((id: string) => setActiveId(id), []);
  const deactivate = useCallback(() => setActiveId(null), []);
  const onPolyHover = useCallback((id: string) => setHoveredPoly(id), []);
  const onPolyLeave = useCallback(() => setHoveredPoly(null), []);

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
        .safeher-map-hover {
          background: rgba(24, 24, 27, 0.92) !important;
          color: #fff !important;
          border: none !important;
          border-radius: 10px !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.22) !important;
          padding: 7px 11px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          white-space: nowrap !important;
          line-height: 1.3 !important;
          backdrop-filter: blur(8px);
        }
        .safeher-map-hover::before {
          border-top-color: rgba(24, 24, 27, 0.92) !important;
        }
        .leaflet-tooltip-top.safeher-map-hover::before {
          border-top-color: rgba(24, 24, 27, 0.92) !important;
        }
        .safeher-area-tooltip {
          background: rgba(255,255,255,0.97) !important;
          color: #18181b !important;
          border: none !important;
          border-radius: 14px !important;
          box-shadow: 0 12px 40px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.04) !important;
          padding: 12px 14px !important;
          font-size: 12.5px !important;
          font-weight: 400 !important;
          line-height: 1.4 !important;
          white-space: normal !important;
          max-width: 260px !important;
          backdrop-filter: blur(12px);
        }
        .safeher-area-tooltip::before {
          display: none !important;
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
        <MapChrome onMapClick={onMapClick} onBackgroundClick={deactivate} />
        <ActivePopupOpener activeId={activeId} markerRefs={markerRefs} />

        {polygons.map((poly) => (
          <AreaPolygon
            key={poly.id}
            region={poly}
            isCoarse={isCoarse}
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
              registerMarker={registerMarker}
            />
          );
        })}
      </MapContainer>
      {showLegend && (polygons.length > 0 || points.length > 0) ? <FloatingLegend /> : null}
    </div>
  );
}
