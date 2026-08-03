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

import "leaflet/dist/leaflet.css";

const pinIcon = divIcon({
  className: "",
  html: '<svg width="24" height="24" viewBox="0 0 24 24" fill="#ef4444" stroke="#ffffff" stroke-width="2"><path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5" fill="#ffffff" stroke="none"/></svg>',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
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
  /** Hover-only tooltip content */
  hover?: React.ReactNode;
};

type SafetyMapProps = {
  center: { lat: number; lng: number };
  points?: MapPoint[];
  polygons?: MapPolygon[];
  height?: number | string;
  className?: string;
  zoom?: number;
  /** Dark Carto tiles match the home preview; default is OSM. */
  darkTiles?: boolean;
  interactive?: boolean;
  zoomControl?: boolean;
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

  const eventHandlers = useMemo(() => {
    return {
      click: (e: LeafletMouseEvent) => openDetails(e),
    };
  }, [openDetails]);

  const hoverTip =
    point.hover && !isCoarse ? (
      <Tooltip
        direction="top"
        offset={[0, -8]}
        opacity={1}
        sticky={false}
        className="safeher-map-hover"
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
        radius={isActive ? 14 : 11}
        pathOptions={{
          color: point.color,
          fillColor: point.color,
          fillOpacity: isActive ? 0.9 : 0.75,
          weight: isActive ? 3 : 2,
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
        fillOpacity: isHovered ? 0.55 : 0.38,
        weight: isHovered ? 2.5 : 1.5,
        opacity: 0.9,
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
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  const attribution = darkTiles
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  return (
    <div className={className} style={{ height, borderRadius: className ? undefined : 8, overflow: "hidden" }}>
      <style>{`
        .safeher-map-hover {
          background: #111827 !important;
          color: #fff !important;
          border: none !important;
          border-radius: 8px !important;
          box-shadow: 0 6px 16px rgba(0,0,0,0.2) !important;
          padding: 6px 10px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          white-space: nowrap !important;
          line-height: 1.3 !important;
        }
        .safeher-map-hover::before {
          border-top-color: #111827 !important;
        }
        .leaflet-tooltip-top.safeher-map-hover::before {
          border-top-color: #111827 !important;
        }
        .safeher-area-tooltip {
          background: #ffffff !important;
          color: #111827 !important;
          border: 1px solid #e5e7eb !important;
          border-radius: 10px !important;
          box-shadow: 0 10px 28px rgba(0,0,0,0.16) !important;
          padding: 10px 12px !important;
          font-size: 12.5px !important;
          font-weight: 400 !important;
          line-height: 1.4 !important;
          white-space: normal !important;
          max-width: 240px !important;
        }
        .safeher-area-tooltip::before {
          border-top-color: #ffffff !important;
        }
        .leaflet-tooltip-top.safeher-area-tooltip::before {
          border-top-color: #ffffff !important;
        }
        .safeher-map-popup .leaflet-popup-content-wrapper {
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 10px 28px rgba(0,0,0,0.16);
          border: 1px solid #e5e7eb;
          padding: 0;
        }
        .safeher-map-popup .leaflet-popup-content {
          margin: 12px 14px;
        }
        .safeher-map-popup .leaflet-popup-tip {
          background: #fff;
          border: 1px solid #e5e7eb;
          box-shadow: none;
        }
        .safeher-map-popup a.leaflet-popup-close-button {
          top: 6px;
          right: 8px;
          font-size: 18px;
          color: #6b7280;
        }
        .safeher-map-popup a.leaflet-popup-close-button:hover {
          color: #111827;
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
    </div>
  );
}
