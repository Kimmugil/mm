import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';

const STORAGE_KEY = 'mm-planner-v1';
const MONTH_KEY   = 'mm-planner-month';
const CHART_KEY   = 'mm-planner-chart-v2';

const PALETTE = [
  '#4F86C6','#5BAD6F','#E07B54','#9B59B6','#E8B84B',
  '#1ABC9C','#E74C3C','#3498DB','#F39C12','#27AE60',
  '#8E44AD','#16A085','#D35400','#2980B9','#C0392B',
];
const MIN_RATIO = 0.02;

let _uid = Date.now();
function uid() { return ++_uid; }

function defaultTasks() {
  const names = ['업무 항목 1','업무 항목 2','업무 항목 3','업무 항목 4','업무 항목 5',
                 '업무 항목 6','업무 항목 7','업무 항목 8','업무 항목 9','업무 항목 10'];
  return names.map((name, i) => ({
    id: uid(), name, weight: i < 2 ? 1 : 0, days: '', locked: false,
  }));
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
function f(n) { return n.toFixed(2); }
function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// ── Tooltip ───────────────────────────────────────────
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

// ── Guide modal ───────────────────────────────────────
function GuideModal({ onClose }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>너의MM은 사용법</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <section>
            <h3>MM이란?</h3>
            <p>
              MM(Man-Month)은 한 사람이 <strong>한 달 동안 수행할 수 있는 업무량을 1</strong>로 표현한 단위입니다.
              여러 업무를 동시에 진행할 때, 각 업무에 투입한 비중을 비율로 나타내며 총합이 1.00 MM이 됩니다.
            </p>
            <p className="guide-note">※ 일수 기준 수치는 참고용입니다. 업무 난이도·집중도를 고려해 직접 조정하세요.</p>
          </section>

          <section>
            <h3>① 기준 월 설정</h3>
            <p>우측 상단에서 기준 월을 선택하면 해당 달의 <strong>업무일수(평일)</strong>와 1일·1시간·1주 기준 MM이 자동으로 계산됩니다.</p>
            <p className="guide-note">※ 공휴일은 자동으로 제외되지 않으니 직접 확인 후 조정하세요.</p>
          </section>

          <section>
            <h3>② 업무 추가 · 편집</h3>
            <p>하단 <strong>+ 업무 추가</strong> 버튼으로 항목을 추가하고, 이름 영역을 클릭하면 바로 수정할 수 있습니다. × 버튼으로 삭제합니다.</p>
            <p className="guide-note">※ 비율 0인 항목은 차트에 표시되지 않습니다. MM 숫자를 직접 입력해 활성화하세요.</p>
          </section>

          <section>
            <h3>③ 비율 조정 방법</h3>
            <div className="guide-row">
              <div className="guide-card">
                <strong>막대 차트</strong>
                <span>구분선을 <em>위아래</em>로 드래그</span>
              </div>
              <div className="guide-card">
                <strong>원형 차트</strong>
                <span>흰색 핸들 점을 드래그해 경계 이동</span>
              </div>
              <div className="guide-card">
                <strong>균등 배분</strong>
                <span>활성 미고정 항목을 동일 비율로 초기화</span>
              </div>
            </div>
          </section>

          <section>
            <h3>④ 입력 모드</h3>
            <p><strong>MM 직접 입력</strong>: 각 업무의 MM 숫자를 클릭하면 직접 입력할 수 있습니다. 나머지 미고정 업무들이 비율을 유지하며 자동 재조정됩니다.</p>
            <p><strong>일수로 입력</strong>: 업무일수 기준으로 며칠 투입했는지 입력하면 MM이 자동 계산됩니다. 탭 전환 시 현재 비율 기준으로 일수가 자동 채워집니다.</p>
          </section>

          <section>
            <h3>⑤ 고정 기능</h3>
            <p>각 업무 행의 <strong>🔒 버튼</strong>을 클릭하면 해당 업무의 MM 비율이 고정됩니다. 고정된 항목은 드래그·균등 배분·일수 적용 등 다른 조작에 의해 변경되지 않습니다.</p>
          </section>

          <section>
            <h3>⑥ 자동 저장</h3>
            <p>입력한 업무와 MM 비율은 <strong>이 브라우저에 자동으로 저장</strong>됩니다. 다음에 열어도 그대로 유지됩니다. (다른 기기·브라우저와는 공유되지 않습니다)</p>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Donut chart ───────────────────────────────────────
const PIE_CX = 130, PIE_CY = 130, PIE_R = 78, PIE_IR = 42;

function DonutChart({ tasks, totalWeight, onBoundaryDrag }) {
  const [hov, setHov] = useState(null);
  const svgRef = useRef(null);

  let angle = -Math.PI / 2;
  const slices = [];
  const handles = [];

  tasks.forEach((task, i) => {
    const ratio = totalWeight > 0 ? task.weight / totalWeight : 1 / tasks.length;
    const sweep  = ratio * Math.PI * 2;
    const a0 = angle, a1 = angle + sweep;
    const midA = angle + sweep / 2;
    angle = a1;

    const lg = sweep > Math.PI ? 1 : 0;
    const pt = (a, r) => [PIE_CX + r * Math.cos(a), PIE_CY + r * Math.sin(a)];
    const [x1, y1] = pt(a0, PIE_R), [x2, y2] = pt(a1, PIE_R);
    const [xi1, yi1] = pt(a0, PIE_IR), [xi2, yi2] = pt(a1, PIE_IR);
    const d = `M${f(x1)} ${f(y1)} A${PIE_R} ${PIE_R} 0 ${lg} 1 ${f(x2)} ${f(y2)} L${f(xi2)} ${f(yi2)} A${PIE_IR} ${PIE_IR} 0 ${lg} 0 ${f(xi1)} ${f(yi1)}Z`;

    slices.push({ id: task.id, d, color: PALETTE[task.colorIdx], ratio, name: task.name || `항목`, midA, locked: task.locked });

    if (i < tasks.length - 1) {
      const [hx, hy] = pt(a1, PIE_R);
      const isLocked = task.locked || tasks[i + 1]?.locked;
      handles.push({ id0: task.id, id1: tasks[i + 1].id, hx, hy, isLocked });
    }
  });

  const hs = hov != null ? slices.find(s => s.id === hov) : null;
  const MID_R = (PIE_R + PIE_IR) / 2;

  return (
    <div className="pie-wrap">
      <svg ref={svgRef} viewBox="0 0 260 260" className="pie-svg">
        {slices.map(s => (
          <path
            key={s.id} d={s.d} fill={s.color} stroke="#fff" strokeWidth="1.5"
            style={{ opacity: hov == null || hov === s.id ? (s.locked ? 0.65 : 1) : 0.45, cursor: 'default', transition: 'opacity .15s' }}
            onMouseEnter={() => setHov(s.id)}
            onMouseLeave={() => setHov(null)}
          />
        ))}

        <circle cx={PIE_CX} cy={PIE_CY} r={PIE_IR - 1} fill="white" />

        {slices.map(s => {
          const lx = PIE_CX + MID_R * Math.cos(s.midA);
          const ly = PIE_CY + MID_R * Math.sin(s.midA);
          const showName = s.ratio > 0.13;
          const showMM   = s.ratio > 0.06;
          if (!showMM) return null;
          return (
            <g key={s.id + '-lbl'} style={{ pointerEvents: 'none' }}>
              {showName && (
                <text x={f(lx)} y={f(ly - 7)} textAnchor="middle" fontSize="9" fontWeight="600"
                  fill="rgba(255,255,255,.9)" dominantBaseline="middle">
                  {trunc(s.name, 6)}
                </text>
              )}
              <text x={f(lx)} y={f(showName ? ly + 5 : ly)} textAnchor="middle" fontSize="11" fontWeight="700"
                fill="rgba(255,255,255,.97)" dominantBaseline="middle">
                {s.ratio.toFixed(2)}
              </text>
            </g>
          );
        })}

        {hs ? (
          <>
            <text x={PIE_CX} y={PIE_CY - 8} textAnchor="middle" fontSize="18" fontWeight="700" fill="#1a1d23">{hs.ratio.toFixed(2)}</text>
            <text x={PIE_CX} y={PIE_CY + 11} textAnchor="middle" fontSize="10.5" fill="#7a8494">{trunc(hs.name, 10)}</text>
          </>
        ) : (
          <>
            <text x={PIE_CX} y={PIE_CY - 8} textAnchor="middle" fontSize="20" fontWeight="700" fill="#1a1d23">1.00</text>
            <text x={PIE_CX} y={PIE_CY + 11} textAnchor="middle" fontSize="11" fill="#7a8494">MM</text>
          </>
        )}

        {tasks.length > 1 && handles.map(h => h.isLocked ? null : (
          <circle
            key={`h-${h.id0}`}
            cx={f(h.hx)} cy={f(h.hy)} r="4"
            fill="white" stroke="#b0b8cc" strokeWidth="1.5"
            style={{ cursor: 'grab', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.15))' }}
            onMouseDown={e => onBoundaryDrag(e, h.id0, h.id1, svgRef)}
          />
        ))}
      </svg>

      <div className="pie-info-row" style={{ visibility: hs ? 'visible' : 'hidden' }}>
        {hs && <>
          <span className="color-dot" style={{ backgroundColor: hs.color }} />
          <span className="pie-name">{hs.name}</span>
          <strong>{hs.ratio.toFixed(2)} MM</strong>
          <span className="muted">({(hs.ratio * 100).toFixed(1)}%)</span>
          {hs.locked && <span className="lock-badge">고정됨</span>}
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
        const ratio  = totalWeight > 0 ? task.weight / totalWeight : 1 / tasks.length;
        const pct    = ratio * 100;
        const isLast = i === tasks.length - 1;
        const color  = PALETTE[task.colorIdx];
        const label  = task.name || `항목`;
        const nextLocked = tasks[i + 1]?.locked;
        const canDrag = !isLast && !task.locked && !nextLocked;
        return (
          <div
            key={task.id}
            className="vbar-seg"
            style={{ height: `${pct}%`, backgroundColor: color, opacity: task.locked ? 0.75 : 1 }}
            title={`${label}: ${ratio.toFixed(2)} MM (${pct.toFixed(1)}%)${task.locked ? ' [고정됨]' : ''}`}
          >
            {pct > 5 && (
              <span className="vbar-label">
                {pct > 10 && <span className="vbar-name">{label}{task.locked ? ' 🔒' : ''}</span>}
                <span className="vbar-mm">{ratio.toFixed(2)}</span>
              </span>
            )}
            {canDrag && (
              <div className="vbar-handle" onMouseDown={e => onDragStart(e, task.id, tasks[i + 1].id, trackRef)}>
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
  const [chartType,  setChartType]  = useState('pie');
  const [isDragging, setIsDragging] = useState(false);
  const [daysMode,   setDaysMode]   = useState(false);
  const [showGuide,  setShowGuide]  = useState(false);
  const [editMm,     setEditMm]     = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const loaded = Array.isArray(parsed) && parsed.length
        ? parsed.map((t, i) => ({ ...t, locked: t.locked ?? false, colorIdx: t.colorIdx ?? i }))
        : defaultTasks().map((t, i) => ({ ...t, colorIdx: i }));
      setTasks(loaded);
      setMonth(localStorage.getItem(MONTH_KEY) || currentYearMonth());
      setChartType(localStorage.getItem(CHART_KEY) || 'pie');
    } catch {
      setTasks(defaultTasks().map((t, i) => ({ ...t, colorIdx: i })));
      setMonth(currentYearMonth());
    }
    setReady(true);
  }, []);

  useEffect(() => { if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }, [tasks, ready]);
  useEffect(() => { if (ready && month) localStorage.setItem(MONTH_KEY, month); }, [month, ready]);
  useEffect(() => { if (ready) localStorage.setItem(CHART_KEY, chartType); }, [chartType, ready]);

  const workingDays  = getWorkingDays(month);
  const dayMM        = workingDays > 0 ? 1 / workingDays : 0;
  const hourMM       = dayMM / 8;
  const totalWeight  = tasks.reduce((s, t) => s + t.weight, 0);
  const activeTasks  = tasks.filter(t => t.weight > 0);
  const activeTotal  = activeTasks.reduce((s, t) => s + t.weight, 0);
  const mm = w => totalWeight > 0 ? w / totalWeight : 0;

  function addTask() {
    const colorIdx = tasks.length % PALETTE.length;
    setTasks(p => [...p, { id: uid(), name: '', weight: 0, days: '', locked: false, colorIdx }]);
  }
  function removeTask(id)    { setTasks(p => p.filter(t => t.id !== id)); }
  function updateName(id, v) { setTasks(p => p.map(t => t.id === id ? { ...t, name: v } : t)); }
  function toggleLock(id)    { setTasks(p => p.map(t => t.id === id ? { ...t, locked: !t.locked } : t)); }

  // Equalize only active (weight > 0) unlocked tasks; 0-weight tasks stay at 0
  function equalizeAll() {
    setTasks(p => {
      const total = p.reduce((s, t) => s + t.weight, 0);
      if (total === 0) return p;
      const lockedRatioSum = p.filter(t => t.locked && t.weight > 0).reduce((s, t) => s + t.weight / total, 0);
      const unlockedActive = p.filter(t => !t.locked && t.weight > 0);
      if (unlockedActive.length === 0) return p;
      const each = Math.max((1 - lockedRatioSum) / unlockedActive.length, 0.001);
      return p.map(t => {
        if (t.weight === 0) return t;
        if (t.locked) return { ...t, weight: t.weight / total };
        return { ...t, weight: each, days: '' };
      });
    });
  }

  function enterDaysMode() {
    if (workingDays > 0) {
      const total = tasks.reduce((s, t) => s + t.weight, 0);
      setTasks(p => p.map(t => {
        if (t.locked || t.weight === 0) return t;
        const ratio = total > 0 ? t.weight / total : 0;
        const filled = (ratio * workingDays).toFixed(1);
        return { ...t, days: filled, weight: parseFloat(filled) };
      }));
    }
    setDaysMode(true);
  }

  function exitDaysMode() {
    setDaysMode(false);
  }

  function updateDays(id, val) {
    const n = parseFloat(val);
    setTasks(p => p.map(t =>
      t.id === id ? { ...t, days: val, weight: !isNaN(n) && n > 0 ? n : 0 } : t
    ));
  }

  function startEditMm(id, ratio) {
    setEditMm({ id, val: ratio > 0 ? ratio.toFixed(2) : '' });
  }

  function commitEditMm(id) {
    if (!editMm) return;
    const v = parseFloat(editMm.val);
    if (!isNaN(v) && v > 0 && v < 1) {
      const total = tasks.reduce((s, t) => s + t.weight, 0);
      const lockedRatioSum       = tasks.filter(t => t.locked && t.id !== id).reduce((s, t) => s + (total > 0 ? t.weight / total : 0), 0);
      const available            = 1 - v - lockedRatioSum;
      const unlockedOthers       = tasks.filter(t => !t.locked && t.id !== id && t.weight > 0);
      const unlockedOtherRatioSum = total > 0 ? unlockedOthers.reduce((s, t) => s + t.weight / total, 0) : 0;

      if (available >= 0) {
        setTasks(p => p.map(t => {
          if (t.id === id) return { ...t, weight: v, days: '' };
          if (t.locked)    return { ...t, weight: total > 0 ? t.weight / total : t.weight };
          if (t.weight === 0) return t; // keep 0-weight tasks at 0
          const r = total > 0 ? t.weight / total : 0;
          const newR = unlockedOtherRatioSum > 0
            ? available * (r / unlockedOtherRatioSum)
            : available / Math.max(unlockedOthers.length, 1);
          return { ...t, weight: Math.max(newR, 0.001), days: '' };
        }));
      }
    } else if (!isNaN(parseFloat(editMm.val)) && parseFloat(editMm.val) === 0) {
      // Allow setting to 0 explicitly
      setTasks(p => p.map(t => t.id === id ? { ...t, weight: 0, days: '' } : t));
    }
    setEditMm(null);
  }

  // Vertical bar drag — ID-based, uses activeTotal for pixel mapping
  const handleVDrag = useCallback((e, id0, id1, trackRef) => {
    const t0 = tasks.find(t => t.id === id0);
    const t1 = tasks.find(t => t.id === id1);
    if (!t0 || !t1 || t0.locked || t1.locked) return;
    e.preventDefault();
    const rect    = trackRef.current.getBoundingClientRect();
    const startY  = e.clientY;
    const actTotal = tasks.filter(t => t.weight > 0).reduce((s, t) => s + t.weight, 0);
    const minW    = actTotal * MIN_RATIO;
    const w0start = t0.weight, w1start = t1.weight;
    const pairW   = w0start + w1start;
    setIsDragging(true);
    const onMove = ev => {
      const dw = ((ev.clientY - startY) / rect.height) * actTotal;
      const w0 = clamp(w0start + dw, minW, pairW - minW);
      setTasks(p => p.map(t => {
        if (t.id === id0) return { ...t, weight: w0,         days: '' };
        if (t.id === id1) return { ...t, weight: pairW - w0, days: '' };
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

  // Pie boundary drag — ID-based
  const handlePieDrag = useCallback((e, id0, id1, svgRef) => {
    const t0 = tasks.find(t => t.id === id0);
    const t1 = tasks.find(t => t.id === id1);
    if (!t0 || !t1 || t0.locked || t1.locked) return;
    e.preventDefault();
    e.stopPropagation();
    const svg     = svgRef.current;
    const svgRect = svg.getBoundingClientRect();
    const scaleX  = 260 / svgRect.width;
    const scaleY  = 260 / svgRect.height;

    const getAngle = (cx, cy) => {
      const x = (cx - svgRect.left) * scaleX - PIE_CX;
      const y = (cy - svgRect.top)  * scaleY - PIE_CY;
      return Math.atan2(y, x);
    };

    const startAngle = getAngle(e.clientX, e.clientY);
    const actTotal   = tasks.filter(t => t.weight > 0).reduce((s, t) => s + t.weight, 0);
    const minW       = actTotal * MIN_RATIO;
    const w0start    = t0.weight, w1start = t1.weight;
    const pairTotal  = w0start + w1start;
    setIsDragging(true);

    const onMove = ev => {
      let dAngle = getAngle(ev.clientX, ev.clientY) - startAngle;
      if (dAngle >  Math.PI) dAngle -= 2 * Math.PI;
      if (dAngle < -Math.PI) dAngle += 2 * Math.PI;
      const dW = (dAngle / (2 * Math.PI)) * actTotal;
      const w0 = clamp(w0start + dW, minW, pairTotal - minW);
      setTasks(p => p.map(t => {
        if (t.id === id0) return { ...t, weight: w0,              days: '' };
        if (t.id === id1) return { ...t, weight: pairTotal - w0,  days: '' };
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
  const lockedCount = tasks.filter(t => t.locked).length;

  // Chart only shows active (weight > 0) tasks with color index preserved
  const chartTasks = activeTasks;

  return (
    <>
      <Head>
        <title>너의MM은</title>
        <link rel="icon" href="/icon.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <style>{`body{cursor:${isDragging ? (chartType === 'pie' ? 'grabbing' : 'row-resize') : 'default'}}`}</style>

      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}

      <div className="page">

        {/* ── Header ── */}
        <div className="header">
          <div className="header-top">
            <div className="header-title-row">
              <img src="/LOGO_OG.png" alt="로고" className="header-logo" />
              <div>
                <h1>너의MM은</h1>
                <p className="header-sub">월간 공수(MM) 배분 도구 · 총합 1.00 MM</p>
              </div>
            </div>
            <div className="header-right">
              <button className="guide-btn" onClick={() => setShowGuide(true)}>사용법</button>
              <div className="month-picker">
                <label>기준 월</label>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
              </div>
            </div>
          </div>

          {workingDays > 0 && (
            <div className="wd-row">
              <Tooltip text={`${formatMonth(month)}의 토·일 제외 평일 수\n공휴일은 자동 제외되지 않습니다`} dir="down" align="start">
                <span className="wd-pill">업무일 <strong>{workingDays}일</strong></span>
              </Tooltip>
              <Tooltip text={`1일 MM × 5 = ${(dayMM * 5).toFixed(4)}\n1주(5일) 기준 참고값`} dir="down" align="start">
                <span className="wd-pill">1주(5일) <strong>{(dayMM * 5).toFixed(4)} MM</strong></span>
              </Tooltip>
              <Tooltip text={`1 ÷ ${workingDays} = ${dayMM.toFixed(6)}\n하루 8시간 근무 기준 참고값`} dir="down" align="start">
                <span className="wd-pill">1일 <strong>{dayMM.toFixed(4)} MM</strong></span>
              </Tooltip>
              <Tooltip text={`${dayMM.toFixed(6)} ÷ 8 = ${hourMM.toFixed(6)}\n1시간 단위 참고값`} dir="down" align="start">
                <span className="wd-pill">1시간 <strong>{hourMM.toFixed(5)} MM</strong></span>
              </Tooltip>
              <Help
                text={`위 수치는 ${formatMonth(month)} 평일 기준 참고값입니다.\n업무 난이도·집중도를 고려해 직접 조정하세요.`}
                dir="down" align="end"
              />
            </div>
          )}
        </div>

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
                <button
                  className={`chart-tab${chartType === 'bar' ? ' active' : ''}`}
                  onClick={() => setChartType('bar')}
                >
                  <span className="chart-tab-icon">▬</span> 막대
                </button>
                <button
                  className={`chart-tab${chartType === 'pie' ? ' active' : ''}`}
                  onClick={() => setChartType('pie')}
                >
                  <span className="chart-tab-icon">◎</span> 원형
                </button>
              </div>

              {chartTasks.length === 0 ? (
                <div className="chart-empty">
                  <p>비율이 0보다 큰 항목이 없습니다.<br />우측 목록에서 MM 값을 입력하세요.</p>
                </div>
              ) : chartType === 'bar' ? (
                <>
                  <VertBar tasks={chartTasks} totalWeight={activeTotal} onDragStart={handleVDrag} />
                  {chartTasks.length > 1 && <p className="chart-hint">↕ 구분선을 드래그해 비율 조정{lockedCount > 0 ? ' · 🔒 고정 항목은 제외' : ''}</p>}
                </>
              ) : (
                <>
                  <DonutChart tasks={chartTasks} totalWeight={activeTotal} onBoundaryDrag={handlePieDrag} />
                  {chartTasks.length > 1 && <p className="chart-hint">● 흰 점을 드래그해 비율 조정{lockedCount > 0 ? ' · 🔒 고정 항목은 제외' : ''}</p>}
                </>
              )}
            </div>

            {/* Right: Task list */}
            <div className="task-panel">
              <div className="card">
                <div className="card-header">
                  <span>
                    업무 목록
                    <Help text="이름 클릭해 편집 · × 버튼으로 삭제 · 🔒 버튼으로 비율 고정" dir="down" align="start" />
                  </span>
                  <Tooltip text={lockedCount > 0 ? `활성 미고정 항목만 균등 배분\n고정 항목(${lockedCount}개)은 유지` : '활성 항목을 동일 비율로 초기화'} dir="down" align="end">
                    <button className="equalize-btn" onClick={equalizeAll}>균등 배분</button>
                  </Tooltip>
                </div>

                <div className="input-tab-row">
                  <button
                    className={`input-tab${!daysMode ? ' active' : ''}`}
                    onClick={exitDaysMode}
                  >
                    MM 직접 입력
                  </button>
                  <button
                    className={`input-tab${daysMode ? ' active' : ''}`}
                    onClick={enterDaysMode}
                    disabled={workingDays === 0}
                    title={workingDays === 0 ? '기준 월을 먼저 선택해주세요' : ''}
                  >
                    일수로 입력
                    {workingDays > 0 && <span className="input-tab-sub">{workingDays}일 기준</span>}
                  </button>
                </div>

                {daysMode && workingDays > 0 && (
                  <div className="days-guide-bar">
                    <span>1일 = <strong>{dayMM.toFixed(4)} MM</strong> · 입력한 일수가 차트에 실시간 반영됩니다</span>
                    <Help text={`${workingDays}일 기준으로 MM 계산\n초과해도 비율만 반영, 총합 1.00 유지\n고정 항목은 변경되지 않습니다`} dir="up" align="end" />
                  </div>
                )}

                {tasks.map((task, i) => {
                  const ratio = mm(task.weight);
                  const pct   = ratio * 100;
                  const dn    = parseFloat(task.days);
                  const dayPv = (!isNaN(dn) && dn > 0 && workingDays > 0) ? dn / workingDays : null;
                  const isZero = task.weight === 0;

                  return (
                    <div key={task.id} className={`task-row${task.locked ? ' locked' : ''}${isZero ? ' zero' : ''}`}>
                      <div className="color-dot" style={{ backgroundColor: PALETTE[task.colorIdx ?? i], opacity: isZero ? 0.3 : 1 }} />
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
                            min="0"
                            step="0.5"
                            disabled={task.locked}
                          />
                          <span className="days-unit">일</span>
                          {dayPv != null && <span className="days-preview">= {dayPv.toFixed(2)} MM</span>}
                        </div>
                      ) : editMm?.id === task.id ? (
                        <input
                          type="number"
                          className="mm-direct-input"
                          value={editMm.val}
                          min="0" max="0.99" step="0.01"
                          autoFocus
                          onChange={e => setEditMm({ id: task.id, val: e.target.value })}
                          onBlur={() => commitEditMm(task.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitEditMm(task.id);
                            if (e.key === 'Escape') setEditMm(null);
                          }}
                        />
                      ) : (
                        <>
                          <div
                            className="task-stats"
                            onClick={() => startEditMm(task.id, ratio)}
                            title="클릭해서 MM 직접 입력"
                          >
                            <span className={`task-mm${isZero ? ' zero-mm' : ''}`}>{isZero ? '—' : ratio.toFixed(2)}</span>
                            {!isZero && <span className="task-pct">{pct.toFixed(1)}%</span>}
                          </div>
                          {!isZero && (
                            <div className="task-mini-bar">
                              <div className="task-mini-fill" style={{ width: `${pct}%`, backgroundColor: PALETTE[task.colorIdx ?? i] }} />
                            </div>
                          )}
                        </>
                      )}
                      <Tooltip text={task.locked ? '고정 해제' : '비율 고정'} dir="up" align="end">
                        <button
                          className={`lock-btn${task.locked ? ' locked' : ''}`}
                          onClick={() => toggleLock(task.id)}
                          aria-label={task.locked ? '고정 해제' : '고정'}
                        >
                          {task.locked ? '🔒' : '🔓'}
                        </button>
                      </Tooltip>
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
                    <span className="days-sum-mm">기준 MM 합: <strong>{(totalDays / workingDays).toFixed(4)}</strong></span>
                  </div>
                )}
              </div>

              <div className="task-footer">
                <button className="add-btn" onClick={addTask}>+ 업무 추가</button>
                <div className="total-badge">합계 <strong>{tasks.length > 0 ? '1.00' : '0.00'}</strong> MM</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
