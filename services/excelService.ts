
import * as XLSX from 'xlsx';
import { Session } from '../types';

/**
 * Normalizes time values to strict Railway Time (4-digit HHmm format).
 * Handles Date objects, Excel serial decimals, and strings with/without colons or AM/PM.
 */
const normalizeTime = (val: any): string => {
  if (val === undefined || val === null || val === '') return '';

  let hours = 0;
  let minutes = 0;

  if (val instanceof Date) {
    // Handles JS Date objects (common with cellDates: true)
    hours = val.getHours();
    minutes = val.getMinutes();
  } else if (typeof val === 'number') {
    if (val < 1 && val >= 0) {
      // Handles Excel decimal time (e.g., 0.5 = 12:00)
      const totalMinutes = Math.round(val * 1440);
      hours = Math.floor(totalMinutes / 60);
      minutes = totalMinutes % 60;
    } else {
      // Handles HHmm as a number (e.g., 830 or 1330)
      const s = String(val).padStart(4, '0');
      hours = parseInt(s.slice(0, 2), 10);
      minutes = parseInt(s.slice(2, 4), 10);
    }
  } else {
    // Handles string inputs like "08:30 AM", "13:30", "830", etc.
    const str = String(val).trim();
    const ampmMatch = str.match(/(am|pm)/i);
    // Extract only digits and filter out empty strings
    const parts = str.replace(/[a-z]/gi, '').split(':').map(p => p.trim()).filter(p => p.length > 0);
    
    if (parts.length >= 2) {
      // Case: "HH:mm" or "HH:mm:ss"
      hours = parseInt(parts[0], 10);
      minutes = parseInt(parts[1], 10);
    } else if (parts.length === 1) {
      // Case: "HHmm" or just "H"
      const t = parts[0].padStart(4, '0');
      hours = parseInt(t.slice(0, 2), 10);
      minutes = parseInt(t.slice(2, 4), 10);
    }

    if (ampmMatch) {
      const isPM = ampmMatch[0].toLowerCase() === 'pm';
      if (isPM && hours < 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
    }
  }

  // Final check for wrap-around
  hours = hours % 24;
  minutes = minutes % 60;

  return `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`;
};

/**
 * Normalizes date strings to YYYY-MM-DD.
 */
const normalizeDate = (val: any): string => {
  if (!val) return '';
  
  // Excel serial date
  if (typeof val === 'number' && val > 30000) {
    const date = XLSX.SSF.parse_date_code(val);
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }

  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }

  const str = String(val).trim();
  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return str;
};

/**
 * Extracts and cleans the Squad identifier from the first cell (A1).
 */
const extractSquadFromA1 = (val: any): string => {
  if (val === undefined || val === null || val === '') return '';
  const str = String(val).trim();
  const match = str.match(/\d+/);
  return match ? match[0] : str;
};

export const parseExcelFile = async (file: File): Promise<Session[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const allSessions: Session[] = [];

        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          if (rawData.length === 0) return;

          const squadForThisSheet = extractSquadFromA1(rawData[0][0]);
          if (!squadForThisSheet) return;

          let lastDateInSheet = '';

          for (let i = 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length < 3) continue;

            const col1Val = String(row[0] || '').toLowerCase();
            if (col1Val.includes('slot') || col1Val.includes('date') || col1Val.includes('squad')) continue;

            const sessionDate = normalizeDate(row[1]) || lastDateInSheet;
            const fromTime = normalizeTime(row[2]);
            const toTime = normalizeTime(row[3]);

            if (fromTime && sessionDate) {
              allSessions.push({
                id: Math.random().toString(36).substr(2, 9),
                squad_number: squadForThisSheet,
                date: sessionDate,
                from: fromTime,
                to: toTime,
                course_id: String(row[4] || 'Untitled Course'),
                lu_id: row[5] ? String(row[5]) : '', // Requirement: Leave empty if not provided
                mentor_id: String(row[6] || 'Unassigned'),
              });
              lastDateInSheet = sessionDate;
            }
          }
        });

        resolve(allSessions);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

export const exportToExcel = (sessions: Session[], squadId: string | number) => {
  const filtered = sessions.filter(s => String(s.squad_number).toLowerCase() === String(squadId).toLowerCase());

  // Sort by date then by railway time
  const sortedSessions = [...filtered].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return parseInt(a.from, 10) - parseInt(b.from, 10);
  });

  // Requirement: Row 1, Column A1 contains the squad/square number
  const squadHeaderRow = [squadId];

  // Requirement: Row 2 contains column headers in lowercase
  const columnHeaders = [
    'slot_number',
    'date',
    'from',
    'to',
    'course_id',
    'lu_id',
    'mentor_id'
  ];

  // Map sorted sessions to data rows
  // Requirement: reset slot_number to 1 after every day
  let currentDate = '';
  let daySlotCounter = 0;

  const dataRows = sortedSessions.map((s) => {
    if (s.date !== currentDate) {
      currentDate = s.date;
      daySlotCounter = 1;
    } else {
      daySlotCounter++;
    }

    return [
      daySlotCounter, // slot_number (resets per day)
      s.date,
      s.from,
      s.to,
      s.course_id,
      s.lu_id,
      s.mentor_id
    ];
  });

  const worksheet = XLSX.utils.aoa_to_sheet([squadHeaderRow, columnHeaders, ...dataRows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Schedule");

  const now = new Date();
  const dateStr = now.getFullYear() + '-' + 
                  String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                  String(now.getDate()).padStart(2, '0');
  const timeStr = String(now.getHours()).padStart(2, '0') + 
                  String(now.getMinutes()).padStart(2, '0');
  
  const fileName = `${squadId}_updated_on_${dateStr}_${timeStr}.xlsx`.toLowerCase();
  XLSX.writeFile(workbook, fileName);
};
