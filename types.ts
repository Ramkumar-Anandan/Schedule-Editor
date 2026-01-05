
export interface Session {
  id: string;
  squad_number: number | string;
  date: string; // YYYY-MM-DD
  from: string; // HHmm
  to: string;   // HHmm
  course_id: string;
  lu_id: string;
  mentor_id: string;
}

export interface TimetableSlot {
  squad: string | number;
  timeSlot: string; // e.g. "0830-1030"
}

export interface DragItem {
  type: 'SESSION';
  session: Session;
  source: 'timetable' | 'parking';
}
