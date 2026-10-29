import { missions } from './missions.js';
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const makeState = () => ({ version: 1, status: 'lobby', startedAt: null, endedAt: null, students: Array.from({ length: 12 }, (_, i) => ({ id: `s${i + 1}`, number: i + 1, name: `학생 ${String(i + 1).padStart(2, '0')}`, ready: false, attempts: {}, submissions: [], retryAllowed: false })), events: [] });
export const latest = (student, id) => student.attempts[id]?.at(-1);
export const reported = (student) => missions.filter(m => ['submitted', 'reviewed'].includes(latest(student, m.id)?.status)).length;
export const reviewed = (student) => missions.filter(m => latest(student, m.id)?.status === 'reviewed').length;
export const submission = (student) => student.submissions.at(-1);
export function validateFile(file) {
  if (!file || !file.name) throw new Error('엔트리 파일을 선택해 주세요.');
  if (!/\.ent$/i.test(file.name)) throw new Error('엔트리에서 저장한 .ent 프로젝트 파일을 선택해 주세요.');
  if (file.size <= 0) throw new Error('비어 있는 파일은 제출할 수 없어요.');
  if (file.size > MAX_FILE_BYTES) throw new Error('20 MiB 이하의 파일을 선택해 주세요.');
}
// Pure reducer shared by browser and meaningful workflow tests. Demo only: not an authorization boundary.
export function reduce(current, action) {
  const state = structuredClone(current);
  const now = action.at ?? new Date().toISOString();
  if (state.events.some(e => e.id === action.id)) return state;
  const student = state.students.find(s => s.id === action.studentId);
  const mission = missions.find(m => m.id === action.missionId);
  const teacherActions = ['session', 'review', 'reviewFile', 'retry'];
  if (teacherActions.includes(action.type) && action.role !== 'teacher') throw new Error('교사 화면에서 진행해 주세요.');
  const requireRunning = () => { if (state.status !== 'running') throw new Error('시험 진행 중에만 저장할 수 있어요.'); };
  switch (action.type) {
    case 'session': {
      const transitions = { lobby: ['running'], running: ['paused', 'ended'], paused: ['running', 'ended'], ended: [] };
      if (!transitions[state.status].includes(action.status)) throw new Error('지금은 해당 상태로 변경할 수 없어요.');
      state.status = action.status;
      if (action.status === 'running' && !state.startedAt) state.startedAt = now;
      if (action.status === 'ended') state.endedAt = now;
      break;
    }
    case 'ready':
      if (!student || state.status === 'ended') throw new Error('준비 상태를 변경할 수 없어요.');
      student.ready = true; break;
    case 'start': {
      requireRunning();
      if (!student?.ready || !mission) throw new Error('준비 확인 후 미션을 선택해 주세요.');
      if (submission(student) && !student.retryAllowed) throw new Error('최종 제출 후에는 선생님의 재시도 허가가 필요해요.');
      const prev = latest(student, mission.id);
      if (prev?.status === 'in_progress') return current;
      if (prev && !student.retryAllowed) throw new Error('선생님께 재시도를 요청해 주세요.');
      student.attempts[mission.id] ??= [];
      student.attempts[mission.id].push({ id: action.id, number: student.attempts[mission.id].length + 1, status: 'in_progress', startedAt: now, submittedAt: null, note: '', checks: [], result: null, feedback: '' });
      if (submission(student)) submission(student).needsRevision = true;
      student.retryAllowed = false;
      break;
    }
    case 'complete': {
      requireRunning();
      const attempt = mission && latest(student, mission.id);
      if (!attempt || attempt.id !== action.attemptId || attempt.status !== 'in_progress') throw new Error('현재 진행 중인 시도를 다시 확인해 주세요.');
      if (!action.note?.trim() || action.note.length > 2000) throw new Error('실험 기록을 1~2,000자로 적어 주세요.');
      if (action.checks?.length !== mission.checks.length || !action.checks.every(v => v === true)) throw new Error('모든 자기 점검 항목을 확인해 주세요.');
      Object.assign(attempt, { status: 'submitted', note: action.note.trim(), checks: action.checks, submittedAt: now });
      break;
    }
    case 'submit': {
      requireRunning();
      if (reported(student) !== missions.length) throw new Error('모든 미션의 완료 요청을 먼저 해 주세요.');
      if (submission(student) && !student.retryAllowed && !submission(student).needsRevision) throw new Error('이미 제출했어요. 선생님의 재제출 허가가 필요해요.');
      validateFile(action.file);
      student.submissions.push({ id: action.id, version: student.submissions.length + 1, fileName: action.file.name, size: action.file.size, at: now, note: (action.note || '').slice(0, 2000), readAt: null, review: null, feedback: '', needsRevision: false, attemptIds: Object.fromEntries(missions.map(m => [m.id, latest(student, m.id).id])) });
      student.retryAllowed = false;
      break;
    }
    case 'read': {
      if (action.role !== 'teacher') throw new Error('교사만 알림을 확인할 수 있어요.');
      const target = student?.submissions.find(s => s.id === action.submissionId);
      if (!target) throw new Error('제출을 찾을 수 없어요.');
      target.readAt ??= now; break;
    }
    case 'review': {
      const attempt = mission && student?.attempts[mission.id]?.find(a => a.id === action.attemptId);
      if (!attempt || !['submitted', 'reviewed'].includes(attempt.status)) throw new Error('완료 요청한 시도를 선택해 주세요.');
      if (!['pass', 'not_yet', 'inconclusive'].includes(action.result)) throw new Error('판정을 선택해 주세요.');
      if (!action.feedback?.trim()) throw new Error('판정 근거 또는 피드백을 적어 주세요.');
      Object.assign(attempt, { status: 'reviewed', result: action.result, feedback: action.feedback.slice(0, 2000), reviewedAt: now }); break;
    }
    case 'reviewFile': {
      const target = submission(student);
      if (!target || target.id !== action.submissionId) throw new Error('최신 제출을 다시 확인해 주세요.');
      if (!['complete', 'needs_revision'].includes(action.result) || !action.feedback?.trim()) throw new Error('검토 결과와 피드백을 입력해 주세요.');
      Object.assign(target, { review: action.result, feedback: action.feedback.slice(0, 2000), reviewedAt: now });
      if (action.result === 'needs_revision') student.retryAllowed = true;
      break;
    }
    case 'retry':
      if (!student) throw new Error('학생을 선택해 주세요.');
      student.retryAllowed = true; break;
    default: throw new Error('알 수 없는 작업이에요.');
  }
  state.events.push({ ...action, at: now });
  return state;
}
