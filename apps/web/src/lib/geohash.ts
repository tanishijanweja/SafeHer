import geohash from "ngeohash";

export function computeGeohash(latitude: number, longitude: number): string {
  return geohash.encode(latitude, longitude, 6);
}