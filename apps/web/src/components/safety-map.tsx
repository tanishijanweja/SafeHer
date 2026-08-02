"use client";

import { divIcon } from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMapEvents } from "react-leaflet";

import "leaflet/dist/leaflet.css";

const pinIcon = divIcon({
  className: "",
  html: '<svg width="24" height="24" viewBox="0 0 24 24" fill="#ef4444" stroke="#ffffff" stroke-width="2"><path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5" fill="#ffffff" stroke="none"/></svg>',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

type MapPoint = {
  lat: number;
  lng: number;
  color?: string;
  popup?: React.ReactNode;
};

type SafetyMapProps = {
  center: { lat: number; lng: number };
  points: MapPoint[];
  height?: number;
  onMapClick?: (lat: number, lng: number) => void;
};

function MapClickHandler({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function SafetyMap({
  center,
  points,
  height = 320,
  onMapClick,
}: SafetyMapProps) {
  return (
    <div style={{ height }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        scrollWheelZoom
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onMapClick={onMapClick} />
        {points.map((point, i) =>
          point.color ? (
            <CircleMarker
              key={i}
              center={[point.lat, point.lng]}
              radius={10}
              pathOptions={{ color: point.color, fillColor: point.color, fillOpacity: 0.7 }}
            >
              {point.popup ? <Popup>{point.popup}</Popup> : null}
            </CircleMarker>
          ) : (
            <Marker key={i} position={[point.lat, point.lng]} icon={pinIcon}>
              {point.popup ? <Popup>{point.popup}</Popup> : null}
            </Marker>
          ),
        )}
      </MapContainer>
    </div>
  );
}
