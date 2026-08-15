/**
 * Encoded-polyline decoder (Google/OSRM algorithm).
 *
 * The backend ships each network edge's road shape as a precision-6 encoded
 * polyline — roughly ten times smaller than sending raw coordinate arrays, and
 * small enough to keep every route's real road geometry in one artefact. Twenty
 * lines here saves pulling in a dependency for it.
 */
export function decodePolyline(encoded, precision = 6) {
  if (typeof encoded !== "string" || encoded.length === 0) return [];

  const factor = 10 ** precision;
  const points = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let result = 1;
    let shift = 0;
    let byte;

    // latitude delta
    do {
      byte = encoded.charCodeAt(index++) - 63 - 1;
      result += byte << shift;
      shift += 5;
    } while (byte >= 0x1f && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 1;
    shift = 0;

    // longitude delta
    do {
      byte = encoded.charCodeAt(index++) - 63 - 1;
      result += byte << shift;
      shift += 5;
    } while (byte >= 0x1f && index < encoded.length);
    lon += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / factor, lon / factor]);
  }

  return points;
}

/**
 * Road-following positions for one planned leg.
 *
 * `shapes` is present when both ends are trained-network locations and the road
 * geometry has been precomputed; otherwise we fall back to a straight line
 * through any corridor via-points, which is honest about what we know.
 */
export function legPositions(leg) {
  if (Array.isArray(leg?.shapes) && leg.shapes.length > 0) {
    const positions = [];
    leg.shapes.forEach((shape) => {
      // A hop without a precomputed road shape falls back to its endpoints, so
      // the line stays continuous instead of skipping that segment entirely.
      const decoded = shape.polyline
        ? decodePolyline(shape.polyline)
        : [[shape.from_lat, shape.from_lon], [shape.to_lat, shape.to_lon]].filter(
            ([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon)
          );
      // Consecutive hops repeat the shared node — drop the duplicate.
      const slice = positions.length > 0 ? decoded.slice(1) : decoded;
      positions.push(...slice);
    });
    if (positions.length > 1) return positions;
  }

  const via = (leg?.via || []).map((point) => [point.lat, point.lon]);
  return [[leg.from_lat, leg.from_lon], ...via, [leg.to_lat, leg.to_lon]];
}
