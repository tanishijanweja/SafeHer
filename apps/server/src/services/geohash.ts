import ngeohash from "ngeohash";

const GEOHASH_PRECISION = 6;

export function generateGeohash(latitude: number, longitude: number): string {
  return ngeohash.encode(latitude, longitude, GEOHASH_PRECISION);
}
