// Source: Google Maps Platform Code Assist
import React, { useState, useEffect, useMemo } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, MapMouseEvent, InfoWindow } from '@vis.gl/react-google-maps';
import { getStoredCctvCameras } from '../data/cctvData';
import { CctvCamera } from '../types/cctv';
import { 
  MapPin, 
  Camera, 
  Navigation, 
  X, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Compass, 
  LocateFixed,
  Info
} from 'lucide-react';

const API_KEY =
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  process.env.VITE_GOOGLE_MAPS_API_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';

interface IncidentLocationMapProps {
  value: { lat: number; lng: number; address?: string } | null;
  onChange?: (loc: { lat: number; lng: number; address?: string }) => void;
  readOnly?: boolean;
  heightClass?: string;
  showCameraMarkers?: boolean;
  titleLabel?: string;
}

export const IncidentLocationMap: React.FC<IncidentLocationMapProps> = ({
  value,
  onChange,
  readOnly = false,
  heightClass = 'h-72',
  showCameraMarkers = true,
  titleLabel = 'ปักหมุดตำแหน่งจุดเกิดเหตุ / กล้องวงจรปิด CCTV'
}) => {
  // Chaiyaphum Town Hall / Clock Tower default center
  const defaultCenter = { lat: 15.8068, lng: 102.0317 };
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>(value || defaultCenter);
  const [mapZoom, setMapZoom] = useState<number>(value ? 16 : 14);
  const [selectedCam, setSelectedCam] = useState<CctvCamera | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [geoLocating, setGeoLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Load CCTV cameras for location suggestions
  const cameras: CctvCamera[] = useMemo(() => {
    try {
      return getStoredCctvCameras();
    } catch {
      return [];
    }
  }, []);

  // Sync center if value prop changes externally
  useEffect(() => {
    if (value && (value.lat !== mapCenter.lat || value.lng !== mapCenter.lng)) {
      setMapCenter({ lat: value.lat, lng: value.lng });
    }
  }, [value?.lat, value?.lng]);

  // Key missing fallback / splash guide
  if (!API_KEY) {
    return (
      <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-700 shadow-md space-y-3">
        <div className="flex items-center gap-2.5 text-amber-400 font-bold text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>จำเป็นต้องระบุ Google Maps API Key เพื่อแสดงแผนที่แบบโต้ตอบ</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          กรุณาเพิ่มความลับระบบ (Secret) ใน AI Studio เพื่อใช้งานแผนที่ปักหมุดจุดเกิดเหตุ:
        </p>
        <ol className="text-[11px] text-slate-300 space-y-1.5 list-decimal pl-4 font-mono bg-slate-950 p-3 rounded-xl border border-slate-800">
          <li>เปิดเมนู <strong>Settings (⚙️)</strong> บริเวณมุมขวาบน</li>
          <li>เลือกหัวข้อ <strong>Secrets</strong></li>
          <li>พิมพ์ชื่อตัวแปร <code>GOOGLE_MAPS_PLATFORM_KEY</code> แล้วกด Enter</li>
          <li>ใส่ค่า API Key ของคุณ แล้วกด Enter (ระบบจะรีบิลด์และแสดงแผนที่อัตโนมัติ)</li>
        </ol>
      </div>
    );
  }

  // Filter camera presets by query
  const filteredCameras = cameras.filter(cam => {
    if (!(searchQuery || '').trim()) return true;
    const q = (searchQuery || '').toLowerCase();
    return (
      (cam.name || '').toLowerCase().includes(q) ||
      (cam.id || '').toLowerCase().includes(q) ||
      (cam.floor || '').toLowerCase().includes(q) ||
      (cam.building || '').toLowerCase().includes(q)
    );
  });

  const handleMapClick = (e: MapMouseEvent) => {
    if (readOnly || !onChange) return;
    if (e.detail.latLng) {
      const newLoc = {
        lat: Number(e.detail.latLng.lat.toFixed(6)),
        lng: Number(e.detail.latLng.lng.toFixed(6)),
        address: `พิกัดละติจูด ${e.detail.latLng.lat.toFixed(5)}, ลองจิจูด ${e.detail.latLng.lng.toFixed(5)}`
      };
      setMapCenter({ lat: newLoc.lat, lng: newLoc.lng });
      onChange(newLoc);
      setSelectedCam(null);
    }
  };

  const handleSelectCameraPin = (cam: CctvCamera) => {
    if (cam.latitude && cam.longitude) {
      const newLoc = {
        lat: cam.latitude,
        lng: cam.longitude,
        address: `${cam.name} (${cam.id}) - ${cam.floor}`
      };
      setMapCenter({ lat: cam.latitude, lng: cam.longitude });
      setMapZoom(17);
      setSelectedCam(cam);
      if (onChange && !readOnly) {
        onChange(newLoc);
      }
    }
  };

  const handleGetCurrentGPS = () => {
    if (!navigator.geolocation) {
      setGeoError('เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง GPS');
      return;
    }

    setGeoLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLoc = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          address: 'ตำแหน่งปัจจุบันของคุณ (GPS Device)'
        };
        setMapCenter({ lat: newLoc.lat, lng: newLoc.lng });
        setMapZoom(17);
        setGeoLocating(false);
        if (onChange && !readOnly) {
          onChange(newLoc);
        }
      },
      (err) => {
        setGeoLocating(false);
        setGeoError(`ไม่สามารถดึงตำแหน่ง GPS ได้ (${err.message})`);
        setTimeout(() => setGeoError(null), 4000);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleClearPin = () => {
    if (onChange && !readOnly) {
      onChange({ lat: defaultCenter.lat, lng: defaultCenter.lng, address: '' });
      setSelectedCam(null);
    }
  };

  return (
    <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200/90 shadow-xs">
      {/* Title & Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
        <div className="space-y-0.5">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-rose-600 animate-bounce" />
            <span>{titleLabel}</span>
          </label>
          <p className="text-[11px] text-slate-500">
            {readOnly 
              ? 'พิกัดตำแหน่งจุดเกิดเหตุที่ระบุในคำร้อง' 
              : 'คลิกบนแผนที่เพื่อปักหมุด หรือกดเลือกจากตำแหน่งกล้อง CCTV เทศบาลด้านล่าง'}
          </p>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGetCurrentGPS}
              disabled={geoLocating}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
              title="ดึงพิกัดจากตำแหน่งปัจจุบันของคุณ"
            >
              <LocateFixed className={`w-3.5 h-3.5 ${geoLocating ? 'animate-spin text-blue-600' : ''}`} />
              <span>{geoLocating ? 'กำลังดึง GPS...' : 'ตำแหน่งปัจจุบัน (GPS)'}</span>
            </button>

            {value && (
              <button
                type="button"
                onClick={handleClearPin}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-lg transition-colors"
                title="ลบหมุดพิกัด"
              >
                <X className="w-3.5 h-3.5" />
                ล้างหมุด
              </button>
            )}
          </div>
        )}
      </div>

      {geoError && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{geoError}</span>
        </div>
      )}

      {/* CCTV Camera Quick Select Chips Bar */}
      {showCameraMarkers && cameras.length > 0 && !readOnly && (
        <div className="space-y-1.5 bg-white p-2.5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-700 flex items-center gap-1">
              <Camera className="w-3.5 h-3.5 text-indigo-600" />
              <span>เลือกจุดติดตั้งกล้อง CCTV เทศบาลเพื่อปักหมุดด่วน:</span>
            </span>
            <span className="text-slate-400 font-mono text-[10px]">{cameras.length} จุด</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-300">
            {cameras.slice(0, 10).map((cam) => {
              const isSelected = value && value.lat === cam.latitude && value.lng === cam.longitude;
              return (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => handleSelectCameraPin(cam)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all border shrink-0 ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-2xs'
                      : 'bg-slate-50 hover:bg-blue-50 text-slate-700 border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${cam.status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <span>{cam.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* MAP VIEW CONTAINER */}
      <div className={`w-full ${heightClass} rounded-xl overflow-hidden border border-slate-300 relative shadow-inner group`}>
        <APIProvider apiKey={API_KEY} version="weekly">
          <Map
            center={mapCenter}
            zoom={mapZoom}
            mapId="CCTV_INCIDENT_PINNER_MAP"
            onClick={handleMapClick}
            gestureHandling="greedy"
            disableDefaultUI={false}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
          >
            {/* User Pinned Location Marker */}
            {value && (
              <AdvancedMarker position={{ lat: value.lat, lng: value.lng }}>
                <Pin background="#ef4444" glyphColor="#ffffff" borderColor="#991b1b" />
              </AdvancedMarker>
            )}

            {/* Display CCTV Camera Markers */}
            {showCameraMarkers && cameras.map((cam) => {
              if (!cam.latitude || !cam.longitude) return null;
              const isPinned = value && value.lat === cam.latitude && value.lng === cam.longitude;
              if (isPinned) return null; // Don't duplicate if user pinned this exact cam

              return (
                <AdvancedMarker
                  key={cam.id}
                  position={{ lat: cam.latitude, lng: cam.longitude }}
                  onClick={() => handleSelectCameraPin(cam)}
                  title={`${cam.name} (${cam.status})`}
                >
                  <Pin 
                    background={cam.status === 'online' ? '#3b82f6' : '#f59e0b'} 
                    glyphColor="#ffffff" 
                    borderColor="#1e3a8a" 
                  />
                </AdvancedMarker>
              );
            })}

            {/* InfoWindow for selected camera */}
            {selectedCam && selectedCam.latitude && selectedCam.longitude && (
              <InfoWindow
                position={{ lat: selectedCam.latitude, lng: selectedCam.longitude }}
                onCloseClick={() => setSelectedCam(null)}
              >
                <div className="p-1 max-w-[200px] text-xs space-y-1 font-sans">
                  <span className="font-extrabold text-slate-900 block border-b pb-1">{selectedCam.name}</span>
                  <p className="text-[10px] text-slate-600">รหัส: {selectedCam.id}</p>
                  <p className="text-[10px] text-slate-600">ตำแหน่ง: {selectedCam.floor}</p>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    selectedCam.status === 'online' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {selectedCam.status === 'online' ? '🟢 ปกติ' : '🔴 ชำรุด/ขัดข้อง'}
                  </span>
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>

        {/* Map Overlay Badge */}
        <div className="absolute top-2.5 left-2.5 bg-slate-900/85 backdrop-blur-md text-white px-3 py-1.5 rounded-xl text-[11px] font-bold shadow-md border border-white/20 pointer-events-none flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          <span>{readOnly ? 'หมุดสถานที่เกิดเหตุ' : 'คลิกบนแผนที่เพื่อเลือกตำแหน่งหมุด'}</span>
        </div>

        {/* Current Coordinates Bar at Bottom */}
        {value ? (
          <div className="absolute bottom-2.5 left-2.5 right-2.5 bg-white/95 backdrop-blur-md p-2 rounded-xl shadow-lg border border-slate-200/90 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 truncate">
              <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 font-bold">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="truncate space-y-0.5">
                <span className="font-extrabold text-slate-900 block text-[11px] truncate">
                  {value.address || 'จุดที่ปักหมุดไว้'}
                </span>
                <span className="text-[10px] font-mono text-slate-500 block">
                  Lat: {value.lat.toFixed(5)}, Lng: {value.lng.toFixed(5)}
                </span>
              </div>
            </div>

            {!readOnly && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md shrink-0 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                บันทึกพิกัดแล้ว
              </span>
            )}
          </div>
        ) : (
          <div className="absolute bottom-2.5 left-2.5 right-2.5 bg-slate-900/80 backdrop-blur-md text-slate-200 p-2 rounded-xl text-[11px] text-center border border-slate-700">
            💡 ยังไม่ได้เลือกพิกัด — กรุณาคลิกบนแผนที่เพื่อปักหมุดสถานที่เกิดเหตุ
          </div>
        )}
      </div>
    </div>
  );
};
