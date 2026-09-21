// Source: Google Maps Platform Code Assist
import React, { useState, useEffect, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useAdvancedMarkerRef, useMap } from '@vis.gl/react-google-maps';
import { CctvCamera } from '../types/cctv';
import { CctvMunicipalZoneMap } from './CctvMunicipalZoneMap';
import { Video, ShieldCheck, Eye, Layers, Radio, Copy, Check, Filter, Wrench, Camera, FileText, Edit3, Compass, Info } from 'lucide-react';

declare const google: any;

const API_KEY =
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  process.env.VITE_GOOGLE_MAPS_API_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

// Get camera coverage radius in meters based on type
const getCoverageRadius = (type?: string) => {
  switch (type) {
    case 'ptz': return 80;
    case '360_degree': return 60;
    case 'bullet': return 50;
    case 'dome': return 35;
    default: return 45;
  }
};

const getCameraTypeLabel = (type?: string) => {
  switch (type) {
    case 'ptz': return 'PTZ Speed Dome (80m)';
    case '360_degree': return 'Fisheye 360° (60m)';
    case 'bullet': return 'Bullet Camera (50m)';
    case 'dome': return 'Dome Camera (35m)';
    default: return 'Standard CCTV (45m)';
  }
};

// Component to render Coverage Area Circle on Google Map
const CameraCoverageCircle = ({
  center,
  radius,
  status,
  visible
}: {
  center: { lat: number; lng: number };
  radius: number;
  status: string;
  visible: boolean;
}) => {
  const map = useMap();
  const circleRef = useRef<any>(null);

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'online': return '#10b981'; // emerald
      case 'faulty': return '#f43f5e'; // rose
      case 'maintenance': return '#f59e0b'; // amber
      case 'offline': default: return '#64748b'; // slate
    }
  };

  useEffect(() => {
    if (!map) return;

    if (!visible) {
      if (circleRef.current) {
        circleRef.current.setMap(null);
      }
      return;
    }

    const color = getStatusColor(status);

    if (!circleRef.current) {
      if (typeof google !== 'undefined' && google.maps && google.maps.Circle) {
        circleRef.current = new google.maps.Circle({
          map,
          center,
          radius,
          fillColor: color,
          fillOpacity: 0.18,
          strokeColor: color,
          strokeOpacity: 0.65,
          strokeWeight: 1.5,
          clickable: false,
        });
      }
    } else {
      circleRef.current.setOptions({
        map,
        center,
        radius,
        fillColor: color,
        fillOpacity: 0.18,
        strokeColor: color,
        strokeOpacity: 0.65,
        strokeWeight: 1.5,
      });
    }

    return () => {
      if (circleRef.current) {
        circleRef.current.setMap(null);
      }
    };
  }, [map, center.lat, center.lng, radius, status, visible]);

  return null;
};

// Component to handle auto-bounds fitting
const MapBoundsHandler = ({ cameras }: { cameras: CctvCamera[] }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || cameras.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    let hasValid = false;

    cameras.forEach(c => {
      if (c.latitude && c.longitude) {
        bounds.extend({ lat: c.latitude, lng: c.longitude });
        hasValid = true;
      }
    });

    if (hasValid) {
      map.fitBounds(bounds, { top: 80, bottom: 70, left: 50, right: 50 });
      if (cameras.length === 1) {
        map.setZoom(17);
      }
    }
  }, [map, cameras]);

  return null;
};

interface MarkerWithInfoWindowProps {
  camera: CctvCamera;
  onSelectCamera: (camera: CctvCamera) => void;
  showCoverage: boolean;
  onRequestCctvForCamera?: (camera: CctvCamera) => void;
  onReportRepairForCamera?: (camera: CctvCamera) => void;
  onEditCamera?: (camera: CctvCamera) => void;
}

