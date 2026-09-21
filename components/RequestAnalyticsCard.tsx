import React, { useState } from 'react';
import { RequestItem } from '../types/request';
import { REQUEST_CATEGORIES } from '../data/categories';
import { 
  BarChart3, 
  PieChart as PieIcon, 
  Layers, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Filter, 
  Calendar,
  Sparkles,
  TrendingUp,
  Activity
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';

interface RequestAnalyticsCardProps {
  requests: RequestItem[];
  onSelectStatusFilter?: (status: string) => void;
  currentStatusFilter?: string;
}

export const RequestAnalyticsCard: React.FC<RequestAnalyticsCardProps> = ({
  requests,
  onSelectStatusFilter,
  currentStatusFilter = 'all',
}) => {
  const [viewMode, setViewMode] = useState<'visual_charts' | 'status' | 'category' | 'priority'>('visual_charts');
  const [timeRange, setTimeRange] = useState<'current_month' | 'all'>('current_month');

  const now = new Date();
  const currentMonthName = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

  // Filter requests by current month or all time
  const filteredByRangeRequests = requests.filter((r) => {
    if (timeRange === 'all') return true;
    const d = new Date(r.createdAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const rangeTotal = filteredByRangeRequests.length;
  const overallTotal = requests.length;

  // Status Counts for current range
  const submittedCount = filteredByRangeRequests.filter((r) => r.status === 'submitted').length;
  const underReviewCount = filteredByRangeRequests.filter((r) => r.status === 'under_review').length;
  const actionRequiredCount = filteredByRangeRequests.filter((r) => r.status === 'action_required').length;
  const approvedCount = filteredByRangeRequests.filter((r) => r.status === 'approved').length;
  const completedCount = filteredByRangeRequests.filter((r) => r.status === 'completed').length;
  const rejectedCount = filteredByRangeRequests.filter((r) => r.status === 'rejected').length;

  const totalPending = submittedCount + underReviewCount + actionRequiredCount;
  const totalFinished = approvedCount + completedCount;
  const completionPercentage = rangeTotal > 0 ? Math.round((totalFinished / rangeTotal) * 100) : 0;
  const urgentCount = filteredByRangeRequests.filter((r) => r.priority === 'urgent' || r.priority === 'very_urgent' || r.priority === 'immediate').length;

  // --- Recharts Data Preparation ---
  
  // Status Color & Label Definitions
  const statusConfig: Record<string, { labelTh: string; color: string }> = {
    submitted: { labelTh: 'ยื่นคำร้องแล้ว', color: '#3b82f6' }, // blue-500
    under_review: { labelTh: 'อยู่ระหว่างตรวจสอบ', color: '#f59e0b' }, // amber-500
    action_required: { labelTh: 'ขอเอกสารเพิ่มเติม', color: '#a855f7' }, // purple-500
    approved: { labelTh: 'อนุมัติแล้ว', color: '#10b981' }, // emerald-500
    completed: { labelTh: 'ดำเนินการเสร็จสิ้น', color: '#0d9488' }, // teal-600
    rejected: { labelTh: 'ไม่อนุมัติ', color: '#ef4444' }, // rose-500
  };

  // Pie Chart Data: Requests by Status for Current Month / Selected Range
  const pieChartData = Object.keys(statusConfig).map((statusKey) => {
    const count = filteredByRangeRequests.filter((r) => r.status === statusKey).length;
    return {
      name: statusConfig[statusKey].labelTh,
      value: count,
      color: statusConfig[statusKey].color,
      statusKey,
    };
  }).filter((item) => item.value > 0);

  // Bar Chart Data: Requests by Category for Current Month / Selected Range
  const categoryCountMap = new Map<string, number>();
  filteredByRangeRequests.forEach((r) => {
    categoryCountMap.set(r.category, (categoryCountMap.get(r.category) || 0) + 1);
  });

  const categoryBarColors = ['#4f46e5', '#0284c7', '#059669', '#d97706', '#7c3aed', '#ec4899', '#6366f1'];

  const barChartData = REQUEST_CATEGORIES.map((cat, idx) => {
    const count = categoryCountMap.get(cat.id as any) || 0;
    const shortTitle = cat.titleTh.length > 16 ? cat.titleTh.substring(0, 15) + '…' : cat.titleTh;
    return {
      fullName: cat.titleTh,
      name: shortTitle,
      count: count,
      categoryId: cat.id,
      color: categoryBarColors[idx % categoryBarColors.length]
    };
  });

  // Trend Data Aggregation: Request Volume & Camera Repairs Over Time
  const trendDataMap = new Map<string, { dateStr: string; dateVal: Date; total: number; cctvRepair: number }>();
  
  filteredByRangeRequests.forEach((r) => {
    const d = new Date(r.createdAt);
    const dateStr = d.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
    
    if (!trendDataMap.has(dateStr)) {
      trendDataMap.set(dateStr, { 
        dateStr, 
        dateVal: new Date(d.getFullYear(), d.getMonth(), d.getDate()), 
        total: 0, 
        cctvRepair: 0 
      });
    }
    
    const entry = trendDataMap.get(dateStr)!;
    entry.total += 1;
    
    const isCctvRepair = r.category === 'maintenance' && (r.title.includes('กล้องวงจรปิด') || r.title.toLowerCase().includes('cctv'));
    if (isCctvRepair) {
      entry.cctvRepair += 1;
    }
  });

  const trendChartData = Array.from(trendDataMap.values()).sort((a, b) => a.dateVal.getTime() - b.dateVal.getTime());

  // Custom Recharts Tooltips
  const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700 backdrop-blur-xs">
          <p className="font-bold text-indigo-300">{data.fullName}</p>
          <div className="flex items-center gap-2 pt-0.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }}></span>
            <span className="font-semibold text-slate-200">
              จำนวน: <strong className="text-white text-sm font-extrabold">{data.count}</strong> เรื่อง
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const share = rangeTotal > 0 ? ((data.value / rangeTotal) * 100).toFixed(1) : '0';
      return (
        <div className="bg-slate-900/95 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700 backdrop-blur-xs">
          <p className="font-bold" style={{ color: data.color }}>{data.name}</p>
          <p className="font-semibold text-slate-200">
            จำนวน: <strong className="text-white text-sm font-extrabold">{data.value}</strong> เรื่อง ({share}%)
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomTrendTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900/95 text-white p-3 rounded-xl shadow-xl text-xs space-y-1.5 border border-slate-700 backdrop-blur-xs min-w-[160px]">
          <p className="font-bold border-b border-slate-700 pb-1 mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></span>
                <span className="text-slate-300">{entry.name}</span>
              </div>
              <span className="font-bold">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Status bar items for tabular view
  const statusItems = [
    {
      id: 'submitted',
      label: 'ยื่นเรื่องแล้ว',
      sublabel: 'Submitted',
      count: submittedCount,
      bgColor: 'bg-blue-50 text-blue-800 border-blue-200',
      barColor: 'from-blue-400 to-blue-600'
    },
    {
      id: 'under_review',
      label: 'อยู่ระหว่างพิจารณา',
      sublabel: 'Under Review',
      count: underReviewCount,
      bgColor: 'bg-amber-50 text-amber-800 border-amber-200',
      barColor: 'from-amber-400 to-amber-600'
    },
    {
      id: 'action_required',
      label: 'ขอข้อมูลเพิ่มเติม',
      sublabel: 'Action Needed',
      count: actionRequiredCount,
      bgColor: 'bg-purple-50 text-purple-800 border-purple-200',
      barColor: 'from-purple-400 to-purple-600'
    },
    {
      id: 'approved',
      label: 'อนุมัติแล้ว',
      sublabel: 'Approved',
      count: approvedCount,
      bgColor: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      barColor: 'from-emerald-400 to-emerald-600'
    },
    {
      id: 'completed',
      label: 'เสร็จสิ้นแล้ว',
      sublabel: 'Completed',
      count: completedCount,
      bgColor: 'bg-teal-50 text-teal-800 border-teal-200',
      barColor: 'from-teal-400 to-teal-600'
    },
    {
      id: 'rejected',
      label: 'ไม่อนุมัติ/ปฏิเสธ',
      sublabel: 'Rejected',
      count: rejectedCount,
      bgColor: 'bg-rose-50 text-rose-800 border-rose-200',
      barColor: 'from-rose-400 to-rose-600'
    }
  ];

  const maxCount = Math.max(1, ...statusItems.map((s) => s.count));

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 space-y-5">
      
      {/* Analytics Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-xl shadow-xs">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              แดชบอร์ดสรุปสถิติคำร้อง (Officer Visual Analytics Dashboard)
            </h3>
            <p className="text-xs text-slate-500">
              แผนภูมิ Recharts สรุปจำนวนคำร้องแยกตามหมวดหมู่และสถานะประจำเดือน
            </p>
          </div>
        </div>

        {/* Time Period Filter & View Mode Controls */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Time Filter Pill */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-700 border border-slate-200/80">
            <button
              onClick={() => setTimeRange('current_month')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                timeRange === 'current_month'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              เดือนปัจจุบัน ({currentMonthName})
            </button>
            <button
              onClick={() => setTimeRange('all')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                timeRange === 'all'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              สะสมทั้งหมด ({overallTotal} เรื่อง)
            </button>
          </div>

          {/* View Mode Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200/80">
            <button
              onClick={() => setViewMode('visual_charts')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === 'visual_charts'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              <PieIcon className="w-3.5 h-3.5 text-indigo-600" />
              แผนภูมิ Recharts
            </button>
            <button
              onClick={() => setViewMode('status')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === 'status'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              สรุปสถานะ
            </button>
            <button
              onClick={() => setViewMode('category')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === 'category'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              สรุปหมวดหมู่
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-500 block font-medium">คำร้องช่วงเวลาที่เลือก</span>
            <span className="text-xl font-extrabold text-slate-900">
              {rangeTotal} <span className="text-xs font-normal text-slate-500">เรื่อง</span>
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
            {timeRange === 'current_month' ? 'เดือนนี้' : 'รวม'}
          </div>
        </div>

        <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-amber-800 block font-medium flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-600" />
              อยู่ระหว่างดำเนินการ
            </span>
            <span className="text-xl font-extrabold text-amber-900">
              {totalPending} <span className="text-xs font-normal text-amber-700">เรื่อง</span>
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
            {rangeTotal > 0 ? Math.round((totalPending / rangeTotal) * 100) : 0}%
          </div>
        </div>

        <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-emerald-800 block font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              อัตราอนุมัติ/เสร็จสิ้น
            </span>
            <span className="text-xl font-extrabold text-emerald-900">
              {totalFinished} <span className="text-xs font-normal text-emerald-700">เรื่อง</span>
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
            {completionPercentage}%
          </div>
        </div>

        <div className="bg-rose-50/70 p-3.5 rounded-xl border border-rose-200/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-rose-800 block font-medium flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-600" />
              คำร้องด่วนพิเศษ (Urgent)
            </span>
            <span className="text-xl font-extrabold text-rose-900">
              {urgentCount} <span className="text-xs font-normal text-rose-700">เรื่อง</span>
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center font-bold text-xs">
            {rangeTotal > 0 ? Math.round((urgentCount / rangeTotal) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* --- RECHARTS VISUAL DASHBOARD MODE --- */}
      {viewMode === 'visual_charts' && (
        <div className="space-y-6 pt-2">
          
          {/* Trend Chart Area (Spans full width) */}
          <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-rose-100 text-rose-700 rounded-lg">
                  <Activity className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    แนวโน้มปริมาณคำร้อง & การแจ้งซ่อมกล้องวงจรปิด (Trend Analysis)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    แสดงการเปรียบเทียบคำร้องรวมทั้งหมดเทียบกับคำร้องซ่อมกล้อง CCTV ตามช่วงเวลา
                  </p>
                </div>
              </div>
            </div>

            <div className="h-64 w-full pt-2">
              {trendChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorCctv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="dateStr" 
                      tick={{ fontSize: 11, fill: '#64748b' }} 
                      tickMargin={10}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: '#64748b' }} 
                      allowDecimals={false} 
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTrendTooltip />} />
                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                    <Area 
                      type="monotone" 
                      dataKey="total" 
                      name="ปริมาณคำร้องทั้งหมด" 
                      stroke="#3b82f6" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorTotal)" 
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="cctvRepair" 
                      name="แจ้งซ่อม CCTV" 
                      stroke="#ef4444" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorCctv)" 
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                  ไม่มีข้อมูลสำหรับแสดงแนวโน้มในขณะนี้
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* BAR CHART: Requests by Category */}
          <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                  <BarChart3 className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    แผนภูมิแท่ง: คำร้องแยกตามหมวดหมู่ (Requests by Category)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {timeRange === 'current_month' ? `ประจำเดือน ${currentMonthName}` : 'ข้อมูลคำร้องสะสมทั้งหมด'}
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-200">
                {barChartData.reduce((acc, c) => acc + c.count, 0)} เรื่อง
              </span>
            </div>

            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 45 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 10, fill: '#475569' }} 
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} allowDecimals={false} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={40}>
                    {barChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* PIE CHART: Requests by Status for Current Month */}
          <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-sky-100 text-sky-700 rounded-lg">
                  <PieIcon className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    แผนภูมิวงกลม: สัดส่วนสถานะคำร้อง (Requests by Status)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {timeRange === 'current_month' ? `ประจำเดือน ${currentMonthName}` : 'สัดส่วนทุกช่วงเวลา'}
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-bold bg-sky-50 text-sky-700 px-2.5 py-1 rounded-full border border-sky-200">
                {pieChartData.length} กลุ่มสถานะ
              </span>
            </div>

            <div className="h-72 w-full flex items-center justify-center relative">
              {pieChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="48%"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.color}
                          stroke="#ffffff"
                          strokeWidth={2}
                          className="cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => onSelectStatusFilter && onSelectStatusFilter(entry.statusKey)}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36} 
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => <span className="text-[11px] font-semibold text-slate-700">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-xs text-slate-400 py-10">
                  ไม่มีข้อมูลคำร้องในสถิติตามเงื่อนไขที่เลือก
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
      )}

      {/* Main Bar Chart Display (Tabular Status List) */}
      {viewMode === 'status' && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
            <span>สถานะคำร้อง (Status Group)</span>
            <span>คลิกแท่งกราฟเพื่อกรองข้อมูลในตาราง</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 pt-1">
            {statusItems.map((item) => {
              const heightPercent = rangeTotal > 0 ? Math.max(12, Math.round((item.count / maxCount) * 100)) : 12;
              const sharePercent = rangeTotal > 0 ? ((item.count / rangeTotal) * 100).toFixed(1) : '0';
              const isSelected = currentStatusFilter === item.id;

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectStatusFilter && onSelectStatusFilter(item.id)}
                  className={`group relative bg-slate-50 border rounded-2xl p-3.5 flex flex-col justify-between items-center transition-all cursor-pointer hover:shadow-md ${
                    isSelected ? 'ring-2 ring-blue-600 border-blue-400 bg-blue-50/30' : 'border-slate-200 hover:border-slate-300'
                  }`}
                  title={`คลิกเพื่อกรองเฉพาะสถานะ: ${item.label}`}
                >
                  <div className="text-center space-y-0.5 w-full">
                    <span className="text-[11px] font-bold text-slate-700 block truncate">{item.label}</span>
                    <span className="text-[10px] text-slate-400 block">{item.sublabel}</span>
                  </div>

                  {/* Vertical Bar Chart Graphic */}
                  <div className="h-28 w-full flex items-end justify-center my-3 relative px-2">
                    <div className="w-full max-w-[36px] bg-slate-200/60 rounded-t-xl h-full absolute bottom-0 flex items-end">
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full bg-gradient-to-t ${item.barColor} rounded-t-xl transition-all duration-500 shadow-xs group-hover:brightness-110 flex items-center justify-center text-white font-extrabold text-xs`}
                      >
                        {item.count > 0 && item.count}
                      </div>
                    </div>
                  </div>

                  {/* Badge details */}
                  <div className="w-full text-center space-y-1">
                    <div className="text-lg font-extrabold text-slate-900">{item.count}</div>
                    <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border inline-block ${item.bgColor}`}>
                      {sharePercent}%
                    </div>
                  </div>

                  {isSelected && (
                    <div className="absolute top-2 right-2 text-blue-600 bg-white p-0.5 rounded-full shadow-xs">
                      <Filter className="w-3 h-3" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Category Breakdown Horizontal Bars */}
      {viewMode === 'category' && (
        <div className="space-y-2.5 pt-2">
          <div className="text-xs text-slate-500 font-medium px-1">
            แจกแจงจำนวนคำร้องตามหมวดหมู่ประเภทการยื่นเรื่อง
          </div>
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {barChartData.map((cat) => {
              const maxCategoryCount = Math.max(1, ...barChartData.map(c => c.count));
              const widthPercent = rangeTotal > 0 ? Math.max(4, Math.round((cat.count / maxCategoryCount) * 100)) : 0;
              const sharePercent = rangeTotal > 0 ? ((cat.count / rangeTotal) * 100).toFixed(1) : '0';

              return (
                <div key={cat.categoryId} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{cat.fullName}</span>
                    <span className="font-bold text-slate-900">
                      {cat.count} <span className="text-[11px] font-normal text-slate-500">เรื่อง ({sharePercent}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${widthPercent}%`, backgroundColor: cat.color }}
                      className="h-full transition-all duration-500 rounded-full"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};

