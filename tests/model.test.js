import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, reduce, reported, reviewed, latest, submission, validateFile } from '../src/model.js';
import { missions } from '../src/missions.js';
let n = 0;
const command = (state, type, payload={}) => reduce(state, { id: `cmd-${++n}`, role: 'student', studentId: 's1', type, ...payload });
function prepared() { let s = command(makeState(), 'ready'); return command(s, 'session', { role:'teacher', status:'running' }); }
function completed() { let s = prepared(); for (const m of missions) { s = command(s, 'start', { missionId:m.id }); s = command(s, 'complete', { missionId:m.id, attemptId:latest(s.students[0],m.id).id, note:'센서와 주행 결과를 확인했어요.', checks:m.checks.map(() => true) }); } return s; }
test('학생은 시험 시작 권한이 없고, 대기·일시정지·종료 중 미션을 시작할 수 없다', () => {
  assert.throws(() => command(makeState(),'session',{status:'running'}));
  assert.throws(() => command(makeState(),'start',{missionId:'forward'}));
  let s = prepared(); s = command(s,'session',{role:'teacher',status:'paused'});
  assert.throws(() => command(s,'start',{missionId:'forward'}));
  s = command(s,'session',{role:'teacher',status:'ended'});
  assert.throws(() => command(s,'session',{role:'teacher',status:'running'}));
});
test('완료 요청에는 모든 점검과 기록이 필요하며 자동 교사 통과를 만들지 않는다', () => {
  let s = prepared(); s = command(s,'start',{missionId:'forward'}); const id = latest(s.students[0],'forward').id;
  assert.throws(() => command(s,'complete',{missionId:'forward',attemptId:id,note:'',checks:[true,true]}));
  assert.throws(() => command(s,'complete',{missionId:'forward',attemptId:id,note:'기록',checks:[true,false]}));
  s = command(s,'complete',{missionId:'forward',attemptId:id,note:'5초 이동 후 정지',checks:[true,true]});
  assert.equal(reported(s.students[0]),1); assert.equal(reviewed(s.students[0]),0); assert.equal(latest(s.students[0],'forward').result,null);
});
test('미완료 제출·빈 파일·과대 파일·잘못된 확장자를 거부한다', () => {
  assert.throws(() => command(prepared(),'submit',{file:{name:'x.ent',size:5}}));
  for(const f of [{name:'a.ent',size:0},{name:'a.ent',size:21*1024*1024},{name:'a.html',size:5}]) assert.throws(() => validateFile(f));
});
test('최종 제출은 시도를 고정하고 중복 요청을 중복 알림 이벤트로 만들지 않는다', () => {
  let s=completed(); const action={id:'unique-submit',type:'submit',role:'student',studentId:'s1',file:{name:'project.ent',size:10}};
  s=reduce(s,action); s=reduce(s,action);
  assert.equal(s.students[0].submissions.length,1); assert.equal(s.events.filter(e=>e.id===action.id).length,1);
  assert.equal(Object.keys(submission(s.students[0]).attemptIds).length,5);
  assert.throws(()=>command(s,'submit',{file:{name:'again.ent',size:10}}));
  assert.throws(()=>command(s,'start',{missionId:'forward'}));
});
test('재시도는 교사 허가 후 진행하며 과거 제출과 판정을 보존한다', () => {
  let s=completed(); s=command(s,'submit',{file:{name:'one.ent',size:10}});
  const first=submission(s.students[0]);
  s=command(s,'review',{role:'teacher',missionId:'forward',attemptId:latest(s.students[0],'forward').id,result:'pass',feedback:'실제 주행 확인'});
  s=command(s,'retry',{role:'teacher'}); s=command(s,'start',{missionId:'forward'});
  assert.equal(reported(s.students[0]),4); assert.equal(s.students[0].attempts.forward.length,2);
  assert.equal(s.students[0].attempts.forward[0].result,'pass');
  s=command(s,'complete',{missionId:'forward',attemptId:latest(s.students[0],'forward').id,note:'재시도',checks:[true,true]});
  s=command(s,'submit',{file:{name:'two.ent',size:15}});
  assert.equal(s.students[0].submissions.length,2); assert.equal(s.students[0].submissions[0].id,first.id);
});
test('알림 읽음과 파일 검토와 주행 판정은 서로 독립적이다', () => {
  let s=completed(); s=command(s,'submit',{file:{name:'p.ent',size:10}}); const id=submission(s.students[0]).id;
  s=command(s,'read',{role:'teacher',submissionId:id}); assert.equal(submission(s.students[0]).review,null);
  s=command(s,'reviewFile',{role:'teacher',submissionId:id,result:'complete',feedback:'파일 확인'});
  assert.equal(submission(s.students[0]).review,'complete'); assert.equal(reviewed(s.students[0]),0);
});
