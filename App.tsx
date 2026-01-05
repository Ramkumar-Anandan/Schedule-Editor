import React, { useState, useMemo } from 'react';
import { parseExcelFile, exportToExcel } from './services/excelService';
import { analyzeSchedule } from './services/geminiService';
import { Session } from './types';
import { 
  Download, 
  Upload, 
  Trash2, 
  Info, 
  Sparkles, 
  ChevronLeft, 
  ChevronRight,
  GripVertical,
  LayoutGrid,
  Users,
  Clock,
  Plus
} from 'lucide-react';

interface SlotDefinition {
  from: string;
  to: string;
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [parkingLot, setParkingLot] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSquad, setSelectedSquad] = useState<string | number>(1);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  // Default slots used as fallback or baseline
  const defaultSlots: SlotDefinition[] = [
    { from: "0830", to: "1030" },
    { from: "1030", to: "1230" },
    { from: "1330", to: "1530" },
    { from: "1530", to: "1730" }
  ];

  /**
   * Dynamically derive time slots from imported session data.
   * Ensures the grid columns are always sorted by railway time (HHmm).
   */
  const dynamicTimeSlots = useMemo(() => {
    const slotMap = new Map<string, string>();
    
    // Extract unique slots from current session data
    sessions.forEach(s => {
      if (s.from && s.to) slotMap.set(s.from, s.to);
    });

    if (slotMap.size === 0) return defaultSlots;

    // Sort key (HHmm string) numerically to ensure left-to-right chronological order
    const sortedFromTimes = Array.from(slotMap.keys()).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    
    return sortedFromTimes.map(from => ({
      from,
      to: slotMap.get(from) || ""
    }));
  }, [sessions]);

  // Determine squads present in data
  const squads = useMemo(() => {
    const baseSquads = [1, 2, 3, 4, 5, 6];
    // Fix: Explicitly type n as number to resolve 'unknown' error in filter and sort.
    const foundSquadIDs = Array.from(new Set(sessions.map(s => Number(s.squad_number))))
      .filter((n): n is number => typeof n === 'number' && !isNaN(n));
    return Array.from(new Set([...baseSquads, ...foundSquadIDs])).sort((a: number, b: number) => a - b);
  }, [sessions]);

  // Determine visible dates for the current squad
  const visibleDates = useMemo(() => {
    const squadSessions = sessions.filter(s => String(s.squad_number) === String(selectedSquad));
    const sessionDates = Array.from(new Set(squadSessions.map(s => s.date))).sort();
    
    if (sessionDates.length === 0) {
      return [new Date().toISOString().split('T')[0]];
    }
    return sessionDates;
  }, [sessions, selectedSquad]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setLoading(true);
      try {
        const data = await parseExcelFile(e.target.files[0]);
        if (data.length === 0) {
          alert("Import failed: No valid session data found.");
          return;
        }
        setSessions(data);
        setParkingLot([]); 
        setSelectedSquad(data[0].squad_number);
      } catch (err) {
        alert("Excel processing error.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleExport = () => {
    // Only export active timetable sessions, excluding the staging area (parkingLot)
    exportToExcel(sessions, selectedSquad);
  };

  const handleAiAnalysis = async () => {
    setLoading(true);
    const squadData = sessions.filter(s => String(s.squad_number) === String(selectedSquad));
    const summary = squadData.length > 0 
      ? squadData.map(s => `Date: ${s.date} @ ${s.from}: ${s.course_id}`).join('\n')
      : "No sessions recorded.";
    const result = await analyzeSchedule(`Squad: ${selectedSquad}\nSchedule:\n${summary}`);
    setAiAnalysis(result || "Audit completed.");
    setLoading(false);
  };

  const onDragStart = (e: React.DragEvent, session: Session, from: 'timetable' | 'parking') => {
    e.dataTransfer.setData('session', JSON.stringify(session));
    e.dataTransfer.setData('source', from);
  };

  const onDropToTimetable = (e: React.DragEvent, targetDate: string, targetSlot: SlotDefinition) => {
    e.preventDefault();
    const draggedSession = JSON.parse(e.dataTransfer.getData('session')) as Session;
    const source = e.dataTransfer.getData('source');

    // Update session data to inherit the slot's specific railway time and date
    const updatedSession: Session = { 
      ...draggedSession, 
      squad_number: String(selectedSquad), 
      date: targetDate,
      from: targetSlot.from,
      to: targetSlot.to
    };

    if (source === 'parking') {
      setParkingLot(prev => prev.filter(s => s.id !== draggedSession.id));
      setSessions(prev => [...prev, updatedSession]);
    } else {
      setSessions(prev => prev.map(s => s.id === draggedSession.id ? updatedSession : s));
    }
  };

  const onDropToParking = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedSession = JSON.parse(e.dataTransfer.getData('session')) as Session;
    const source = e.dataTransfer.getData('source');

    if (source === 'timetable') {
      setSessions(prev => prev.filter(s => s.id !== draggedSession.id));
      setParkingLot(prev => [...prev, draggedSession]);
    }
  };

  const currentSquadSessions = useMemo(() => {
    return sessions.filter(s => String(s.squad_number) === String(selectedSquad));
  }, [sessions, selectedSquad]);

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return {
      day: d.toLocaleDateString('en-US', { weekday: 'short' }),
      date: d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
    };
  };

  /**
   * Formats a range in Railway Time (HHmm - HHmm).
   */
  const formatRailwayRange = (from: string, to: string) => {
    return `${from} - ${to}`;
  };

  const navigateSquad = (direction: number) => {
    const currentIndex = squads.indexOf(Number(selectedSquad));
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = squads.length - 1;
    if (nextIndex >= squads.length) nextIndex = 0;
    setSelectedSquad(squads[nextIndex]);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans h-screen overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-[100] shadow-sm backdrop-blur-md bg-white/90 shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-[#ff0010] p-3 rounded-2xl text-white shadow-lg shadow-red-100 ring-4 ring-red-50">
            <LayoutGrid size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">Schedule Editor</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">There is Plan B</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer bg-white hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded-xl transition-all font-bold text-sm border-2 border-slate-100 shadow-sm">
            <Upload size={18} className="text-[#ff0010]" />
            Import
            <input type="file" className="hidden" onChange={handleFileUpload} accept=".xlsx, .xls" />
          </label>
          <button 
            type="button"
            onClick={handleExport}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl transition-all font-bold text-sm shadow-xl shadow-slate-200"
          >
            <Download size={18} />
            Export
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-8 overflow-hidden flex flex-col h-full">
          <div className="flex flex-wrap items-center justify-between gap-6 mb-8 shrink-0">
            <div className="flex items-center gap-3 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm">
              <button 
                type="button"
                className="p-3 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-[#ff0010] transition-all active:scale-95"
                onClick={() => navigateSquad(-1)}
              >
                <ChevronLeft size={24} strokeWidth={3} />
              </button>
              <div className="px-10 flex flex-col items-center">
                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Focus Squad</span>
                <div className="flex items-center gap-3">
                  <Users size={20} className="text-[#ff0010]" />
                  <span className="font-black text-slate-800 text-2xl tracking-tighter uppercase">SQUAD {selectedSquad}</span>
                </div>
              </div>
              <button 
                type="button"
                className="p-3 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-[#ff0010] transition-all active:scale-95"
                onClick={() => navigateSquad(1)}
              >
                <ChevronRight size={24} strokeWidth={3} />
              </button>
            </div>

            <button 
              type="button"
              onClick={handleAiAnalysis}
              className="flex items-center gap-2 bg-red-50 text-red-700 hover:bg-[#ff0010] hover:text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-red-100 shadow-sm group"
            >
              <Sparkles size={18} className="group-hover:rotate-12 transition-transform" />
              Audit Schedule
            </button>
          </div>

          <div className="flex-1 bg-white rounded-[3rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col relative">
            <div className="flex-1 overflow-auto custom-scrollbar scroll-smooth">
              <div 
                className="min-w-max relative" 
                key={`${dynamicTimeSlots.length}-${visibleDates.length}-${selectedSquad}`}
              >
                {/* Grid Header Row */}
                <div className="grid sticky top-0 z-[55] bg-slate-50 border-b border-slate-100" 
                     style={{ gridTemplateColumns: `180px repeat(${dynamicTimeSlots.length}, 300px)` }}>
                  
                  <div className="p-6 font-black text-slate-400 text-[10px] uppercase tracking-[0.25em] text-center border-r border-slate-100 sticky left-0 top-0 bg-slate-100 z-[56] flex flex-col items-center justify-center">
                    Date
                  </div>
                  
                  {dynamicTimeSlots.map((slot, idx) => (
                    <div key={idx} className="p-6 font-black text-slate-600 text-[10px] uppercase tracking-[0.15em] text-center border-r border-slate-100 last:border-r-0 flex flex-col items-center justify-center gap-2 bg-slate-50">
                      <div className="flex items-center gap-2">
                        <Clock size={12} className="text-red-400" />
                        {formatRailwayRange(slot.from, slot.to)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Grid Rows */}
                {visibleDates.map(dateStr => {
                  const label = formatDateLabel(dateStr);
                  return (
                    <div key={dateStr} className="grid border-b border-slate-100 last:border-b-0 min-h-[180px] group/row"
                         style={{ gridTemplateColumns: `180px repeat(${dynamicTimeSlots.length}, 300px)` }}>
                      
                      <div className="flex flex-col items-center justify-center border-r border-slate-100 bg-white group-hover/row:bg-slate-50 transition-all sticky left-0 z-50 shadow-[2px_0_5px_rgba(0,0,0,0.03)] px-4">
                        <span className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">{label.day}</span>
                        <span className="text-2xl font-black text-slate-800">{label.date}</span>
                      </div>

                      {dynamicTimeSlots.map((slot, sIdx) => {
                        const session = currentSquadSessions.find(s => 
                          s.date === dateStr && s.from === slot.from
                        );

                        return (
                          <div 
                            key={sIdx}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => onDropToTimetable(e, dateStr, slot)}
                            className={`relative p-5 border-r border-slate-100 last:border-r-0 transition-all duration-300 ${
                              session ? 'bg-white' : 'bg-white hover:bg-red-50/20'
                            }`}
                          >
                            {!session && (
                              <div className="h-full flex items-center justify-center opacity-0 group-hover/row:opacity-100 pointer-events-none transition-all scale-75">
                                <Plus className="text-red-200/50" size={32} />
                              </div>
                            )}
                            {session && (
                              <div 
                                draggable 
                                onDragStart={(e) => onDragStart(e, session, 'timetable')}
                                className="h-full w-full bg-gradient-to-br from-red-50 to-white border-l-[6px] border-[#ff0010] p-6 rounded-[1.5rem] shadow-lg cursor-grab active:cursor-grabbing hover:shadow-2xl hover:scale-[1.02] transition-all flex flex-col justify-between group/card ring-1 ring-red-100/50"
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-3 mb-2">
                                    <h4 className="font-black text-red-950 text-sm leading-tight line-clamp-2 uppercase tracking-tight">{session.course_id}</h4>
                                    <GripVertical size={16} className="text-red-200 shrink-0 group-hover/card:text-red-400" />
                                  </div>
                                  {session.lu_id && (
                                    <div className="inline-block bg-red-600/10 px-2.5 py-1 rounded-lg">
                                      <p className="text-[10px] text-[#ff0010] font-black uppercase tracking-widest">{session.lu_id}</p>
                                    </div>
                                  )}
                                </div>
                                <div className="mt-4 pt-4 border-t border-red-100 flex items-center justify-between">
                                   <p className="text-[11px] text-red-900 font-black truncate max-w-[120px]">{session.mentor_id}</p>
                                   <span className="text-[9px] font-black text-red-400">{session.from}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {aiAnalysis && (
              <div className="absolute bottom-6 left-6 right-6 bg-white/95 backdrop-blur-xl border border-red-100 rounded-[2.5rem] p-8 shadow-2xl z-[70] animate-in slide-in-from-bottom-10 duration-500">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4 text-red-900 font-black text-sm uppercase tracking-widest">
                    <Sparkles size={18} />
                    <span>Intelligence Report</span>
                  </div>
                  <button onClick={() => setAiAnalysis(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                    <Plus size={20} className="rotate-45" />
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto pr-4 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                  {aiAnalysis}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar / Staging */}
        <aside 
          className="w-[320px] bg-white border-l border-slate-200 flex flex-col shadow-[-30px_0_60px_rgba(0,0,0,0.03)] z-[80] shrink-0 overflow-hidden"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropToParking}
        >
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
            <h2 className="font-black text-slate-800 flex items-center gap-4 text-xs uppercase tracking-[0.25em]">
              <Info size={20} className="text-[#ff0010]" />
              Staging
            </h2>
            <div className="bg-[#ff0010] text-white text-[12px] font-black px-4 py-2 rounded-2xl shadow-xl shadow-red-200">
              {parkingLot.length}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 bg-slate-50/20 custom-scrollbar">
            {parkingLot.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 text-center opacity-40 shrink-0">
                <LayoutGrid size={60} className="mb-8" />
                <p className="text-xs font-black uppercase tracking-[0.2em]">Queue Empty</p>
              </div>
            ) : (
              parkingLot.map(session => (
                <div 
                  key={session.id}
                  draggable 
                  onDragStart={(e) => onDragStart(e, session, 'parking')}
                  className="bg-white border border-slate-200 p-6 rounded-[2.5rem] shadow-sm cursor-grab active:cursor-grabbing hover:border-[#ff0010] hover:shadow-2xl transition-all group relative overflow-hidden ring-1 ring-slate-100 shrink-0"
                >
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100">
                     <button 
                      type="button"
                      onClick={() => setParkingLot(prev => prev.filter(s => s.id !== session.id))}
                      className="text-slate-300 hover:text-red-500 bg-white rounded-xl p-2 shadow-md border border-slate-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <h4 className="font-black text-slate-800 text-sm mb-2 uppercase tracking-tight">{session.course_id}</h4>
                  {session.lu_id && (
                    <p className="text-[11px] text-slate-400 font-black uppercase mb-6">{session.lu_id}</p>
                  )}
                  <div className="flex items-center justify-between pt-6 border-t border-slate-50 text-[11px] font-black">
                    <span className="text-slate-500">{session.date}</span>
                    <span className="text-[#ff0010] bg-red-50 px-3 py-1 rounded-lg">{session.from}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; border: 2px solid #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .sticky.left-0 { box-shadow: 4px 0 10px -5px rgba(0,0,0,0.1); }
      `}</style>

      {loading && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-2xl z-[200] flex items-center justify-center">
          <div className="bg-white p-14 rounded-[4rem] shadow-2xl flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-300">
             <div className="w-16 h-16 border-[8px] border-[#ff0010] border-t-transparent rounded-full animate-spin"></div>
             <p className="font-black text-slate-800 text-2xl tracking-tighter">Processing Schedule...</p>
          </div>
        </div>
      )}
    </div>
  );
}
