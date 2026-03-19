import { useEffect, useRef, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useTheme } from "@/lib/theme";
import type { RouteLeg } from "@shared/schema";

// Fix leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const TRANSPORT_COLORS: Record<string, string> = {
  train: "#2563eb",
  bus: "#16a34a",
  ferry: "#ea580c",
  cruise: "#7c3aed",
};

function MapController({ legs, selectedLeg }: { legs: RouteLeg[]; selectedLeg: number | null }) {
  const map = useMap();

  useEffect(() => {
    if (selectedLeg !== null) {
      const leg = legs.find(l => l.id === selectedLeg);
      if (leg) {
        const bounds = L.latLngBounds(
          [leg.fromLat, leg.fromLng],
          [leg.toLat, leg.toLng]
        );
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 8 });
      }
    } else if (legs.length > 0) {
      const allPoints = legs.flatMap(l => [
        [l.fromLat, l.fromLng] as [number, number],
        [l.toLat, l.toLng] as [number, number],
      ]);
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [selectedLeg, legs, map]);

  return null;
}

interface RouteMapProps {
  legs: RouteLeg[];
  selectedLeg: number | null;
  onLegSelect: (legId: number | null) => void;
}

export default function RouteMap({ legs, selectedLeg, onLegSelect }: RouteMapProps) {
  const mapRef = useRef<any>(null);
  const { isDark } = useTheme();

  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  // Build unique cities
  const cities = useMemo(() => {
    const seen = new Set<string>();
    const result: { lat: number; lng: number; city: string; country: string }[] = [];
    for (const leg of legs) {
      const fromKey = `${leg.fromLat},${leg.fromLng}`;
      if (!seen.has(fromKey)) {
        seen.add(fromKey);
        result.push({ lat: leg.fromLat, lng: leg.fromLng, city: leg.fromCity, country: leg.fromCountry });
      }
      const toKey = `${leg.toLat},${leg.toLng}`;
      if (!seen.has(toKey)) {
        seen.add(toKey);
        result.push({ lat: leg.toLat, lng: leg.toLng, city: leg.toCity, country: leg.toCountry });
      }
    }
    return result;
  }, [legs]);

  return (
    <div className="w-full h-full overflow-hidden" data-testid="route-map">
      <MapContainer
        ref={mapRef}
        center={[25, 30]}
        zoom={2}
        className="w-full h-full"
        style={{ minHeight: "400px" }}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          key={isDark ? "dark" : "light"}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={tileUrl}
        />
        <MapController legs={legs} selectedLeg={selectedLeg} />

        {/* Polylines for each leg */}
        {legs.map(leg => {
          const isSelected = selectedLeg === leg.id;
          const color = TRANSPORT_COLORS[leg.transportType] || "#6b7280";
          return (
            <Polyline
              key={leg.id}
              positions={[
                [leg.fromLat, leg.fromLng],
                [leg.toLat, leg.toLng],
              ]}
              pathOptions={{
                color: isSelected ? "#FF0066" : color,
                weight: isSelected ? 5 : 3,
                opacity: isSelected ? 1 : selectedLeg !== null ? 0.35 : 0.8,
                dashArray: leg.confidence === "unverified" ? "8 6" : undefined,
              }}
              eventHandlers={{
                click: () => onLegSelect(leg.id),
              }}
            />
          );
        })}

        {/* City markers */}
        {cities.map((city, i) => (
          <CircleMarker
            key={`${city.lat}-${city.lng}-${i}`}
            center={[city.lat, city.lng]}
            radius={4}
            pathOptions={{
              fillColor: "#FF0066",
              fillOpacity: 0.9,
              color: "#fff",
              weight: 1.5,
            }}
          >
            <Popup>
              <div className="text-sm font-medium">
                {city.city}
                <span className="text-muted-foreground ml-1">{city.country}</span>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