const MarkerWithInfoWindow = ({
  camera,
  onSelectCamera,
  showCoverage,
  onRequestCctvForCamera,
  onReportRepairForCamera,
  onEditCamera
}: MarkerWithInfoWindowProps) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const lat = camera.latitude || 13.8475;
  const lng = camera.longitude || 100.5691;
  const radius = getCoverageRadius(camera.type);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#10b981'; // emerald-500
      case 'faulty': return '#f43f5e'; // rose-500
      case 'maintenance': return '#f59e0b'; // amber-500
      case 'offline':
      default: return '#64748b'; // slate-500
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'online': return 'ใช้งานได้ปกติ (Online)';
      case 'faulty': return 'ชำรุด/ขัดข้อง (Faulty)';
      case 'maintenance': return 'อยู่ระหว่างซ่อมแซม (Maintenance)';
      case 'offline': return 'ขาดการเชื่อมต่อ (Offline)';
      default: return 'ไม่ทราบสถานะ';
    }
  };

  const handleCopyCoords = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${lat}, ${lng}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Render Coverage Area Circle */}
      <CameraCoverageCircle
        center={{ lat, lng }}
        radius={radius}
        status={camera.status}
        visible={showCoverage}
      />

      <AdvancedMarker 
        ref={markerRef} 
        position={{ lat, lng }} 
        onClick={() => setOpen(true)}
        title={`${camera.id} - ${camera.name}`}
      >
        <Pin 
          background={getStatusColor(camera.status)} 
          glyphColor="#fff" 
          borderColor="rgba(0,0,0,0.25)"
          scale={1.1}
        />
      </AdvancedMarker>

      {open && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)}>
          <div className="p-1 min-w-[260px] max-w-[300px] text-slate-800 font-sans">
            <div className="flex items-start justify-between gap-2 mb-1 border-b border-slate-100 pb-2">
              <div>
                <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block">
                  {camera.id}
                </span>
                <div className="font-extrabold text-sm text-slate-900 mt-1 leading-snug">{camera.name}</div>
              </div>
            </div>
            
            <div className="text-xs space-y-1.5 text-slate-700 mt-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getStatusColor(camera.status) }}></span>
                <span>{getStatusLabel(camera.status)}</span>
              </div>

              <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-[11px] space-y-1">
                <div>🏢 <strong>สถานที่:</strong> {camera.building} ({camera.floor})</div>
                <div>📍 <strong>โซน:</strong> {camera.zone}</div>
                <div>📷 <strong>ประเภท:</strong> {getCameraTypeLabel(camera.type)}</div>
                <div>📡 <strong>รัศมีครอบคลุม:</strong> ~{radius} เมตร</div>
                <div>🌐 <strong>IP:</strong> <span className="font-mono text-blue-900 font-semibold">{camera.ipAddress}</span></div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono bg-white p-1.5 rounded border border-slate-200">
                <span>{lat.toFixed(5)}, {lng.toFixed(5)}</span>
                <button
                  type="button"
                  onClick={handleCopyCoords}
                  className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-0.5 cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอกพิกัด'}</span>
                </button>
              </div>

              {camera.notes && (
                <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                  <strong>หมายเหตุ:</strong> {camera.notes}
                </div>
              )}
            </div>

            {/* Quick Request Filing Actions from Marker */}
            <div className="mt-3 pt-2 border-t border-slate-100 space-y-1.5">
              {onRequestCctvForCamera && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onRequestCctvForCamera(camera);
                  }}
                  className="w-full text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  title="ยื่นคำร้องขอดูภาพหรือขอไฟล์สำเนา CCTV จากจุดติดตั้งนี้"
                >
                  <Camera className="w-3.5 h-3.5 text-blue-100" />
                  <span>📹 ยื่นคำร้องขอดูภาพจากกล้องนี้</span>
                </button>
              )}

              <div className="flex items-center justify-between gap-1.5">
                {onReportRepairForCamera && (camera.status === 'faulty' || camera.status === 'offline') && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onReportRepairForCamera(camera);
                    }}
                    className="flex-1 text-[11px] bg-rose-600 hover:bg-rose-700 text-white font-bold px-2 py-1 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    title="แจ้งซ่อมกล้องนี้เนื่องจากพบการชำรุดหรือขัดข้อง"
                  >
                    <Wrench className="w-3 h-3" />
                    <span>แจ้งซ่อม</span>
                  </button>
                )}

                <button 
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSelectCamera(camera);
                  }}
                  className="flex-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-white font-bold px-2 py-1 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3 h-3 text-blue-300" />
                  <span>ดูสเปกเต็ม</span>
                </button>

                {onEditCamera && (
                  <button 
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onEditCamera(camera);
                    }}
                    className="text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-2.5 py-1 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    title="แก้ไขข้อมูลจุดติดตั้งกล้องนี้"
                  >
                    <Edit3 className="w-3 h-3 text-indigo-200" />
                    <span>แก้ไข</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface CctvGeoMapProps {
  cameras: CctvCamera[];
  onSelectCamera: (camera: CctvCamera) => void;
  onRequestCctvForCamera?: (camera: CctvCamera) => void;
  onReportRepairForCamera?: (camera: CctvCamera) => void;
  onEditCamera?: (camera: CctvCamera) => void;
}

