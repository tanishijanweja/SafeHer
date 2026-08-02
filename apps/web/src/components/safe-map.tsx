"use client";

import * as React from "react";
import "leaflet/dist/leaflet.css";

import { riskColor } from "@/lib/geo";
import type { GeoPoint } from "@/lib/types";

import "./map.css";

/**
 * SafeMap — an interactive map of the Delhi region.
 *
 * Map library note: the shared plan standardised on Mapbox, but SafeHer renders
 * with **OpenStreetMap** tiles via Leaflet (no API key required). Every screen
 * in the app renders only this interface, so the tile provider / renderer can
 * be swapped (e.g. to MapboxGL or CARTO tiles) without touching any page.
 *
 * Layers are rebuilt when `markers` / `heat` / `selectedPoint` change; a click
 * while `selectable` reports back a lat/lng through `onSelectPoint`.
 */

export interface SafeMarker {
  id: string;
  lat: number;
  lng: number;
  kind: "police" | "hospital" | "report" | "sos" | "pin";
  color?: string;
  label?: string;
  severity?: number;
}

export interface SafeHeatCell {
  lat: number;
  lng: number;
  score: number;
}

interface SafeMapProps {
  markers?: SafeMarker[];
  heat?: SafeHeatCell[];
  selectedPoint?: GeoPoint | null;
  onSelectPoint?: (p: GeoPoint) => void;
  selectable?: boolean;
  interactive?: boolean;
  center?: GeoPoint;
  initialZoom?: number;
  className?: string;
}

const DELHI_CENTER: [number, number] = [28.63, 77.216];
const DELHI_ZOOM = 12;

