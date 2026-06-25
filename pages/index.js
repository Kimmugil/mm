import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';

const STORAGE_KEY = 'mm-planner-v1';
const MONTH_KEY   = 'mm-planner-month';
const CHART_KEY   = 'mm-planner-chart';

const PALETTE = [
  '#4F86C6','#5BAD6F','#E07B54','#9B59B6','#E8B84B',
  '#1ABC9C','#E74C3C','#3498DB','#F39C12','#27AE60',
  '#8E44AD','#16A085','#D35400','#2980B9','#C0392B',
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
function getWorkingDays(ym) {
  if (!ym) return 0;
  const [y, m] = ym.split('-').map(Number);
  const total = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= total; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

// ── Tooltip ───────────────────────────────────────────
function Tooltip({ text, children }) {
  return (
    <span className="tt-wrap">
      {children}
      <span className="tt-box">{text}</span>
    </span>
  );
}
function Help({ text }) {
  return (
    <Tooltip text={text}>
      <span className="help-icon" aria-label="도움말">?</span>
    </Tooltip>
  );
}

// ── Donut (Pie) chart ─────────────────────────────────
function DonutChart({ tasks, totalWeight }) {
  const [hov, setHov] = useState(null);
  const CX = 120, CY = 120, R = 105, IR = 60;
  let angle = -Math.PI / 2;

  const slices = tasks.map((task, i) => {
    const ratio = totalWeight > 0 ? task.weight / totalWeight : 1 / tasks.length;
    const sweep = ratio * Math.PI * 2;
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    const lg = sweep > Math.PI ? 1 : 0;
    const x1 = CX + R * Math.cos(a0),  y1 = CY + R * Math.sin(a0);
    const x2 = CX + R * Math.cos(a1),  y2 = CY + R * Math.sin(a1);
    const xi1 = CX + IR * Math.cos(a0), yi1 = CY + IR * Math.sin(a0);
    const xi2 = CX + IR * Math.cos(a1), yi2 = CY + IR * Math.sin(a1);
    const d = `M${f(x1)} ${f(y1)} A${R} ${R} 0 ${lg} 1 ${f(x2)} ${f(y2)} L${f(xi2)} ${f(yi2)} A${IR} ${IR} 0 ${lg} 0 ${f(xi1)} ${f(yi1)}Z`;
    return { id: task.id, d, color: PALETTE[i % PALETTE.length], ratio, name: task.name || `항목 ${i + 1}` };
  });

  const hSlice = hov != null ? slices.find(s => s.id === hov) : null;

  return (
    <div className="pie-wrap">
      <svg viewBox="0 0 240 240" className="pie-svg">
        {slices.map(s => (
          <path
            key={s.id}
            d={s.d}
            fill={s.color}
            stroke="#fff"
            strokeWidth="1.5"
            style={{ opacity: hov == null || hov === s.id ? 1 : 0.5, cursor: 'default', transition: 'opacity 0.15s' }}
            onMouseEnter={() => setHov(s.id)}
            onMouseLeave={() => setHov(null)}
          />
        ))}
        <circle cx={CX} cy={CY} r={IR - 1} fill="white" />
        {hSlice ? (
          <>
            <text x={CX} y={CY - 7} textAnchor="middle" fontSize="17" fontWeight="700" fill="#1a1d23">{hSlice.ratio.toFixed(2)}</text>
            <text x={CX} y={CY + 12} textAnchor="middle" fontSize="10.5" fill="#7a8494">{trunc(hSlice.name, 9)}</text>
          </>
        ) : (
          <>
            <text x={CX} y={CY - 7} textAnchor="middle" fontSize="18" fontWeight="700" fill="#1a1d23">1.00</text>
            <text x={CX} y={CY + 12} textAnchor="middle" fontSize="11" fill="#7a8494">MM</text>
          </>
        )}
      </svg>
      <div className="pie-hover-row" style={{ visibility: hSlice ? 'visible' : 'hidden' }}>
        {hSlice && (
          <>
            <span className="color-dot" style={{ backgroundColor: hSlice.color }} />
            <span>{hSlice.name}</span>
            <strong>{hSlice.ratio.toFixed(2)} MM</strong>
            <span className="muted">({(hSlice.ratio * 100).toFixed(1)}%)</span>
          </>
        )}
        &nbsp;
      </div>
    </div>
  );
}

// ── Vertical stacked bar ──────────────────────────────
function VertBar({ tasks, totalWeight, onDragStart }) {
  const trackRef = useRef(null);
  return (
    <div className="vbar-track" ref={trackRef}>
      {tasks.map((task, i) => {
        const ratio = totalWeight > 0 ? task.weight / totalWeight : 1 / tasks.length;
        const pct = ratio * 100;
        const isLast = i === tasks.length - 1;
        const color = PALETTE[i % PALETTE.length];
        const label = task.name || `항목 ${i + 1}`;
        return (
          <div
            key={task.id}
            className="vbar-seg"
            style={{ height: `${pct}%`, backgroundColor: color }}
            title={`${label}: ${ratio.toFixed(2)} MM (${pct.toFixed(1)}%)`}
          >
            {pct > 5 && (
              <span className="vbar-label">
                {pct > 11 && <span className="vbar-name">{label}</span>}
                <span className="vbar-mm">{ratio.toFixed(2)}</span>
              </span>
            )}
            {!isLast && (
              <div className="vbar-handle" onMouseDown={e => onDragStart(e, i, trackRef)}>
                <div className="vbar-grip" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function f(n) { return n.toFixed(2); }
function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// ── Main ──────────────────────────────────────────────
export default function MMPlanner() {
  const [tasks,      setTasks]      = useState([]);
  const [ready,      setReady]      = useState(false);
  const [month,      setMonth]      = useState('');
  const [chartType,  setChartType]  = useState('bar');
  const [isDragging, setIsDragging] = useState(false);
  const [daysMode,   setDaysMode]   = useState(false);
  const [guideText,  setGuideText]  = useState('');

  // admin state
  const [adminOpen,   setAdminOpen]   = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [pwInput,     setPwInput]     = useState('');
  const [pwError,     setPwError]     = useState('');
  const [editGuide,   setEditGuide]   = useState('');
  const [saving,      setSaving]      = useState(false);
  const [savedOk,     setSavedOk]     = useState(false);

  // init
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      setTasks(Array.isArray(parsed) && parsed.length ? parsed : defaultTasks());
      setMonth(localStorage.getItem(MONTH_KEY) || currentYearMonth());
      setChartType(localStorage.getItem(CHART_KEY) || 'bar');
    } catch {
      setTasks(defaultTasks());
      setMonth(currentYearMonth());
    }
    setReady(true);
  }, []);

  useEffect(() => { if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }, [tasks, ready]);
  useEffect(() => { if (ready && month) localStorage.setItem(MONTH_KEY, month); }, [month, ready]);
  useEffect(() => { if (ready) localStorage.setItem(CHART_KEY, chartType); }, [chartType, ready]);

  useEffect(() => {
    fetch('/api/guide').then(r => r.json()).then(d => setGuideText(d.text || '')).catch(() => {});
  }, []);

  const workingDays = getWorkingDays(month);
  const dayMM  = workingDays > 0 ? 1 / workingDays : 0;
  const hourMM = dayMM / 8;
  const totalWeight = tasks.reduce((s, t) => s + t.weight, 0);
  const mm = w => totalWeight > 0 ? w / totalWeight : 0;

  function addTask()          { setTasks(p => [...p, { id: uid(), name: '', weight: 1, days: '' }]); }
  function removeTask(id)     { setTasks(p => p.filter(t => t.id !== id)); }
  function updateName(id, v)  { setTasks(p => p.map(t => t.id === id ? { ...t, name: v } : t)); }
  function equalizeAll()      { setTasks(p => p.map(t => ({ ...t, weight: 1, days: '' }))); }

  function updateDays(id, val) {
    const n = parseFloat(val);
    setTasks(p => p.map(t =>
      t.id === id ? { ...t, days: val, weight: !isNaN(n) && n > 0 ? n : t.weight } : t
    ));
  }
  function applyDays() {
    setTasks(p => p.map(t => {
      const n = parseFloat(t.days);
      return !isNaN(n) && n > 0 ? { ...t, weight: n } : t;
    }));
  }

  const handleVDrag = useCallback((e, idx, trackRef) => {
    e.preventDefault();
    const rect = trackRef.current.getBoundingClientRect();
    const startY = e.clientY;
    const sw = tasks.map(t => t.weight);
    const total = sw.reduce((s, w) => s + w, 0);
    const minW = total * MIN_RATIO;
    setIsDragging(true);

    const onMove = ev => {
      const dw = ((ev.clientY - startY) / rect.height) * total;
      const pair = sw[idx] + sw[idx + 1];
      const w0 = clamp(sw[idx] + dw, minW, pair - minW);
      setTasks(p => p.map((t, i) => {
        if (i === idx)     return { ...t, weight: w0,        days: '' };
        if (i === idx + 1) return { ...t, weight: pair - w0, days: '' };
        return t;
      }));
    };
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [tasks]);

  async function submitPw() {
    setPwError('');
    try {
      const res = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwInput }),
      });
      const d = await res.json();
      if (res.ok && d.authenticated) { setAdminAuthed(true); setEditGuide(guideText); }
      else setPwError(d.error || '오류가 발생했습니다.');
    } catch { setPwError('서버에 연결할 수 없습니다.'); }
  }

  async function saveGuide() {
    setSaving(true); setPwError('');
    try {
      const res = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwInput, text: editGuide }),
      });
      const d = await res.json();
      if (res.ok) {
        setGuideText(editGuide);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 2500);
      } else { setPwError(d.error || '저장에 실패했습니다.'); }
    } catch { setPwError('서버에 연결할 수 없습니다.'); }
    setSaving(false);
  }

  if (!ready) return null;

  const totalDays  = tasks.reduce((s, t) => { const n = parseFloat(t.days); return s + (isNaN(n) ? 0 : n); }, 0);
  const hasDays    = tasks.some(t => t.days !== '' && !isNaN(parseFloat(t.days)));
  const overBudget = totalDays > workingDays && workingDays > 0;

  return (
    <>
      <Head>
        <title>MM Planner</title>
        <link rel="icon" href="/icon.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <style>{`body{cursor:${isDragging ? 'row-resize' : 'default'}}`}</style>

      <div className="page">

        {/* ── Header ── */}
        <div className="header">
          <div className="header-top">
            <div>
              <h1>MM Planner</h1>
              <p className="header-sub">업무별 월간 공수(MM) 배분 도구 · 총합 1.00 MM</p>
            </div>
            <Tooltip text={`배분 기준이 되는 연월을 선택하세요.\n선택한 달의 평일 수에 따라 하루/시간 단위 MM 기준값이 자동으로 계산됩니다.`}>
              <div className="month-picker">
                <label>기준 월</label>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
              </div>
            </Tooltip>
          </div>

          {workingDays > 0 && (
            <div className="wd-row">
              <Tooltip text={`${formatMonth(month)}의 토·일을 제외한 평일 수입니다.\n공휴일은 자동으로 빠지지 않으므로 실제 근무 달력에 따라 조정이 필요할 수 있습니다.`}>
                <span className="wd-pill">업무일 <strong>{workingDays}일</strong></span>
              </Tooltip>
              <Tooltip text={`1 ÷ ${workingDays}일 = ${dayMM.toFixed(6)}\n1일(8시간) 근무를 기준으로 한 참고 수치입니다.\n실제 MM 배분은 업무 비중을 직접 조정하세요.`}>
                <span className="wd-pill">1일 <strong>{dayMM.toFixed(4)} MM</strong></span>
              </Tooltip>
              <Tooltip text={`${dayMM.toFixed(6)} ÷ 8시간 = ${hourMM.toFixed(6)}\n1시간 단위의 참고 수치입니다.`}>
                <span className="wd-pill">1시간 <strong>{hourMM.toFixed(5)} MM</strong></span>
              </Tooltip>
              <Tooltip text={`1일 MM × 5일(1주) = ${(dayMM * 5).toFixed(4)}\n5일 근무 기준 참고 수치입니다.`}>
                <span className="wd-pill">1주(5일) <strong>{(dayMM * 5).toFixed(4)} MM</strong></span>
              </Tooltip>
              <Help text={`위 수치는 ${formatMonth(month)} 평일 기준으로 계산된 참고값입니다.\n\n실제 MM 배분은 업무의 비중·난이도·집중도를 함께 고려해 왼쪽 차트를 직접 드래그하거나 일수를 입력해 조정하세요.\n\n⚠️ 여러 업무가 있을 때 각 업무에 투입한 일수의 비율로 1.00 MM을 나눠 갖는 구조입니다.`} />
            </div>
          )}
        </div>

        {/* ── Guide text (admin-editable) ── */}
        {guideText && (
          <div className="guide-box">
            <span className="guide-icon">📌</span>
            <pre className="guide-text">{guideText}</pre>
          </div>
        )}

        {/* ── Main 2-col grid ── */}
        {tasks.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">≡</div>
            <p>업무를 추가하면 차트가 표시됩니다.</p>
            <button className="add-btn" style={{ marginTop: 16 }} onClick={addTask}>+ 업무 추가</button>
          </div>
        ) : (
          <div className="main-grid">

            {/* Left: Chart */}
            <div className="chart-panel">
              <div className="chart-toggle-row">
                <Tooltip text="세로 막대 차트입니다. 구분선을 위아래로 드래그해 비율을 조정하세요.">
                  <button
                    className={`chart-tab${chartType === 'bar' ? ' active' : ''}`}
                    onClick={() => setChartType('bar')}
                  >막대</button>
                </Tooltip>
                <Tooltip text="원형(도넛) 차트입니다. 각 항목에 마우스를 올리면 상세 수치를 확인할 수 있습니다.">
                  <button
                    className={`chart-tab${chartType === 'pie' ? ' active' : ''}`}
                    onClick={() => setChartType('pie')}
                  >원형</button>
                </Tooltip>
              </div>

              {chartType === 'bar' ? (
                <>
                  <VertBar tasks={tasks} totalWeight={totalWeight} onDragStart={handleVDrag} />
                  {tasks.length > 1 && (
                    <p className="chart-hint">↕ 구분선을 드래그해 비율 조정</p>
                  )}
                </>
              ) : (
                <DonutChart tasks={tasks} totalWeight={totalWeight} />
              )}
            </div>

            {/* Right: Task list */}
            <div className="task-panel">
              <div className="card">
                <div className="card-header">
                  <span>
                    업무 목록
                    <Help text="업무 이름을 클릭하면 바로 편집할 수 있습니다. × 버튼으로 항목을 삭제하세요." />
                  </span>
                  <div className="card-header-right">
                    <Tooltip text="모든 항목을 동일한 비율로 초기화합니다.">
                      <button className="equalize-btn" onClick={equalizeAll}>균등 배분</button>
                    </Tooltip>
                    <Tooltip text="각 업무에 소요 일수를 입력하면 해당 달 업무일수 기준으로 MM 비율을 자동 계산합니다.">
                      <button className={`mode-btn${daysMode ? ' active' : ''}`} onClick={() => setDaysMode(v => !v)}>
                        일수 입력
                      </button>
                    </Tooltip>
                  </div>
                </div>

                {daysMode && workingDays > 0 && (
                  <div className="days-guide-bar">
                    <span>
                      {formatMonth(month)} 업무일 <strong>{workingDays}일</strong>
                      &nbsp;·&nbsp;1일 = <strong>{dayMM.toFixed(4)} MM</strong>
                    </span>
                    <Help text={`소요 일수를 입력하면 '${formatMonth(month)} 업무일 ${workingDays}일 기준'으로 MM을 계산해 미리 보여줍니다.\n'비율 적용' 버튼을 눌러야 차트에 반영됩니다.\n\n일수 합계가 ${workingDays}일을 초과해도 비율만 반영되며 총합은 항상 1.00 MM을 유지합니다.`} />
                  </div>
                )}

                {tasks.map((task, i) => {
                  const ratio = mm(task.weight);
                  const pct   = ratio * 100;
                  const dn    = parseFloat(task.days);
                  const dayPv = (!isNaN(dn) && dn > 0 && workingDays > 0) ? dn / workingDays : null;

                  return (
                    <div key={task.id} className="task-row">
                      <div className="color-dot" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                      <input
                        className="task-name-input"
                        value={task.name}
                        onChange={e => updateName(task.id, e.target.value)}
                        placeholder={`항목 ${i + 1}`}
                      />
                      {daysMode ? (
                        <div className="days-inp-wrap">
                          <input
                            type="number"
                            className="days-inp"
                            value={task.days}
                            onChange={e => updateDays(task.id, e.target.value)}
                            placeholder="0"
                            min="0.5"
                            step="0.5"
                          />
                          <span className="days-unit">일</span>
                          {dayPv != null && <span className="days-preview">= {dayPv.toFixed(2)} MM</span>}
                        </div>
                      ) : (
                        <>
                          <div className="task-stats">
                            <span className="task-mm">{ratio.toFixed(2)}</span>
                            <span className="task-pct">{pct.toFixed(1)}%</span>
                          </div>
                          <div className="task-mini-bar">
                            <div className="task-mini-fill" style={{ width: `${pct}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
                          </div>
                        </>
                      )}
                      <button className="remove-btn" onClick={() => removeTask(task.id)}>×</button>
                    </div>
                  );
                })}

                {daysMode && hasDays && workingDays > 0 && (
                  <div className="days-summary">
                    <span>
                      입력 합계 <strong>{totalDays}</strong>일 / {workingDays}일
                      {overBudget && <span className="days-over"> (업무일 초과)</span>}
                    </span>
                    <span className="days-sum-mm">
                      MM 합계 기준: <strong>{(totalDays / workingDays).toFixed(4)}</strong>
                      <Help text="비율 적용 시 입력된 일수의 비율만 사용되며 총합은 1.00 MM으로 유지됩니다." />
                    </span>
                  </div>
                )}
              </div>

              <div className="task-footer">
                <button className="add-btn" onClick={addTask}>+ 업무 추가</button>
                <div className="footer-right">
                  {daysMode && hasDays && (
                    <Tooltip text="입력한 일수 비율을 차트에 반영합니다. 총합은 1.00 MM으로 유지됩니다.">
                      <button className="apply-btn" onClick={applyDays}>일수 기준 적용 →</button>
                    </Tooltip>
                  )}
                  <div className="total-badge">
                    합계 <strong>{tasks.length > 0 ? '1.00' : '0.00'}</strong> MM
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Admin: guide text editor ── */}
        <div className="admin-section">
          <button className="admin-toggle" onClick={() => setAdminOpen(v => !v)}>
            <span>{adminAuthed ? '🔓' : '🔒'}</span>
            안내 텍스트 관리
            <span className="chevron">{adminOpen ? '▲' : '▼'}</span>
          </button>

          {adminOpen && (
            <div className="admin-body">
              {!adminAuthed ? (
                <div className="pw-form">
                  <p className="pw-desc">관리자 비밀번호를 입력하면 페이지 상단에 표시되는 안내 텍스트를 수정할 수 있습니다.</p>
                  <div className="pw-row">
                    <input
                      type="password"
                      className={`pw-input${pwError ? ' error' : ''}`}
                      value={pwInput}
                      onChange={e => { setPwInput(e.target.value); setPwError(''); }}
                      onKeyDown={e => e.key === 'Enter' && submitPw()}
                      placeholder="비밀번호"
                      autoFocus
                    />
                    <button className="pw-btn" onClick={submitPw}>확인</button>
                  </div>
                  {pwError && <p className="pw-error">{pwError}</p>}
                </div>
              ) : (
                <div className="guide-edit">
                  <p className="guide-edit-desc">
                    아래 내용은 페이지 상단에 <strong>모든 사용자에게</strong> 표시됩니다.
                    비워두면 안내 박스가 숨겨집니다.
                  </p>
                  <textarea
                    className="guide-textarea"
                    value={editGuide}
                    onChange={e => setEditGuide(e.target.value)}
                    rows={5}
                    placeholder="공지사항, 작성 지침, 주의사항 등을 입력하세요..."
                  />
                  <div className="guide-edit-footer">
                    <button className="save-btn" onClick={saveGuide} disabled={saving}>
                      {saving ? '저장 중…' : savedOk ? '✓ 저장됨' : '저장'}
                    </button>
                    {pwError && <span className="pw-error">{pwError}</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </>
  );
}
