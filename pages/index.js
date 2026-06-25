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
// dir: 'up' | 'down' | 'left' | 'right'  (where the box appears relative to trigger)
// align: 'center' | 'start' | 'end'
function Tooltip({ text, children, dir = 'up', align = 'center' }) {
  return (
    <span className={`tt tt--${dir} tt--${align}`} data-tip={text}>
      {children}
    </span>
  );
}
function Help({ text, dir = 'up', align = 'center' }) {
  return (
    <Tooltip text={text} dir={dir} align={align}>
      <span className="help-icon" aria-label="도움말">?</span>
    </Tooltip>
  );
}

// ── Donut chart ───────────────────────────────────────
function DonutChart({ tasks, totalWeight }) {
  const [hov, setHov] = useState(null);
  const CX = 130, CY = 130, R = 115, IR = 65;
  let angle = -Math.PI / 2;

  const slices = tasks.map((task, i) => {
    const ratio = totalWeight > 0 ? task.weight / totalWeight : 1 / tasks.length;
    const sweep = ratio * Math.PI * 2;
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    const lg = sweep > Math.PI ? 1 : 0;
    const p = (a, r) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
    const [x1, y1] = p(a0, R), [x2, y2] = p(a1, R);
    const [xi1, yi1] = p(a0, IR), [xi2, yi2] = p(a1, IR);
    const d = `M${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 ${lg} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L${xi2.toFixed(2)} ${yi2.toFixed(2)} A${IR} ${IR} 0 ${lg} 0 ${xi1.toFixed(2)} ${yi1.toFixed(2)}Z`;
    return { id: task.id, d, color: PALETTE[i % PALETTE.length], ratio, name: task.name || `항목 ${i + 1}` };
  });

  const hs = hov != null ? slices.find(s => s.id === hov) : null;

  return (
    <div className="pie-wrap">
      <svg viewBox="0 0 260 260" className="pie-svg">
        {slices.map(s => (
          <path
            key={s.id} d={s.d} fill={s.color} stroke="#fff" strokeWidth="1.5"
            style={{ opacity: hov == null || hov === s.id ? 1 : 0.45, cursor: 'default', transition: 'opacity .15s' }}
            onMouseEnter={() => setHov(s.id)}
            onMouseLeave={() => setHov(null)}
          />
        ))}
        <circle cx={CX} cy={CY} r={IR - 1} fill="white" />
        {hs ? (
          <>
            <text x={CX} y={CY - 8} textAnchor="middle" fontSize="19" fontWeight="700" fill="#1a1d23">{hs.ratio.toFixed(2)}</text>
            <text x={CX} y={CY + 13} textAnchor="middle" fontSize="11.5" fill="#7a8494">{hs.name.length > 10 ? hs.name.slice(0, 9) + '…' : hs.name}</text>
          </>
        ) : (
          <>
            <text x={CX} y={CY - 8} textAnchor="middle" fontSize="22" fontWeight="700" fill="#1a1d23">1.00</text>
            <text x={CX} y={CY + 13} textAnchor="middle" fontSize="12" fill="#7a8494">MM</text>
          </>
        )}
      </svg>
      <div className="pie-info-row" style={{ visibility: hs ? 'visible' : 'hidden' }}>
        {hs && <>
          <span className="color-dot" style={{ backgroundColor: hs.color }} />
          <span className="pie-name">{hs.name}</span>
          <strong>{hs.ratio.toFixed(2)} MM</strong>
          <span className="muted">({(hs.ratio * 100).toFixed(1)}%)</span>
        </>}
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
        const pct   = ratio * 100;
        const isLast = i === tasks.length - 1;
        const color  = PALETTE[i % PALETTE.length];
        const label  = task.name || `항목 ${i + 1}`;
        return (
          <div
            key={task.id}
            className="vbar-seg"
            style={{ height: `${pct}%`, backgroundColor: color }}
            title={`${label}: ${ratio.toFixed(2)} MM (${pct.toFixed(1)}%)`}
          >
            {pct > 5 && (
              <span className="vbar-label">
                {pct > 10 && <span className="vbar-name">{label}</span>}
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

// ── Main ──────────────────────────────────────────────
export default function MMPlanner() {
  const [tasks,      setTasks]      = useState([]);
  const [ready,      setReady]      = useState(false);
  const [month,      setMonth]      = useState('');
  const [chartType,  setChartType]  = useState('bar');
  const [isDragging, setIsDragging] = useState(false);
  const [daysMode,   setDaysMode]   = useState(false);

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

  const workingDays = getWorkingDays(month);
  const dayMM  = workingDays > 0 ? 1 / workingDays : 0;
  const hourMM = dayMM / 8;
  const totalWeight = tasks.reduce((s, t) => s + t.weight, 0);
  const mm = w => totalWeight > 0 ? w / totalWeight : 0;

  function addTask()         { setTasks(p => [...p, { id: uid(), name: '', weight: 1, days: '' }]); }
  function removeTask(id)    { setTasks(p => p.filter(t => t.id !== id)); }
  function updateName(id, v) { setTasks(p => p.map(t => t.id === id ? { ...t, name: v } : t)); }
  function equalizeAll()     { setTasks(p => p.map(t => ({ ...t, weight: 1, days: '' }))); }

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
    const rect   = trackRef.current.getBoundingClientRect();
    const startY = e.clientY;
    const sw     = tasks.map(t => t.weight);
    const total  = sw.reduce((s, w) => s + w, 0);
    const minW   = total * MIN_RATIO;
    setIsDragging(true);

    const onMove = ev => {
      const dw   = ((ev.clientY - startY) / rect.height) * total;
      const pair = sw[idx] + sw[idx + 1];
      const w0   = clamp(sw[idx] + dw, minW, pair - minW);
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

  if (!ready) return null;

  const totalDays  = tasks.reduce((s, t) => { const n = parseFloat(t.days); return s + (isNaN(n) ? 0 : n); }, 0);
  const hasDays    = tasks.some(t => t.days !== '' && !isNaN(parseFloat(t.days)));
  const overBudget = workingDays > 0 && totalDays > workingDays;

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
            <div className="month-picker">
              <label>기준 월</label>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
            </div>
          </div>

          {workingDays > 0 && (
            <div className="wd-row">
              <Tooltip text={`${formatMonth(month)}의 토·일 제외 평일 수\n공휴일은 자동 제외되지 않습니다`} dir="down" align="start">
                <span className="wd-pill">업무일 <strong>{workingDays}일</strong></span>
              </Tooltip>
              <Tooltip text={`1 ÷ ${workingDays} = ${dayMM.toFixed(6)}\n하루 8시간 근무 기준 참고값`} dir="down" align="start">
                <span className="wd-pill">1일 <strong>{dayMM.toFixed(4)} MM</strong></span>
              </Tooltip>
              <Tooltip text={`${dayMM.toFixed(6)} ÷ 8 = ${hourMM.toFixed(6)}\n1시간 단위 참고값`} dir="down" align="start">
                <span className="wd-pill">1시간 <strong>{hourMM.toFixed(5)} MM</strong></span>
              </Tooltip>
              <Tooltip text={`1일 MM × 5 = ${(dayMM * 5).toFixed(4)}\n1주(5일) 기준 참고값`} dir="down" align="start">
                <span className="wd-pill">1주(5일) <strong>{(dayMM * 5).toFixed(4)} MM</strong></span>
              </Tooltip>
              <Help
                text={`위 수치는 ${formatMonth(month)} 평일 기준 참고값입니다.\n실제 배분은 업무 비중·난이도를 고려해 직접 조정하세요.\n일수 비율로 1.00 MM을 나눠 갖는 구조입니다.`}
                dir="down" align="end"
              />
            </div>
          )}
        </div>

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
                <Tooltip text="세로 막대 차트\n구분선을 드래그해 비율 조정" dir="down">
                  <button className={`chart-tab${chartType === 'bar' ? ' active' : ''}`} onClick={() => setChartType('bar')}>막대</button>
                </Tooltip>
                <Tooltip text="원형 도넛 차트\n각 항목에 마우스를 올리면 수치 확인" dir="down">
                  <button className={`chart-tab${chartType === 'pie' ? ' active' : ''}`} onClick={() => setChartType('pie')}>원형</button>
                </Tooltip>
              </div>

              {chartType === 'bar' ? (
                <>
                  <VertBar tasks={tasks} totalWeight={totalWeight} onDragStart={handleVDrag} />
                  {tasks.length > 1 && <p className="chart-hint">↕ 구분선을 드래그해 비율 조정</p>}
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
                    <Help text="항목 이름 클릭해 편집\n× 버튼으로 삭제" dir="down" align="start" />
                  </span>
                  <div className="card-header-right">
                    <Tooltip text="모든 항목을 동일 비율로 초기화" dir="down" align="end">
                      <button className="equalize-btn" onClick={equalizeAll}>균등 배분</button>
                    </Tooltip>
                    <Tooltip text="소요 일수 입력 → MM 자동 계산\n'적용' 버튼으로 차트에 반영" dir="down" align="end">
                      <button className={`mode-btn${daysMode ? ' active' : ''}`} onClick={() => setDaysMode(v => !v)}>일수 입력</button>
                    </Tooltip>
                  </div>
                </div>

                {daysMode && workingDays > 0 && (
                  <div className="days-guide-bar">
                    <span>
                      {formatMonth(month)} 업무일 <strong>{workingDays}일</strong>
                      &nbsp;·&nbsp;1일 = <strong>{dayMM.toFixed(4)} MM</strong>
                    </span>
                    <Help
                      text={`일수 입력 시 ${workingDays}일 기준으로 MM 계산\n합계가 ${workingDays}일 초과해도 비율만 반영, 총합은 1.00 유지`}
                      dir="up" align="end"
                    />
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
                      {overBudget && <span className="days-over"> 초과</span>}
                    </span>
                    <span className="days-sum-mm">
                      기준 MM 합: <strong>{(totalDays / workingDays).toFixed(4)}</strong>
                    </span>
                  </div>
                )}
              </div>

              <div className="task-footer">
                <button className="add-btn" onClick={addTask}>+ 업무 추가</button>
                <div className="footer-right">
                  {daysMode && hasDays && (
                    <button className="apply-btn" onClick={applyDays}>일수 기준 적용 →</button>
                  )}
                  <div className="total-badge">
                    합계 <strong>{tasks.length > 0 ? '1.00' : '0.00'}</strong> MM
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
