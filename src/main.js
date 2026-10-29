import './style.css';
import { missions } from './missions.js';
import { latest, reported, reviewed, submission, validateFile } from './model.js';
import { readState, dispatch, subscribe, getFile, reset } from './store.js';

const root = document.querySelector('#app');
let state;
let role = sessionStorage.getItem('hamster-role') || 'student';
let studentId = sessionStorage.getItem('hamster-student') || 's1';
let missionId = 'forward';
let tab = 'all';
let selected = 's1';
let busy = false;
const drafts = new Map();
const fileDrafts = new Map();
const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = value => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '아직 없음';
const labels = { lobby: '시험 시작 대기', running: '시험 진행 중', paused: '시험 일시정지', ended: '시험 종료', in_progress: '수행 중', submitted: '완료 요청', reviewed: '교사 확인', pass: '통과', not_yet: '미달', inconclusive: '판단 보류', complete: '파일 확인 완료', needs_revision: '보완 요청' };
const badge = (text, tone = '') => `<span class="badge ${tone}">${h(text)}</span>`;
const resultText = a => a ? `${labels[a.status]}${a.result ? ` · ${labels[a.result]}` : ''}` : '미시작';
const savedDraft = () => drafts.get(`${studentId}/${missionId}`) || { note: '', checks: [] };
function announce(message, error = false) {
  const el = document.querySelector('#notice');
  if (!el) return;
  el.className = `notice ${error ? 'error' : ''}`;
  el.textContent = message; el.hidden = false;
}
async function refresh() { state = await readState(); render(); }
async function act(type, payload = {}, file) {
  if (busy) return;
  busy = true;
  root.setAttribute('aria-busy', 'true');
  try {
    await dispatch({ type, role, studentId, id: crypto.randomUUID(), ...payload }, file);
    await refresh(); announce('이 브라우저에 저장했어요.');
  } catch (error) { announce(error.message, true); }
  finally { busy = false; root.removeAttribute('aria-busy'); }
}
function render() {
  const student = state.students.find(s => s.id === studentId);
  const unread = state.students.flatMap(s => s.submissions).filter(s => !s.readAt).length;
  root.innerHTML = `
    <div class="demo-bar"><span>체험 버전</span> 같은 브라우저에서 학생·교사 흐름을 살펴보세요. Firebase 연결 전 · 실제 평가용 아님</div>
    <header class="header"><a class="brand" href="#" aria-label="햄스터봇 처음으로"><span class="brand-mark">H<span>●</span></span><span>햄스터봇<small>DRIVING CLASSROOM</small></span></a>
    <nav aria-label="화면 전환"><button class="nav-button ${role === 'student' ? 'active' : ''}" data-role="student">학생 미션</button><button class="nav-button ${role === 'teacher' ? 'active' : ''}" data-role="teacher">교사 대시보드 ${unread ? `<span class="notification-count">${unread}</span>` : ''}</button></nav>
    <div class="identity">${role === 'student' ? `<label>체험 학생 <select id="student-select">${state.students.map(s => `<option value="${s.id}" ${s.id === studentId ? 'selected' : ''}>${s.number}번</option>`).join('')}</select></label>` : '<span class="avatar">T</span> 선생님'}</div></header>
    <main id="main" tabindex="-1"><div id="notice" role="status" aria-live="polite" hidden></div>
    ${role === 'student' ? studentView(student) : teacherView()}
    </main><footer><span>HAMSTERBOT CLASSROOM</span><span>작은 미션을 모아, 나만의 주행을 완성해요.</span><button id="reset-demo">체험 기록 초기화</button></footer>`;
  bind();
}
function studentView(student) {
  const mission = missions.find(m => m.id === missionId);
  const attempt = latest(student, missionId);
  const draft = savedDraft();
  const progress = reported(student);
  const final = submission(student);
  const running = state.status === 'running';
  return `<section class="hero"><div><p class="eyebrow">LET’S DRIVE, STEP BY STEP</p><h1>오늘의 작은 도전,<br>나만의 주행으로.</h1><p class="muted">엔트리에서 만들고, 직접 움직여 보고, 배운 것을 남겨요.</p><div class="hero-tags">${badge('1학년 2반 · 체험 학급')}${badge(labels[state.status], running ? 'green' : 'amber')}</div></div><div class="hero-art" aria-hidden="true"><div class="route"></div><div class="robot"><div class="eyes">● ●</div><div class="robot-label">HAMSTER</div></div><span class="art-note">READY TO EXPLORE ↗</span></div></section>
    <section class="progress-card"><div><span class="eyebrow">MY PROGRESS</span><h2>${student.number}번 학생의 미션 여정</h2><p class="muted">학생이 기록한 진행 상황이에요. 교사 판정과는 달라요.</p></div><div class="progress-info"><strong>${progress}<span> / ${missions.length}</span></strong><span>미션 완료 요청</span><progress value="${progress}" max="5" aria-label="학생 보고 진행률">${progress}/5</progress></div></section>
    ${!student.ready ? `<section class="ready-card"><div><h2>출발 전에, 준비됐나요?</h2><p>이 확인은 학생의 자기 점검이에요. 앱이 로봇 연결을 검사하지 않아요.</p></div><form id="ready-form"><label><input type="checkbox" required> 엔트리에서 로봇 연결 확인</label><label><input type="checkbox" required> 안전한 공간과 정지 방법 확인</label><button class="primary" ${state.status === 'ended' ? 'disabled' : ''}>준비 완료</button></form></section>` : ''}
    ${!running ? `<div class="callout"><strong>${labels[state.status]}</strong> ${state.status === 'lobby' ? '교사 화면에서 시험을 시작하면 미션 기록을 남길 수 있어요.' : '엔트리에서도 로봇을 정지해 주세요. 웹 앱은 로봇을 정지시키지 않아요.'}</div>` : ''}
    <div class="workspace"><aside class="mission-sidebar"><div class="section-label">YOUR MISSIONS <span>05</span></div>${missions.map((m, i) => `<button class="mission-link ${m.id === missionId ? 'selected' : ''}" data-mission="${m.id}" aria-current="${m.id === missionId ? 'step' : 'false'}"><span class="step-no">${reportedOne(student, m.id) ? '✓' : `0${i + 1}`}</span><span><strong>${h(m.title)}</strong><small>${h(resultText(latest(student, m.id)))}</small></span><span class="chevron">›</span></button>`).join('')}<div class="sidebar-tip"><strong>천천히, 하나씩.</strong><p>잘 안 되면 센서 값과 조건을 다시 살펴보세요. 실패한 실험도 좋은 기록이에요.</p></div></aside>
    <section class="mission-detail" aria-label="선택한 미션"><div class="mission-heading"><span class="eyebrow">${mission.time} · ${mission.label}</span><span class="mission-icon" aria-hidden="true">${mission.icon}</span><h2>${mission.title}</h2><p>${mission.goal}</p></div>
    <div class="mission-body"><h3><span class="tiny-icon">↗</span> 이렇게 도전해요</h3><ol class="steps">${mission.steps.map(s => `<li>${h(s)}</li>`).join('')}</ol>
    <div class="safety"><strong>주행 전 꼭 확인!</strong> 낮은 속도로 시작하고, 엔트리에서 바로 정지할 수 있게 준비하세요.</div>
    <details><summary>막혔을 때, 힌트 보기 <span>＋</span></summary><p>${mission.hint}</p></details>
    <details><summary>코드 흐름 살펴보기 <span>＋</span></summary><p class="muted">설명용 의사코드예요. 실제 엔트리 블록명과 달라요. 장비·인식 기능은 선생님께 확인하세요.</p><pre><code>${h(mission.code)}</code></pre></details>
    <div class="record-heading"><h3>나의 실험 기록</h3>${badge(resultText(attempt), attempt?.status === 'reviewed' ? 'green' : '')}</div>
    ${attempt?.status === 'in_progress' ? `<form id="complete-form"><fieldset><legend>직접 실행한 뒤 확인해 주세요</legend>${mission.checks.map((c, i) => `<label class="check-row"><input type="checkbox" name="check${i}" ${draft.checks[i] ? 'checked' : ''} required> ${h(c)}</label>`).join('')}</fieldset><label class="field-label" for="experiment-note">${h(mission.prompt)}</label><textarea id="experiment-note" maxlength="2000" required placeholder="예상과 달랐던 점, 바꾼 값, 실제 결과를 적어 보세요.">${h(draft.note)}</textarea><p class="micro">입력 중 내용은 현재 탭에만 임시 보관돼요. 완료 요청 후 브라우저에 저장돼요.</p><button class="primary" ${!running ? 'disabled' : ''}>미션 완료 요청 <span>↗</span></button></form>` : attempt ? `<div class="saved-record"><p>${h(attempt.note)}</p><small>완료 요청 · ${time(attempt.submittedAt)}</small>${attempt.feedback ? `<div class="feedback"><strong>선생님 피드백 · ${labels[attempt.result]}</strong><p>${h(attempt.feedback)}</p></div>` : '<p class="muted">선생님의 확인을 기다리고 있어요.</p>'}</div><button class="secondary" id="start-mission" ${!running || !student.retryAllowed ? 'disabled' : ''}>새 시도 시작</button>${!student.retryAllowed ? '<p class="micro">재시도는 교사 화면에서 허용할 수 있어요.</p>' : ''}` : `<p class="muted">엔트리에서 로봇을 연결하고 미션을 시작해 보세요.</p><button class="primary" id="start-mission" ${!student.ready || !running || (final && !student.retryAllowed) ? 'disabled' : ''}>미션 시작하기 <span>↗</span></button>`}
    <p class="micro">완료 요청은 학생의 보고이며, 자동 주행 검증이나 공식 통과 판정이 아니에요.</p></div></section></div>
    ${submissionView(student)} `;
}
function reportedOne(student, id) { return ['submitted', 'reviewed'].includes(latest(student, id)?.status); }
function submissionView(student) {
  const final = submission(student);
  const canSubmit = reported(student) === 5 && state.status === 'running' && (!final || student.retryAllowed || final.needsRevision);
  const chosen = fileDrafts.get(student.id);
  return `<section class="submission-card"><div><p class="eyebrow">FINISH YOUR JOURNEY</p><h2>다 했다면, 선생님께 보내요.</h2><p class="muted">엔트리 프로젝트를 파일로 저장하고 제출해 주세요.<br>완료 알림은 이 데모의 교사 화면에 표시돼요.</p><div class="submission-icon" aria-hidden="true">↑</div></div><div>${final ? `<div class="submission-receipt">${badge(final.review ? labels[final.review] : '제출 완료 · 교사 확인 대기', 'green')}<p><strong>${h(final.fileName)}</strong></p><p class="micro">제출 ${final.version} · ${time(final.at)} · ${(final.size / 1024).toFixed(1)} KiB</p>${final.needsRevision ? '<p>새 시도가 있어 재제출이 필요해요.</p>' : ''}${final.feedback ? `<div class="feedback"><strong>선생님 피드백</strong><p>${h(final.feedback)}</p></div>` : ''}</div>` : ''}<form id="submit-form"><label class="upload-zone" for="entry-file"><span>＋</span><strong>엔트리 파일 선택</strong><small>.ent · 최대 20 MiB · 실제 형식 검증 전 데모</small><input id="entry-file" name="file" type="file" accept=".ent" ${!canSubmit ? 'disabled' : ''}></label><p id="chosen-file" class="micro">${chosen ? h(chosen.name) : '파일 선택 후 최종 제출을 눌러 주세요.'}</p><label for="final-note" class="field-label">선생님께 남길 말</label><textarea id="final-note" maxlength="2000" placeholder="완성한 점과 어려웠던 점을 적어 주세요." ${!canSubmit ? 'disabled' : ''}>${h(drafts.get(`${student.id}/final`) || '')}</textarea><button class="primary" ${!canSubmit ? 'disabled' : ''}>선생님께 최종 제출 <span>↗</span></button><p class="micro">${reported(student) < 5 ? '모든 미션의 완료 요청을 마치면 제출할 수 있어요.' : final && !canSubmit ? '재제출은 선생님의 허가가 필요해요.' : '파일은 이 브라우저에만 저장돼요. 다른 기기로 전송되지 않아요.'}</p></form></div></section>`;
}
function teacherView() {
  const students = state.students;
  const finals = students.filter(s => submission(s));
  const pending = finals.filter(s => !submission(s).review || submission(s).needsRevision);
  const ready = students.filter(s => s.ready).length;
  const pupil = students.find(s => s.id === selected);
  const list = students.filter(s => tab === 'all' || (tab === 'submitted' ? submission(s) && !submission(s).review : reported(s) < 5));
  return `<section class="teacher-intro"><div><p class="eyebrow">TEACHER’S DESK</p><h1>우리 반의 도전, 한눈에.</h1><p class="muted">학생의 진행 기록을 살펴보고, 직접 확인한 결과를 남겨 주세요.</p></div><div class="session-controls">${badge(labels[state.status], state.status === 'running' ? 'green' : 'amber')}<div>${state.status === 'lobby' ? '<button class="primary" data-session="running">시험 시작</button>' : state.status === 'running' ? '<button class="secondary" data-session="paused">일시정지</button>' : state.status === 'paused' ? '<button class="primary" data-session="running">시험 재개</button>' : ''}${['running', 'paused'].includes(state.status) ? '<button class="danger" data-session="ended">시험 종료</button>' : ''}</div></div></section>
    <div class="metrics"><article><span>함께하는 학생</span><strong>${students.length}<small>명</small></strong><p>체험 학급 · 1학년 2반</p></article><article><span>준비 완료</span><strong>${ready}<small> / ${students.length}</small></strong><p>학생이 직접 체크한 준비 상태</p></article><article class="accent"><span>최종 제출 확인 대기</span><strong>${pending.length}<small>명</small></strong><p>파일과 수행 기록을 확인해 주세요</p></article><article><span>파일 확인 완료</span><strong>${finals.filter(s => submission(s).review === 'complete' && !submission(s).needsRevision).length}<small>명</small></strong><p>주행 통과 판정과는 별도예요</p></article></div>
    <div class="callout">실시간 진행은 이 브라우저에서 학생이 기록한 상태예요. 실제 로봇과 엔트리 내부 동작은 자동 확인하지 않아요.${['paused','ended'].includes(state.status) ? ' 엔트리에서도 로봇을 정지해 주세요.' : ''}</div>
    <section class="panel"><div class="panel-title"><div><p class="eyebrow">CLASS PROGRESS</p><h2>미션 진행 현황</h2></div><div class="filters">${[['all','전체'],['submitted','제출 확인 대기'],['working','미션 진행 중']].map(([id, name]) => `<button class="${tab === id ? 'selected' : ''}" data-filter="${id}" aria-pressed="${tab === id}">${name}</button>`).join('')}</div></div><div class="table-scroll"><table><thead><tr><th scope="col">학생</th><th scope="col">준비</th><th scope="col">학생 보고 진행률</th><th scope="col">교사 확인</th><th scope="col">최종 파일</th><th scope="col">상세</th></tr></thead><tbody>${list.map(s => { const f = submission(s); return `<tr class="${s.id === selected ? 'selected-row' : ''}"><td><span class="student-dot">${String(s.number).padStart(2, '0')}</span>${h(s.name)}</td><td>${badge(s.ready ? '준비 완료' : '미확인', s.ready ? 'green' : '')}</td><td><div class="table-progress"><progress value="${reported(s)}" max="5" aria-label="${s.number}번 학생 보고 진행률"></progress><span>${reported(s)}/5</span></div></td><td>${reviewed(s)}/5</td><td>${f ? badge(f.needsRevision ? '재제출 필요' : f.review ? labels[f.review] : '확인 대기', f.review === 'complete' && !f.needsRevision ? 'green' : 'amber') : '<span class="muted">미제출</span>'}</td><td><button class="text-button" data-student="${s.id}">${f && !f.readAt ? '<span class="new-dot" aria-label="새 제출"></span>' : ''}기록 보기 ↗</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">해당하는 학생이 없어요.</td></tr>'}</tbody></table></div></section>
    <section class="panel student-inspector" id="student-detail"><div class="panel-title"><div><p class="eyebrow">STUDENT RECORD</p><h2>${pupil.number}번 · ${h(pupil.name)}</h2></div><button class="secondary" id="allow-retry">미션 재시도·파일 재제출 허용</button></div><p class="micro">교사 판정은 실제로 관찰한 뒤 남겨 주세요. 파일 확인만으로 주행 통과를 만들지 않아요.</p>
    <div class="review-grid">${missions.map(m => { const a = latest(pupil,m.id); return `<article class="review-item"><span class="eyebrow">${m.time}</span><h3>${m.title}</h3>${badge(resultText(a))}${a ? `<p class="micro">시도 ${a.number} · ${time(a.submittedAt || a.startedAt)}</p><p class="student-note">${h(a.note || '아직 실험 기록이 없어요.')}</p>${['submitted','reviewed'].includes(a.status) ? `<form data-review="${m.id}" data-attempt="${a.id}"><label class="field-label">관찰 결과<select name="result" required><option value="">판정 선택</option>${[['pass','통과'],['not_yet','미달'],['inconclusive','판단 보류']].map(([v,l]) => `<option value="${v}" ${(drafts.get(`reviewResult/${pupil.id}/${a.id}`) ?? a.result) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="field-label">판정 근거·피드백<textarea name="feedback" required maxlength="2000">${h(drafts.get(`review/${pupil.id}/${a.id}`) ?? a.feedback)}</textarea></label><button class="secondary">판정 저장</button></form>` : ''}<details><summary>시도 이력</summary>${pupil.attempts[m.id].map(v => `<p class="micro">시도 ${v.number} · ${h(resultText(v))}<br>${h(v.feedback || v.note)}</p>`).join('')}</details>` : '<p class="muted">아직 시작하지 않았어요.</p>'}</article>`; }).join('')}</div>
    ${teacherSubmission(pupil)}</section>`;
}
function teacherSubmission(student) {
  const f = submission(student);
  if (!f) return '<div class="empty"><h3>최종 제출을 기다리고 있어요.</h3><p>학생이 모든 미션을 완료 요청하고 파일을 제출하면 여기에 표시돼요.</p></div>';
  return `<div class="teacher-submission"><div><p class="eyebrow">FINAL SUBMISSION · VERSION ${f.version}</p><h3>${h(f.fileName)}</h3><p>${time(f.at)} · ${(f.size/1024).toFixed(1)} KiB</p><p>${h(f.note || '학생 설명 없음')}</p><button class="secondary" data-download="${f.id}">파일 다운로드 ↓</button>${!f.readAt ? `<button class="text-button" data-read="${f.id}">알림 읽음 처리</button>` : badge('알림 확인함')}<p class="micro">다운로드 후 엔트리에서 확인해 주세요. 파일은 웹에서 실행하지 않아요.</p></div><form id="file-review" data-submission="${f.id}"><label class="field-label">파일 검토 결과<select name="result" required><option value="">선택해 주세요</option><option value="complete" ${(drafts.get(`fileResult/${f.id}`) ?? f.review) === 'complete' ? 'selected' : ''}>확인 완료</option><option value="needs_revision" ${(drafts.get(`fileResult/${f.id}`) ?? f.review) === 'needs_revision' ? 'selected' : ''}>보완 요청·재제출 허용</option></select></label><label class="field-label">검토 근거·피드백<textarea name="feedback" maxlength="2000" required>${h(drafts.get(`fileReview/${f.id}`) ?? f.feedback)}</textarea></label><button class="primary">파일 검토 저장</button></form><details class="submission-history"><summary>이전 제출 파일 · ${student.submissions.length}개</summary>${student.submissions.map(v => `<p>제출 ${v.version} · ${h(v.fileName)} · ${time(v.at)} <button class="text-button" data-download="${v.id}">다운로드</button></p>`).join('')}</details></div>`;
}
function bind() {
  root.querySelectorAll('[data-role]').forEach(el => el.onclick = () => { role = el.dataset.role; sessionStorage.setItem('hamster-role', role); render(); });
  document.querySelector('#student-select')?.addEventListener('change', e => { studentId = e.target.value; sessionStorage.setItem('hamster-student', studentId); render(); });
  root.querySelectorAll('[data-mission]').forEach(el => el.onclick = () => { missionId = el.dataset.mission; render(); });
  root.querySelectorAll('[data-session]').forEach(el => el.onclick = () => { if (el.dataset.session !== 'ended' || confirm('시험을 종료할까요? 종료 후에는 기록을 제출할 수 없어요. 엔트리에서도 로봇을 정지해 주세요.')) act('session', { status: el.dataset.session }); });
  document.querySelector('#ready-form')?.addEventListener('submit', e => { e.preventDefault(); act('ready'); });
  document.querySelector('#start-mission')?.addEventListener('click', () => act('start', { missionId }));
  const complete = document.querySelector('#complete-form');
  complete?.addEventListener('input', () => drafts.set(`${studentId}/${missionId}`, { note: complete.querySelector('textarea').value, checks: [...complete.querySelectorAll('input[type="checkbox"]')].map(e => e.checked) }));
  complete?.addEventListener('submit', e => { e.preventDefault(); act('complete', { missionId, attemptId: latest(state.students.find(s => s.id === studentId), missionId).id, ...savedDraft() }); });
  document.querySelector('#entry-file')?.addEventListener('change', e => { const file = e.target.files[0]; try { validateFile(file); fileDrafts.set(studentId, file); document.querySelector('#chosen-file').textContent = `${file.name} · ${(file.size/1024).toFixed(1)} KiB · 최종 제출 전`; } catch(error) { fileDrafts.delete(studentId); e.target.value = ''; document.querySelector('#chosen-file').textContent = '파일을 다시 선택해 주세요.'; announce(error.message, true); } });
  document.querySelector('#final-note')?.addEventListener('input', e => drafts.set(`${studentId}/final`, e.target.value));
  document.querySelector('#submit-form')?.addEventListener('submit', e => { e.preventDefault(); const file = fileDrafts.get(studentId); act('submit', { file: file ? { name: file.name, size: file.size, type: file.type } : null, note: drafts.get(`${studentId}/final`) || '' }, file); });
  root.querySelectorAll('[data-filter]').forEach(el => el.onclick = () => { tab = el.dataset.filter; render(); });
  root.querySelectorAll('[data-student]').forEach(el => el.onclick = () => { selected = el.dataset.student; render(); document.querySelector('#student-detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  document.querySelector('#allow-retry')?.addEventListener('click', () => act('retry', { studentId: selected }));
  root.querySelectorAll('[data-review]').forEach(form => {
    form.querySelector('select').addEventListener('change', e => drafts.set(`reviewResult/${selected}/${form.dataset.attempt}`, e.target.value));
    form.querySelector('textarea').addEventListener('input', e => drafts.set(`review/${selected}/${form.dataset.attempt}`, e.target.value));
    form.addEventListener('submit', e => { e.preventDefault(); act('review', { studentId: selected, missionId: form.dataset.review, attemptId: form.dataset.attempt, result: form.elements.result.value, feedback: form.elements.feedback.value }); });
  });
  root.querySelectorAll('[data-download]').forEach(el => el.onclick = async () => { try { const file = await getFile(el.dataset.download); if (!file) throw new Error('이 브라우저에서 파일을 찾을 수 없어요.'); const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); } catch(error) { announce(error.message, true); } });
  root.querySelectorAll('[data-read]').forEach(el => el.onclick = () => act('read', { studentId: selected, submissionId: el.dataset.read }));
  const fileReview = document.querySelector('#file-review');
  fileReview?.querySelector('select')?.addEventListener('change', e => drafts.set(`fileResult/${fileReview.dataset.submission}`, e.target.value));
  fileReview?.querySelector('textarea')?.addEventListener('input', e => drafts.set(`fileReview/${fileReview.dataset.submission}`, e.target.value));
  fileReview?.addEventListener('submit', e => { e.preventDefault(); act('reviewFile', { studentId: selected, submissionId: fileReview.dataset.submission, result: fileReview.elements.result.value, feedback: fileReview.elements.feedback.value }); });
  document.querySelector('#reset-demo').onclick = async () => { if (confirm('이 브라우저의 모든 체험 기록과 제출 파일을 삭제할까요?')) { try { await reset(); drafts.clear(); fileDrafts.clear(); await refresh(); } catch(error) { announce(error.message, true); } } };
}
subscribe(async () => { try { await refresh(); announce('다른 탭의 체험 기록을 반영했어요.'); } catch(error) { announce(error.message, true); } });
refresh().catch(error => { root.textContent = `앱을 열지 못했어요. ${error.message}`; });
