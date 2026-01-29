import React, { useState, useEffect, useRef } from 'react';
import { Navigation, Map as MapIcon, Signal, SignalLow } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { createClient } from '@supabase/supabase-js';

// Leaflet & Routing CSS/JS
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

// --- SUPABASE CONFIG ---
// 1. Go to Supabase > Project Settings > API to get these
const SUPABASE_URL = 'https://nayxwgymijcqhgebsnrv.supabase.co'; 
const SUPABASE_KEY = 'your-anon-public-key'; // REPLACE WITH YOUR ACTUAL PUBLIC ANON KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Fix for default Leaflet icons in Vite/Vercel
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
  iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// --- COMPONENT: ROAD-SNAPPING ROUTE WITH OPENROUTESERVICE ---
function RoutingEngine({ start, end, onRouteUpdate, shouldCalculate }) {
  const map = useMap();
  const routingControlRef = useRef(null);

  useEffect(() => {
    if (!map || !start || !end || !shouldCalculate) {
      if (routingControlRef.current) {
        map.removeControl(routingControlRef.current);
        routingControlRef.current = null;
      }
      return;
    }

    if (routingControlRef.current) map.removeControl(routingControlRef.current);

    // Using OpenRouteService (free tier available, no API key needed for demo)
    // For production, sign up at https://openrouteservice.org and add your API key
    routingControlRef.current = L.Routing.control({
      router: L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1'
      }),
      waypoints: [L.latLng(start.lat, start.lng), L.latLng(end[0], end[1])],
      lineOptions: { styles: [{ color: '#4f46e5', weight: 6, opacity: 0.8 }] },
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: false,
      show: false,
      createMarker: () => null 
    }).addTo(map);

    routingControlRef.current.on('routesfound', (e) => {
      if (e.routes && e.routes.length > 0) {
        const route = e.routes[0];
        onRouteUpdate({ distance: route.summary.totalDistance, time: route.summary.totalTime });
      }
    });

    return () => { if (routingControlRef.current) map.removeControl(routingControlRef.current); };
  }, [map, start, end, shouldCalculate]);

  return null;
}

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
  const [userMode, setUserMode] = useState(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [busPos, setBusPos] = useState({ lat: 5.6037, lng: -0.1870 });
  const [passengerPos, setPassengerPos] = useState(null);
  const [routeData, setRouteData] = useState({ distance: 0, time: 0 });
  const [busStatus, setBusStatus] = useState('idle');
  const [isConnected, setIsConnected] = useState(false);

  const myStop = [5.6060, -0.1850]; 
  const watchId = useRef(null);
  const passengerWatchId = useRef(null);
  const lastBusPosRef = useRef(null);
  const channelRef = useRef(null);

  // --- PASSENGER: LISTEN TO CLOUD UPDATES ---
  useEffect(() => {
    if (userMode === 'passenger') {
      console.log('🚗 Passenger mode: Setting up real-time subscription...');
      
      const channel = supabase
        .channel('bus-live')
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'bus_locations' },
          (payload) => {
            console.log('📍 Received update from Supabase:', payload);
            
            if (payload.new.id === 'bus-001') {
              console.log('✅ Bus location updated:', payload.new);
              setBusPos({ lat: payload.new.lat, lng: payload.new.lng });
              setBusStatus(payload.new.status || 'idle');
              setIsConnected(true);
            }
          }
        )
        .subscribe((status) => {
          console.log('🔗 Subscription status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('✅ Successfully subscribed to bus updates');
          }
        });

      channelRef.current = channel;

      return () => {
        console.log('🚫 Unsubscribing from bus updates');
        supabase.removeChannel(channel);
      };
    }
  }, [userMode]);

  // --- DRIVER: PUSH TO CLOUD ---
  const broadcastToCloud = async (pos, status) => {
    try {
      console.log('📤 Broadcasting to cloud:', { id: 'bus-001', lat: pos.lat, lng: pos.lng, status });
      
      const { data, error } = await supabase.from('bus_locations').upsert({
        id: 'bus-001',
        lat: pos.lat,
        lng: pos.lng,
        status: status,
        updated_at: new Date().toISOString()
      });

      if (error) {
        console.error('❌ Broadcast error:', error);
        setIsConnected(false);
      } else {
        console.log('✅ Broadcast successful:', data);
        setIsConnected(true);
      }
    } catch (err) {
      console.error('❌ Broadcast exception:', err);
      setIsConnected(false);
    }
  };

  // --- DRIVER: WATCH POSITION & BROADCAST ---
  useEffect(() => {
    if (isBroadcasting && "geolocation" in navigator) {
      console.log('🚍 Driver mode: Starting GPS broadcast...');
      
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          let currentStatus = 'moving';

          if (lastBusPosRef.current) {
            const dist = Math.sqrt(
              Math.pow(newPos.lat - lastBusPosRef.current.lat, 2) + 
              Math.pow(newPos.lng - lastBusPosRef.current.lng, 2)
            );
            if (dist < 0.00005) currentStatus = 'stopped';
          }
          
          console.log('📍 New position:', newPos, 'Status:', currentStatus);
          setBusPos(newPos);
          setBusStatus(currentStatus);
          broadcastToCloud(newPos, currentStatus);
          lastBusPosRef.current = newPos;
        },
        (err) => {
          console.error('❌ GPS Error:', err);
          alert("Please enable GPS: " + err.message);
          setIsBroadcasting(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      if (watchId.current) {
        console.log('🛑 Stopping GPS broadcast');
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      setIsConnected(false);
    }

    return () => {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [isBroadcasting]);

  // --- PASSENGER: WATCH OWN POSITION ---
  useEffect(() => {
    if (userMode === 'passenger' && "geolocation" in navigator) {
      console.log('👤 Passenger: Getting location...');
      
      passengerWatchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          console.log('👤 Passenger position:', newPos);
          setPassengerPos(newPos);
        },
        (err) => {
          console.error('❌ Passenger GPS Error:', err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    return () => {
      if (passengerWatchId.current) {
        navigator.geolocation.clearWatch(passengerWatchId.current);
        passengerWatchId.current = null;
      }
    };
  }, [userMode]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <nav className="bg-white border-b px-6 py-4 sticky top-0 z-[1001] flex justify-between items-center">
        <div className="flex items-center gap-2 text-indigo-600">
          <Navigation className="w-8 h-8 fill-current" />
          <span className="text-2xl font-black tracking-tighter text-slate-900">BusBuddy</span>
        </div>
        
        <div className="flex items-center gap-3">
          {userMode === 'driver' && (
            <button 
              onClick={() => setIsBroadcasting(!isBroadcasting)} 
              className={`px-6 py-2 rounded-full font-bold text-sm shadow-lg transition-all ${
                isBroadcasting 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isBroadcasting ? '🔴 Live' : 'Start Broadcast'}
            </button>
          )}
          {userMode && (
            <button 
              onClick={() => {
                setUserMode(null);
                setIsBroadcasting(false);
              }} 
              className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            >
              <MapIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        {!userMode && (
          <div className="flex gap-2">
            <button 
              onClick={() => setUserMode('driver')} 
              className="px-4 py-2 rounded-full font-bold text-sm bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Driver
            </button>
            <button 
              onClick={() => setUserMode('passenger')} 
              className="px-4 py-2 rounded-full font-bold text-sm bg-green-600 text-white hover:bg-green-700"
            >
              Passenger
            </button>
          </div>
        )}
      </nav>

      <main className="max-w-4xl mx-auto w-full p-4 space-y-6">
        <div className="bg-white rounded-3xl shadow-xl border-4 border-white overflow-hidden relative">
          <div className="h-[450px] z-0">
            <MapContainer center={[5.6037, -0.1870]} zoom={15} style={{ height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <RoutingEngine 
                start={busPos} 
                end={userMode === 'passenger' && passengerPos ? [passengerPos.lat, passengerPos.lng] : myStop} 
                onRouteUpdate={setRouteData} 
                shouldCalculate={!!busPos && (userMode === 'passenger' ? !!passengerPos : true)} 
              />
              <MapFollower position={userMode === 'passenger' ? passengerPos : busPos} />
              
              <Marker position={[busPos.lat, busPos.lng]}>
                <Popup><b>Bus</b><br/>{busStatus}</Popup>
              </Marker>

              {passengerPos && (
                <Marker position={[passengerPos.lat, passengerPos.lng]} icon={L.divIcon({ 
                  className: 'bg-transparent', 
                  html: `<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-md"></div>` 
                })}>
                  <Popup>You</Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
          
          <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-lg z-[1000] flex justify-around border border-white">
            <div className="text-center">
              <p className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-center gap-1">
                {isConnected ? <Signal className="w-3 h-3 text-green-500" /> : <SignalLow className="w-3 h-3 text-slate-300" />}
                Status
              </p>
              <p className={`font-bold ${busStatus === 'moving' ? 'text-green-600' : 'text-orange-600'}`}>
                {busStatus.toUpperCase()}
              </p>
            </div>
            <div className="text-center border-x border-slate-200 px-8">
              <p className="text-[10px] uppercase font-bold text-slate-400">ETA</p>
              <p className="font-bold text-slate-800">{Math.ceil(routeData.time / 60)} Mins</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase font-bold text-slate-400">Distance</p>
              <p className="font-bold text-slate-800">{(routeData.distance / 1000).toFixed(1)} km</p>
            </div>
          </div>
        </div>

        {/* Debug Info Panel */}
        <div className="bg-slate-800 text-white rounded-2xl p-4 text-xs font-mono">
          <p className="font-bold mb-2">🔍 Debug Info:</p>
          <p>Mode: {userMode || 'Not selected'}</p>
          <p>Broadcasting: {isBroadcasting ? 'Yes' : 'No'}</p>
          <p>Connected: {isConnected ? 'Yes ✅' : 'No ❌'}</p>
          <p>Bus Pos: {busPos.lat.toFixed(4)}, {busPos.lng.toFixed(4)}</p>
          <p>Passenger Pos: {passengerPos ? `${passengerPos.lat.toFixed(4)}, ${passengerPos.lng.toFixed(4)}` : 'Not available'}</p>
          <p className="mt-2 text-yellow-400">⚠️ Check browser console (F12) for detailed logs</p>
        </div>
      </main>
    </div>
  );
}