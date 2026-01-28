import React, { useState, useEffect, useRef } from 'react';
import { Navigation, Bell, Clock, Map as MapIcon } from 'lucide-react';
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
function RoutingEngine({ start, end, onRouteUpdate, shouldCalculate }) {
  const map = useMap();
  const routingControlRef = useRef(null);

  useEffect(() => {
    if (!map || !start || !shouldCalculate) {
      if (routingControlRef.current) {
        map.removeControl(routingControlRef.current);
        routingControlRef.current = null;
      }
      return;
    }

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

    // Listen for route updates
    routingControlRef.current.on('routesfound', (e) => {
      if (e.routes && e.routes.length > 0) {
        const route = e.routes[0];
        const distance = route.summary.totalDistance; // in meters
        const time = route.summary.totalTime; // in seconds
        onRouteUpdate({ distance, time });
      }
    });

    return () => {
      if (routingControlRef.current) map.removeControl(routingControlRef.current);
    };
  }, [map, start, end, onRouteUpdate, shouldCalculate]);

  return null;
} // <--- THIS WAS THE MISSING BRACE THAT CAUSED THE ERROR

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
  const [userMode, setUserMode] = useState(null); // 'driver' or 'passenger'
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [busPos, setBusPos] = useState({ lat: 5.6037, lng: -0.1870 });
  const [passengerPos, setPassengerPos] = useState(null);
  const [routeData, setRouteData] = useState({ distance: 0, time: 0 });
  const [busStatus, setBusStatus] = useState('idle'); // 'idle', 'moving', or 'stopped'
  const myStop = [5.6060, -0.1850]; // Static destination for now
  const watchId = useRef(null);
  const passengerWatchId = useRef(null);
  const lastBusPosRef = useRef(null);
  const stopTimerRef = useRef(null);

  // GPS Broadcaster Logic
  useEffect(() => {
    if (isBroadcasting && "geolocation" in navigator) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          
          if (lastBusPosRef.current) {
            const distance = Math.sqrt(
              Math.pow(newPos.lat - lastBusPosRef.current.lat, 2) +
              Math.pow(newPos.lng - lastBusPosRef.current.lng, 2)
            );
            
            if (distance > 0.00005) {
              setBusStatus('moving');
              if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
            } else {
              if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
              stopTimerRef.current = setTimeout(() => {
                setBusStatus('stopped');
              }, 5000);
            }
          }
          
          lastBusPosRef.current = newPos;
          setBusPos(newPos);
        },
        (err) => alert("Please enable GPS to notify friends."),
        { enableHighAccuracy: true }
      );
    } else {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      setBusStatus('idle');
    }
    return () => { 
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, [isBroadcasting]);

  // Passenger GPS Tracking Logic
  useEffect(() => {
    if (userMode === 'passenger' && "geolocation" in navigator) {
      passengerWatchId.current = navigator.geolocation.watchPosition(
        (pos) => setPassengerPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => alert("Please enable GPS to track your location."),
        { enableHighAccuracy: true }
      );
    } else {
      if (passengerWatchId.current) navigator.geolocation.clearWatch(passengerWatchId.current);
    }
    return () => { if (passengerWatchId.current) navigator.geolocation.clearWatch(passengerWatchId.current); };
  }, [userMode]);

  const formatDistance = (meters) => (meters / 1000).toFixed(1);
  const formatTime = (seconds) => Math.ceil(seconds / 60);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <nav className="bg-white border-b px-6 py-4 sticky top-0 z-[1001] flex justify-between items-center">
        <div className="flex items-center gap-2 text-indigo-600">
          <Navigation className="w-8 h-8 fill-current" />
          <span className="text-2xl font-black tracking-tighter text-slate-900">BusBuddy</span>
        </div>
        {userMode === 'driver' && (
          <button 
            onClick={() => setIsBroadcasting(!isBroadcasting)}
            className={`px-6 py-2 rounded-full font-bold text-sm shadow-lg transition-all ${
              isBroadcasting ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {isBroadcasting ? '🔴 Broadcasting Live' : 'Start Broadcasting Location'}
          </button>
        )}
        {userMode === 'passenger' && (
          <div className="flex gap-2">
            <button 
              onClick={() => setUserMode(null)}
              className="px-6 py-2 rounded-full font-bold text-sm shadow-lg bg-slate-300 text-slate-700 hover:bg-slate-400"
            >
              Switch Mode
            </button>
          </div>
        )}
        {userMode === null && (
          <div className="flex gap-2">
            <button onClick={() => setUserMode('driver')} className="px-6 py-2 rounded-full font-bold text-sm shadow-lg bg-indigo-600 text-white hover:bg-indigo-700">I'm a Driver</button>
            <button onClick={() => setUserMode('passenger')} className="px-6 py-2 rounded-full font-bold text-sm shadow-lg bg-green-600 text-white hover:bg-green-700">I'm a Passenger</button>
          </div>
        )}
      </nav>

      <main className="max-w-4xl mx-auto w-full p-4 space-y-6">
        <div className="bg-white rounded-3xl shadow-xl border-4 border-white overflow-hidden relative">
          <div className="h-[450px] z-0">
            <MapContainer center={[5.6037, -0.1870]} zoom={15} style={{ height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <RoutingEngine start={busPos} end={myStop} onRouteUpdate={setRouteData} shouldCalculate={userMode === 'driver' && isBroadcasting && userMode === 'passenger' && passengerPos} />
              <MapFollower position={userMode === 'passenger' && passengerPos ? passengerPos : busPos} />
              <Marker position={[busPos.lat, busPos.lng]}>
                <Popup><b>The Bus</b><br/>Heading your way!</Popup>
              </Marker>
              {userMode === 'passenger' && passengerPos && (
                <Marker position={[passengerPos.lat, passengerPos.lng]} icon={L.divIcon({
                  className: 'passenger-marker',
                  html: `<div class="w-4 h-4 bg-blue-500 rounded-full border-4 border-white shadow-lg"></div>`
                })}>
                  <Popup><b>Your Location</b></Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
          
          <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-lg z-[1000] flex justify-around border border-white">
            <div className="text-center">
              <p className="text-[10px] uppercase font-bold text-slate-400">Status</p>
              <p className={`font-bold ${busStatus === 'moving' ? 'text-green-600' : busStatus === 'stopped' ? 'text-orange-600' : 'text-indigo-600'}`}>
                {userMode === 'driver' ? (busStatus === 'moving' ? '🟢 Moving' : busStatus === 'stopped' ? '🟠 Stopped' : 'Idle') : (busStatus === 'moving' ? '🟢 Bus Moving' : busStatus === 'stopped' ? '🟠 Bus Stopped' : 'Bus Idle')}
              </p>
            </div>
            <div className="text-center border-x border-slate-200 px-8">
              <p className="text-[10px] uppercase font-bold text-slate-400">ETA</p>
              {userMode === 'driver' && isBroadcasting && userMode === 'passenger' && passengerPos ? (
                <p className="font-bold text-slate-800">~{formatTime(routeData.time)} Mins</p>
              ) : (
                <p className="font-bold text-slate-500 text-xs">Waiting...</p>
              )}
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase font-bold text-slate-400">Distance</p>
              {userMode === 'driver' && isBroadcasting && userMode === 'passenger' && passengerPos ? (
                <p className="font-bold text-slate-800">{formatDistance(routeData.distance)} km</p>
              ) : (
                <p className="font-bold text-slate-500 text-xs">Waiting...</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}