export function SafeMap({
  markers = [],
  heat = [],
  selectedPoint = null,
  onSelectPoint,
  selectable = false,
  interactive = true,
  center,
  initialZoom = DELHI_ZOOM,
  className,
}: SafeMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<import("leaflet").Map | null>(null);
  const LRef = React.useRef<typeof import("leaflet") | null>(null);
  const groupRef = React.useRef<import("leaflet").LayerGroup | null>(null);
  const [mapReady, setMapReady] = React.useState(false);

  // Refs keep latest values available to the one-time init effect and handlers.
  const onSelectRef = React.useRef(onSelectPoint);
  onSelectRef.current = onSelectPoint;
  const selectableRef = React.useRef(selectable);
  selectableRef.current = selectable;
  const interactiveRef = React.useRef(interactive);
  interactiveRef.current = interactive;
  const initialZoomRef = React.useRef(initialZoom);
  initialZoomRef.current = initialZoom;
  const centerRef = React.useRef(center);
  centerRef.current = center;

  // Create the Leaflet map once (client-only: Leaflet needs the DOM).
  React.useEffect(() => {
    let disposed = false;
    let map: import("leaflet").Map | null = null;

    (async () => {
      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;
      LRef.current = L;

      const start: [number, number] = centerRef.current
        ? [centerRef.current.lat, centerRef.current.lng]
        : DELHI_CENTER;

      map = L.map(containerRef.current, {
        center: start,
        zoom: initialZoomRef.current,
        zoomControl: false,
        dragging: interactiveRef.current,
        touchZoom: interactiveRef.current,
        scrollWheelZoom: interactiveRef.current,
        doubleClickZoom: interactiveRef.current,
        boxZoom: interactiveRef.current,
        keyboard: interactiveRef.current,
      });
      mapRef.current = map;
      map.getContainer().classList.add("safeher-map-root");
      map.getContainer().style.cursor = selectableRef.current ? "crosshair" : "";

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        className: "safeher-osm-tiles",
      }).addTo(map);

      groupRef.current = L.layerGroup().addTo(map);

      map.on("click", (e) => {
        if (selectableRef.current) {
          onSelectRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
        }
      });

      window.setTimeout(() => map?.invalidateSize(), 0);
      setMapReady(true);
    })();

    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
      LRef.current = null;
      groupRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Recentre when a center prop is provided (e.g. after geolocation).
  React.useEffect(() => {
    if (!mapReady || !center) return;
    const map = mapRef.current;
    if (!map) return;
    map.setView([center.lat, center.lng], Math.max(map.getZoom(), 14), {
      animate: true,
    });
  }, [mapReady, center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild the marker / heat layers whenever their data changes.
  React.useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = groupRef.current;
    if (!mapReady || !L || !map || !group) return;

    group.clearLayers();

    for (const cell of heat) {
      const color = riskColor(cell.score);
      L.circleMarker([cell.lat, cell.lng], {
        radius: 14 + cell.score * 5,
        color: "transparent",
        weight: 0,
        fillColor: color,
        fillOpacity: 0.3,
      }).addTo(group);
      L.circleMarker([cell.lat, cell.lng], {
        radius: 4 + cell.score,
        color: "transparent",
        weight: 0,
        fillColor: color,
        fillOpacity: 0.85,
      }).addTo(group);
    }

    for (const m of markers) {
      if (m.kind === "police" || m.kind === "hospital") {
        const isPolice = m.kind === "police";
        const color = m.color ?? (isPolice ? "#38bdf8" : "#ff4d6d");
        const icon = L.divIcon({
          className: "safeher-divicon",
          html: `<span class="safeher-cat-marker" style="--mcolor:${color}">${isPolice ? "P" : "H"}</span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        const marker = L.marker([m.lat, m.lng], { icon }).addTo(group);
        if (m.label) {
          marker.bindTooltip(m.label, { className: "safeher-tip", direction: "top", offset: [0, -10] });
        }
      } else if (m.kind === "sos") {
        const icon = L.divIcon({
          className: "safeher-divicon",
          html: `<span class="safeher-sos-marker"></span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker([m.lat, m.lng], { icon, zIndexOffset: 1000 }).addTo(group);
      } else if (m.kind === "pin") {
        const icon = L.divIcon({
          className: "safeher-divicon",
          html: `<span class="safeher-pin-marker" style="--pcolor:${m.color ?? "#f472b6"}"></span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 26],
        });
        L.marker([m.lat, m.lng], { icon, zIndexOffset: 900 }).addTo(group);
      } else {
        const color = m.color ?? riskColor(m.severity ?? 3);
        const marker = L.circleMarker([m.lat, m.lng], {
          radius: (m.severity ?? 3) + 4,
          color: "#0a0710",
          weight: 2,
          fillColor: color,
          fillOpacity: 0.9,
        }).addTo(group);
        if (m.label) {
          marker.bindTooltip(m.label, { className: "safeher-tip", direction: "top", offset: [0, -10] });
        }
      }
    }

    if (selectedPoint) {
      const icon = L.divIcon({
        className: "safeher-divicon",
        html: `<span class="safeher-pin-marker" style="--pcolor:#f472b6"></span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 26],
      });
      L.marker([selectedPoint.lat, selectedPoint.lng], { icon, zIndexOffset: 900 }).addTo(group);
    }
  }, [mapReady, markers, heat, selectedPoint]);

  const zoomIn = () => mapRef.current?.zoomIn();
  const zoomOut = () => mapRef.current?.zoomOut();

  const resetView = () => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo(
      centerRef.current
        ? [centerRef.current.lat, centerRef.current.lng]
        : DELHI_CENTER,
      Math.max(map.getZoom(), 13),
    );
  };

  const locateMe = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      const map = mapRef.current;
      if (map) {
        map.setView([latitude, longitude], Math.max(map.getZoom(), 15), { animate: true });
      }
      if (selectableRef.current) {
        onSelectRef.current?.({ lat: latitude, lng: longitude });
      }
    });
  };

  return (
    <div className={`relative h-full w-full overflow-hidden ${className ?? ""}`}>
      <div ref={containerRef} className="safeher-map-root h-full w-full" />

      {interactive ? (
        <div className="absolute right-2 top-2 z-[1000] flex flex-col gap-1.5">
          <MapButton label="Zoom in" onClick={zoomIn}>
            +
          </MapButton>
          <MapButton label="Zoom out" onClick={zoomOut}>
            −
          </MapButton>
          <MapButton label="Reset view" onClick={resetView}>
            ⌂
          </MapButton>
          <MapButton label="My location" onClick={locateMe}>
            ◉
          </MapButton>
        </div>
      ) : null}

      {selectable ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-[1000] flex justify-center">
          <span className="rounded-full border border-pink-400/30 bg-black/70 px-3 py-1 text-[10px] uppercase tracking-widest text-pink-200 backdrop-blur">
            Tap the map to pin a location
          </span>
        </div>
      ) : null}
    </div>
  );
}

function MapButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-pink-400/30 bg-black/70 text-sm text-pink-200 backdrop-blur transition hover:border-pink-400/70 hover:bg-pink-500/20 active:scale-95"
    >
      {children}
    </button>
  );
}