export const CctvGeoMap: React.FC<CctvGeoMapProps> = ({
  cameras,
  onSelectCamera,
  onRequestCctvForCamera,
  onReportRepairForCamera,
  onEditCamera
}) => {
  const [showCoverage, setShowCoverage] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  if (!hasValidKey) {
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-r from-blue-950 to-slate-900 border border-blue-800/60 p-4 rounded-2xl text-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-xl text-blue-400 border border-blue-500/30 shrink-0">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-white flex items-center gap-2">
                <span>กำลังแสดงแผนที่ผังโซนเทศบาล (Municipal Interactive Map)</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                  โหมดเวกเตอร์พร้อมใช้งาน 100%
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                สามารถดูพิกัด โครงข่ายไฟเบอร์ และรัศมีกล้องได้ทันที หรือกำหนด <code>GOOGLE_MAPS_PLATFORM_KEY</code> ในเมนู Settings เพื่อเปิดโหมดดาวเทียม Google Maps
              </p>
            </div>
          </div>
        </div>

        <CctvMunicipalZoneMap
          cameras={cameras}
          onSelectCamera={onSelectCamera}
          onRequestCctvForCamera={onRequestCctvForCamera}
          onReportRepairForCamera={onReportRepairForCamera}
          onEditCamera={onEditCamera}
        />
      </div>
    );
  }

  // Calculate center based on all cameras or default to a central location
  const validCameras = cameras.filter(c => c.latitude && c.longitude);
  
  const displayedCameras = validCameras.filter(c => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'needs_repair') return c.status === 'faulty' || c.status === 'offline';
    return c.status === statusFilter;
  });

  const onlineCount = displayedCameras.filter(c => c.status === 'online').length;
  const totalCoverageSqMeters = displayedCameras.reduce((acc, c) => {
    const r = getCoverageRadius(c.type);
    return acc + Math.PI * r * r;
  }, 0);

  const defaultCenter = validCameras.length > 0 
    ? { 
        lat: validCameras.reduce((sum, c) => sum + (c.latitude || 0), 0) / validCameras.length, 
        lng: validCameras.reduce((sum, c) => sum + (c.longitude || 0), 0) / validCameras.length 
      }
    : { lat: 13.8475, lng: 100.5691 };

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden min-h-[600px] flex flex-col relative">
      {/* Map Header Overlay */}
      <div className="absolute top-0 inset-x-0 p-3.5 bg-slate-950/85 backdrop-blur-md border-b border-slate-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs z-10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30 shrink-0">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <span className="font-bold tracking-wide text-slate-100 block">
                แผนที่ภูมิศาสตร์จุดติดตั้งกล้อง CCTV (Coverage Map)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                แสดงพิกัดและพื้นที่เฝ้าระวัง {displayedCameras.length} จุด
              </span>
            </div>
          </div>

          {/* Map Filters & Coverage Toggle */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${statusFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              ทั้งหมด ({validCameras.length})
            </button>
            <button
              onClick={() => setStatusFilter('online')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${statusFilter === 'online' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-emerald-400'}`}
            >
              🟢 ปกติ
            </button>
            <button
              onClick={() => setStatusFilter('needs_repair')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${statusFilter === 'needs_repair' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-slate-400 hover:text-rose-400'}`}
            >
              🔴 ต้องซ่อมแซม
            </button>

            {/* Coverage Area Toggle */}
            <button
              onClick={() => setShowCoverage(!showCoverage)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                showCoverage 
                  ? 'bg-blue-600/30 text-blue-300 border-blue-500/50 shadow-2xs' 
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="สลับแสดง/ซ่อนรัศมีพื้นที่เฝ้าระวังของกล้อง"
            >
              <Radio className={`w-3.5 h-3.5 ${showCoverage ? 'text-blue-400' : 'text-slate-500'}`} />
              <span>{showCoverage ? 'รัศมีครอบคลุม: เปิด' : 'รัศมีครอบคลุม: ปิด'}</span>
            </button>

            <a
              href="https://earth.google.com/earth/d/16Z10iSFTtUgXwLv5ekTPRBarpH_eR5Bs?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-lg transition-colors font-bold text-xs shadow-2xs border border-blue-400/30"
              title="เปิดดูแผนที่ดาวเทียม 3D ใน Google Earth"
            >
              <span>🌐 Google Earth 3D</span>
            </a>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-700 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span className="text-emerald-300">ปกติ ({displayedCameras.filter(c => c.status === 'online').length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            <span className="text-rose-300">ชำรุด ({displayedCameras.filter(c => c.status === 'faulty').length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            <span className="text-amber-300">ซ่อม ({displayedCameras.filter(c => c.status === 'maintenance').length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />
            <span className="text-slate-400">ออฟไลน์ ({displayedCameras.filter(c => c.status === 'offline').length})</span>
          </div>
        </div>
      </div>

      {/* Main Google Map Container */}
      <div className="flex-1 w-full h-full min-h-[600px]">
        <APIProvider apiKey={API_KEY} version="weekly">
          <Map
            defaultCenter={defaultCenter}
            defaultZoom={15}
            mapId="CCTV_GEO_MAP"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%', minHeight: '600px' }}
            gestureHandling="greedy"
            disableDefaultUI={false}
          >
            <MapBoundsHandler cameras={displayedCameras} />

            {displayedCameras.map(camera => (
              <MarkerWithInfoWindow 
                key={camera.id} 
                camera={camera} 
                onSelectCamera={onSelectCamera} 
                showCoverage={showCoverage}
                onRequestCctvForCamera={onRequestCctvForCamera}
                onReportRepairForCamera={onReportRepairForCamera}
                onEditCamera={onEditCamera}
              />
            ))}
          </Map>
        </APIProvider>
      </div>

      {/* Footer Bottom Coverage Statistics Bar */}
      <div className="p-2.5 bg-slate-950/90 border-t border-slate-800 text-white flex flex-wrap items-center justify-between gap-3 text-xs z-10 px-4">
        <div className="flex items-center gap-4 text-slate-300 text-[11px] font-medium">
          <span>📡 พื้นที่ครอบคลุมการเฝ้าระวังรวม: <strong className="text-blue-400 font-extrabold">{Math.round(totalCoverageSqMeters / 1000)}k ตร.ม.</strong></span>
          <span>🟢 ความพร้อมใช้งานรวม: <strong className="text-emerald-400 font-extrabold">{displayedCameras.length > 0 ? Math.round((onlineCount / displayedCameras.length) * 100) : 0}%</strong></span>
        </div>
        <div className="text-[10px] text-slate-400 font-mono">
          คลิกที่หมุดบนแผนที่เพื่อดูข้อมูลทางเทคนิค พิกัด และเปลี่ยนสถานะกล้อง
        </div>
      </div>
    </div>
  );
};

