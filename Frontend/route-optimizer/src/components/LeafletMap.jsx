import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine";

const LeafletMap = ({ route }) => {
  const mapRef = useRef(null);

  useEffect(() => {
    if (!route || route.length < 2) return;

    const center = [
      (route[0].lat + route[route.length - 1].lat) / 2,
      (route[0].lon + route[route.length - 1].lon) / 2,
    ];

    if (mapRef.current) {
      mapRef.current.remove();
    }

    const map = L.map("map").setView(center, 6);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    const waypoints = route.map((pt) => L.latLng(pt.lat, pt.lon));

    L.Routing.control({
      waypoints,
      show: false,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      showAlternatives: false,
      lineOptions: {
        styles: [{ color: "#5fa760", weight: 5 }],
      },
      createMarker: (i, wp) => {
  let iconUrl;

  if (i === 0) {
    iconUrl = "https://maps.google.com/mapfiles/ms/icons/green-dot.png"; // Start
  } else if (i === route.length - 1) {
    iconUrl = "https://maps.google.com/mapfiles/ms/icons/red-dot.png"; // End
  } else {
    iconUrl = "https://maps.google.com/mapfiles/ms/icons/blue-dot.png"; // Mid stops
  }

  const icon = L.icon({
    iconUrl,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  });

  return L.marker(wp.latLng, { icon }).bindPopup(
    `<strong>${i === 0 ? "Start" : i === route.length - 1 ? "End" : "Stop"}</strong><br/>${route[i].depot}`
  );
}
,
    }).addTo(map);

    // Remove the instruction panel
    setTimeout(() => {
      const container = document.querySelector(".leaflet-routing-container");
      if (container) container.style.display = "none";
    }, 300);
  }, [route]);

  return <div id="map" className="h-full w-full border-xl shadow-xl z-0" />;
};

export default LeafletMap;
