import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';

const STORAGE_KEY = 'mm-planner-v1';
const MEMO_KEY = 'mm-planner-memo';
const MONTH_KEY = 'mm-planner-month';

const PALETTE = [
  '#4F86C6', '#5BAD6F', '#E07B54', '#9B59B6', '#E8B84B',
  '#1ABC9C', '#E74C3C', '#3498DB', '#F39C12', '#27AE60',
  '#8E44AD', '#16A085', '#D35400', '#2980B9', '#C0392B',
];

const MIN_RATIO = 0.02;

let _uid = Date.now();
function uid() { return ++_uid; }

function defaultTasks() {
  return [
    { id: uid(), name: '업무 항목 1', weight: 1, days: '' },
    { id: uid(), name: '업무 항목 2', weight: 1, days: '' },
  ];
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${y}년 ${parseInt(m, 10)}월`;
}

function getWorkingDays(yearMonth) {
  if (!yearMonth) return 0;
  const [y, m] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export default function MMPlanner() {
  const [tasks, setTasks] = useState([]);
  const [ready, setReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [month, setMonth] = useState('');
  const [memo, setMemo] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [daysMode, setDaysMode] = useState(false);
  const barRef = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setTasks(parsed);
        else setTasks(defaultTasks());
      } else {
        setTasks(defaultTasks());
      }
      setMemo(localStorage.getItem(MEMO_KEY) || '');
      setMonth(localStorage.getItem(MONTH_KEY) || currentYearMonth());
    } catch {
      setTasks(defaultTasks());
      setMonth(currentYearMonth());
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(MEMO_KEY, memo);
  }, [memo, ready]);

  useEffect(() => {
    if (ready && month) localStorage.setItem(MONTH_KEY, month);
  }, [month, ready]);

  const workingDays = getWorkingDays(month);
  const dayMM = workingDays > 0 ? 1 / workingDays : 0;

  const totalWeight = tasks.reduce((s, t) => s + t.weight, 0);
  const mm = (w) => (totalWeight === 0 ? 0 : w / totalWeight);

  function addTask() {
    setTasks(prev => [...prev, { id: uid(), name: '', weight: 1, days: '' }]);
  }

  function removeTask(id) {
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  function updateName(id, name) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, name } : t));
  }

  function equalizeAll() {
    setTasks(prev => prev.map(t => ({ ...t, weight: 1, days: '' })));
  }

  function updateDays(id, rawVal) {
    const val = rawVal === '' ? '' : rawVal;
    const numDays = parseFloat(val);
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (val === '' || isNaN(numDays) || numDays <= 0) {
        return { ...t, days: val, weight: t.weight };
      }
      return { ...t, days: val, weight: numDays };
    }));
  }

  function applyAllDays() {
    setTasks(prev => prev.map(t => {
      const numDays = parseFloat(t.days);
      if (!isNaN(numDays) && numDays > 0) return { ...t, weight: numDays };
      return t;
    }));
  }

  const handleDragStart = useCallback((e, idx) => {
    e.preventDefault();
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const startX = e.clientX;
    const startWeights = tasks.map(t => t.weight);
    const total = startWeights.reduce((s, w) => s + w, 0);
    const minW = total * MIN_RATIO;

    setIsDragging(true);

    function onMove(ev) {
      const dw = ((ev.clientX - startX) / rect.width) * total;
      const pairTotal = startWeights[idx] + startWeights[idx + 1];
      const w0 = clamp(startWeights[idx] + dw, minW, pairTotal - minW);
      const w1 = pairTotal - w0;
      setTasks(prev => prev.map((t, i) => {
        if (i === idx) return { ...t, weight: w0, days: '' };
        if (i === idx + 1) return { ...t, weight: w1, days: '' };
        return t;
      }));
    }

    function onUp() {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [tasks]);

  function submitPassword() {
    const envPw = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
    if (!envPw) { setAdminAuthed(true); return; }
    if (pwInput === envPw) { setAdminAuthed(true); setPwError(false); }
    else setPwError(true);
  }

  const totalDaysEntered = tasks.reduce((s, t) => {
    const n = parseFloat(t.days);
    return s + (isNaN(n) ? 0 : n);
  }, 0);
  const daysEntered = tasks.filter(t => t.days !== '' && !isNaN(parseFloat(t.days)));

  if (!ready) return null;

  const hasAdminPw = !!process.env.NEXT_PUBLIC_ADMIN_PASSWORD;

  return (
    <>
      <Head>
        <title>MM Planner</title>
        <link rel="icon" href="/icon.png" />
        <meta name="description" content="월간 업무 공수 배분 도구" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <style>{`body { cursor: ${isDragging ? 'col-resize' : 'default'}; }`}</style>

      <div className="page">
        <div className="header">
          <div className="header-top">
            <div>
              <h1>MM Planner</h1>
              <p>업무별 월간 공수(MM) 배분 · 총합 1.00 MM</p>
            </div>
            <div className="month-picker">
              <label htmlFor="month-input">기준 월</label>
              <input
                id="month-input"
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
              />
            </div>
          </div>

          {workingDays > 0 && (
            <div className="working-days-info">
              <div className="wd-pills">
                <span className="wd-pill">
                  <span className="wd-pill-label">업무일</span>
                  <strong>{workingDays}일</strong>
                </span>
                <span className="wd-divider">·</span>
                <span className="wd-pill">
                  <span className="wd-pill-label">1일 MM</span>
                  <strong>{dayMM.toFixed(4)}</strong>
                </span>
                <span className="wd-divider">·</span>
                <span className="wd-pill">
                  <span className="wd-pill-label">1주(5일)</span>
                  <strong>{(dayMM * 5).toFixed(4)}</strong>
                </span>
              </div>
            </div>
          )}
        </div>

        {tasks.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">≡</div>
            <p>아래 버튼을 눌러 업무를 추가하세요.</p>
          </div>
        ) : (
          <div className="bar-wrap">
            <div className="bar-meta">
              <span>{formatMonth(month)} 공수 배분</span>
              <div className="bar-actions">
                <button
                  className={`mode-btn${daysMode ? ' mode-btn--active' : ''}`}
                  onClick={() => setDaysMode(v => !v)}
                  title="일수 입력 모드"
                >
                  일수 입력
                </button>
                <button className="equalize-btn" onClick={equalizeAll} title="균등 배분">
                  균등 배분
                </button>
              </div>
            </div>

            <div className="bar-track" ref={barRef} style={{ cursor: isDragging ? 'col-resize' : undefined }}>
              {tasks.map((task, i) => {
                const ratio = mm(task.weight);
                const pct = ratio * 100;
                const color = PALETTE[i % PALETTE.length];
                const isLast = i === tasks.length - 1;
                const label = task.name || `항목 ${i + 1}`;
                const showText = pct > 6;
                const showName = pct > 14;

                return (
                  <div
                    key={task.id}
                    className="bar-segment"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                    title={`${label}: ${ratio.toFixed(2)} MM (${pct.toFixed(1)}%)`}
                  >
                    {showText && (
                      <span className="seg-label">
                        {showName && <span className="seg-name">{label}</span>}
                        <span className="seg-mm">{ratio.toFixed(2)}</span>
                      </span>
                    )}
                    {!isLast && (
                      <div
                        className="drag-handle"
                        onMouseDown={(e) => handleDragStart(e, i)}
                        title="드래그해서 비율 조정"
                      >
                        <div className="drag-grip" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="bar-hint">← 구분선을 드래그해서 각 업무의 비율을 조정하세요 →</p>
          </div>
        )}

        {tasks.length > 0 && (
          <div className="card">
            <div className="card-header">
              <span>업무 목록</span>
              {daysMode ? (
                <div className="days-header-right">
                  {totalDaysEntered > 0 && (
                    <span className="days-total-hint">
                      입력 합계 {totalDaysEntered}일 / {workingDays}일
                      {totalDaysEntered > workingDays && (
                        <span className="days-over"> (초과)</span>
                      )}
                    </span>
                  )}
                  {daysEntered.length > 0 && (
                    <button className="apply-days-btn" onClick={applyAllDays}>
                      비율 적용
                    </button>
                  )}
                </div>
              ) : (
                <span className="card-header-hint">이름 클릭해 편집 · 바 드래그로 비율 조정</span>
              )}
            </div>

            {daysMode && workingDays > 0 && (
              <div className="days-guide">
                <span>
                  {formatMonth(month)} 업무일 <strong>{workingDays}일</strong> 기준
                  &nbsp;·&nbsp; 1일 = <strong>{dayMM.toFixed(4)} MM</strong>
                </span>
                <span className="days-guide-hint">각 업무에 소요 일수를 입력하면 MM이 자동 계산됩니다</span>
              </div>
            )}

            {tasks.map((task, i) => {
              const ratio = mm(task.weight);
              const pct = ratio * 100;
              const dayVal = parseFloat(task.days);
              const daysMM = !isNaN(dayVal) && dayVal > 0 && workingDays > 0
                ? dayVal / workingDays
                : null;

              return (
                <div key={task.id} className={`task-row${daysMode ? ' task-row--days' : ''}`}>
                  <div className="color-dot" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                  <input
                    className="task-name-input"
                    value={task.name}
                    onChange={e => updateName(task.id, e.target.value)}
                    placeholder={`항목 ${i + 1}`}
                  />

                  {daysMode ? (
                    <div className="days-input-wrap">
                      <input
                        type="number"
                        className="days-input"
                        value={task.days}
                        onChange={e => updateDays(task.id, e.target.value)}
                        placeholder="0"
                        min="0.5"
                        step="0.5"
                      />
                      <span className="days-unit">일</span>
                      {daysMM !== null && (
                        <span className="days-preview">= {daysMM.toFixed(2)} MM</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="task-stats">
                        <span className="task-mm">{ratio.toFixed(2)}</span>
                        <span className="task-pct">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="task-bar-mini">
                        <div
                          className="task-bar-fill"
                          style={{ width: `${pct}%`, backgroundColor: PALETTE[i % PALETTE.length] }}
                        />
                      </div>
                    </>
                  )}

                  <button className="remove-btn" onClick={() => removeTask(task.id)} title="삭제">×</button>
                </div>
              );
            })}

            {daysMode && daysEntered.length > 0 && workingDays > 0 && (
              <div className="days-summary">
                <div className="days-summary-row">
                  {tasks.map((task, i) => {
                    const d = parseFloat(task.days);
                    if (isNaN(d) || d <= 0) return null;
                    const taskMM = d / workingDays;
                    return (
                      <div key={task.id} className="days-summary-item">
                        <div className="color-dot" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                        <span className="days-summary-name">{task.name || `항목 ${i + 1}`}</span>
                        <span className="days-summary-mm">{taskMM.toFixed(4)} MM</span>
                      </div>
                    );
                  })}
                </div>
                <div className="days-summary-total">
                  입력 일수 기준 총 MM합: <strong>{(totalDaysEntered / workingDays).toFixed(4)}</strong>
                  {Math.abs(totalDaysEntered / workingDays - 1) > 0.001 && (
                    <span className="days-summary-note">
                      &nbsp;(1.00 기준으로 비율만 반영됨)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="footer-row">
          <button className="add-btn" onClick={addTask}>+ 업무 추가</button>
          <div className="total-badge">
            합계 <strong>{tasks.length > 0 ? '1.00' : '0.00'}</strong> MM
          </div>
        </div>

        {/* ── Admin memo section ── */}
        <div className="admin-section">
          <button className="admin-toggle" onClick={() => setAdminOpen(o => !o)}>
            <span className="lock-icon">{adminAuthed ? '🔓' : '🔒'}</span>
            관리자 메모
            <span className="chevron">{adminOpen ? '▲' : '▼'}</span>
          </button>

          {adminOpen && (
            <div className="admin-body">
              {!adminAuthed ? (
                <div className="pw-form">
                  <p className="pw-desc">
                    {hasAdminPw
                      ? '관리자 비밀번호를 입력하세요.'
                      : '환경 변수가 설정되지 않았습니다. 비밀번호 없이 진행합니다.'}
                  </p>
                  {hasAdminPw && (
                    <>
                      <div className="pw-row">
                        <input
                          type="password"
                          className={`pw-input${pwError ? ' pw-input--error' : ''}`}
                          placeholder="비밀번호"
                          value={pwInput}
                          onChange={e => { setPwInput(e.target.value); setPwError(false); }}
                          onKeyDown={e => e.key === 'Enter' && submitPassword()}
                          autoFocus
                        />
                        <button className="pw-btn" onClick={submitPassword}>확인</button>
                      </div>
                      {pwError && <p className="pw-error">비밀번호가 올바르지 않습니다.</p>}
                    </>
                  )}
                  {!hasAdminPw && (
                    <button className="pw-btn" style={{ alignSelf: 'flex-start' }} onClick={submitPassword}>진입</button>
                  )}
                </div>
              ) : (
                <div className="memo-area">
                  <textarea
                    className="memo-textarea"
                    value={memo}
                    onChange={e => setMemo(e.target.value)}
                    placeholder="공지사항, 지침, 메모 등을 자유롭게 입력하세요.&#10;입력 내용은 이 브라우저에 저장됩니다."
                    rows={6}
                  />
                  <p className="memo-hint">내용은 자동으로 저장됩니다.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
