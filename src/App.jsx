import React, { useState, useEffect, useRef } from 'react';
import { Navigation, Users, Bell, Clock, Map as MapIcon } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';

// Leaflet & Routing CSS/JS
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

// Fix for default Leaflet icons in Vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// --- COMPONENT: ROAD-SNAPPING ROUTE ---
function RoutingEngine({ start, end }) {
  const map = useMap();
  const routingControlRef = useRef(null);

  useEffect(() => {
    if (!map || !start) return;

    // Clear previous route if it exists
    if (routingControlRef.current) {
      map.removeControl(routingControlRef.current);
    }

    routingControlRef.current = L.Routing.control({
      waypoints: [L.latLng(start.lat, start.lng), L.latLng(end[0], end[1])],
      lineOptions: { styles: [{ color: '#4f46e5', weight: 6, opacity: 0.8 }] },
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: false,
      show: false, // Hides the instruction panel
      createMarker: () => null // Hide extra routing markers
    }).addTo(map);

    return () => {
      if (routingControlRef.current) map.removeControl(routingControlRef.current);
    };
  }, [map, start, end]);

  return null;
}

// --- COMPONENT: AUTO-CENTER MAP ---
function MapFollower({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo([position.lat, position.lng], map.getZoom(), { animate: true, duration: 1.5 });
    }
  }, [position, map]);
  return null;
}

export default function BusBuddy() {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [busPos, setBusPos] = useState({ lat: 5.6037, lng: -0.1870 });
  const myStop = [5.6060, -0.1850]; // Static destination for now
  const watchId = useRef(null);

  // GPS Broadcaster Logic
  useEffect(() => {
    if (isBroadcasting && "geolocation" in navigator) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => setBusPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => alert("Please enable GPS to notify friends."),
        { enableHighAccuracy: true }
      );
    } else {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
    }
    return () => { if (watchId.current) navigator.geolocation.clearWatch(watchId.current); };
  }, [isBroadcasting]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Navbar */}
      <nav className="bg-white border-b px-6 py-4 sticky top-0 z-[1001] flex justify-between items-center">
        <div className="flex items-center gap-2 text-indigo-600">
          <Navigation className="w-8 h-8 fill-current" />
          <span className="text-2xl font-black tracking-tighter text-slate-900">BusBuddy</span>
        </div>
        <button 
          onClick={() => setIsBroadcasting(!isBroadcasting)}
          className={`px-6 py-2 rounded-full font-bold text-sm shadow-lg transition-all ${
            isBroadcasting ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {isBroadcasting ? '🔴 Broadcasting Live' : 'Boarded Bus? Notify Friends'}
        </button>
      </nav>

      <main className="max-w-4xl mx-auto w-full p-4 space-y-6">
        {/* Map View */}
        <div className="bg-white rounded-3xl shadow-xl border-4 border-white overflow-hidden relative">
          <div className="h-[450px] z-0">
            <MapContainer center={[busPos.lat, busPos.lng]} zoom={15} style={{ height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              
              <RoutingEngine start={busPos} end={myStop} />
              <MapFollower position={busPos} />

              <Marker position={[busPos.lat, busPos.lng]}>
                <Popup><b>The Bus</b><br/>Heading your way!</Popup>
              </Marker>

              <Marker position={myStop} icon={L.divIcon({
                className: 'custom-stop',
                html: `<div class="w-4 h-4 bg-green-500 rounded-full border-4 border-white shadow-lg"></div>`
              })}>
                <Popup><b>Your Stop</b></Popup>
              </Marker>
            </MapContainer>
          </div>
          
          {/* Status Overlay */}
          <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-lg z-[1000] flex justify-around border border-white">
            <div className="text-center">
              <p className="text-[10px] uppercase font-bold text-slate-400">Status</p>
              <p className="font-bold text-indigo-600">{isBroadcasting ? 'Moving' : 'Idle'}</p>
            </div>
            <div className="text-center border-x border-slate-200 px-8">
              <p className="text-[10px] uppercase font-bold text-slate-400">ETA</p>
              <p className="font-bold text-slate-800">~12 Mins</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase font-bold text-slate-400">Distance</p>
              <p className="font-bold text-slate-800">2.4 km</p>
            </div>
          </div>
        </div>

        {/* Friends List */}
        <div className="bg-white rounded-3xl shadow-sm border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">Friends Waiting</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {['Sarah', 'John', 'Mike'].map((name, i) => (
              <div key={i} className="flex-shrink-0 flex flex-col items-center gap-1">
                <div className="w-14 h-14 rounded-full bg-slate-100 border-2 border-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                  {name[0]}
                </div>
                <span className="text-xs font-semibold text-slate-500">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}