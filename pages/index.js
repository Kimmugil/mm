import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';

const STORAGE_KEY = 'mm-planner-v1';

const PALETTE = [
  '#4F86C6', '#5BAD6F', '#E07B54', '#9B59B6', '#E8B84B',
  '#1ABC9C', '#E74C3C', '#3498DB', '#F39C12', '#2ECC71',
  '#8E44AD', '#16A085', '#D35400', '#2980B9', '#27AE60',
];

const MIN_WEIGHT_RATIO = 0.02;

let _id = 1;
function uid() {
  return ++_id * 1000 + Date.now();
}

function defaultTasks() {
  return [
    { id: uid(), name: '업무 항목 1', weight: 1 },
    { id: uid(), name: '업무 항목 2', weight: 1 },
  ];
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export default function MMPlanner() {
  const [tasks, setTasks] = useState([]);
  const [ready, setReady] = useState(false);
  const barRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTasks(parsed);
          setReady(true);
          return;
        }
      }
    } catch {}
    setTasks(defaultTasks());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && tasks.length >= 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }
  }, [tasks, ready]);

  const totalWeight = tasks.reduce((s, t) => s + t.weight, 0);

  function mm(weight) {
    if (totalWeight === 0 || tasks.length === 0) return 0;
    return weight / totalWeight;
  }

  function addTask() {
    setTasks(prev => [...prev, { id: uid(), name: '', weight: 1 }]);
  }

  function removeTask(id) {
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  function updateName(id, name) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, name } : t));
  }

  const handleDragStart = useCallback((e, dividerIndex) => {
    e.preventDefault();
    const bar = barRef.current;
    if (!bar) return;

    const barRect = bar.getBoundingClientRect();
    const startX = e.clientX;
    const startWeights = tasks.map(t => t.weight);
    const total = startWeights.reduce((s, w) => s + w, 0);
    const minW = total * MIN_WEIGHT_RATIO;

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dw = (dx / barRect.width) * total;

      const newWeights = [...startWeights];
      const raw0 = startWeights[dividerIndex] + dw;
      const raw1 = startWeights[dividerIndex + 1] - dw;

      newWeights[dividerIndex] = clamp(raw0, minW, total - minW * (startWeights.length - 1));
      newWeights[dividerIndex + 1] = clamp(raw1, minW, total - minW * (startWeights.length - 1));

      const diff = (newWeights[dividerIndex] + newWeights[dividerIndex + 1]) - (startWeights[dividerIndex] + startWeights[dividerIndex + 1]);
      if (Math.abs(diff) > 0.0001) {
        newWeights[dividerIndex + 1] = (startWeights[dividerIndex] + startWeights[dividerIndex + 1]) - newWeights[dividerIndex];
        newWeights[dividerIndex + 1] = clamp(newWeights[dividerIndex + 1], minW, total);
        newWeights[dividerIndex] = (startWeights[dividerIndex] + startWeights[dividerIndex + 1]) - newWeights[dividerIndex + 1];
      }

      setTasks(prev => prev.map((t, i) => ({ ...t, weight: newWeights[i] ?? t.weight })));
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      dragRef.current = null;
    }

    dragRef.current = { dividerIndex };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [tasks]);

  if (!ready) return null;

  return (
    <>
      <Head>
        <title>MM Planner</title>
        <meta name="description" content="월간 업무 공수 배분 도구" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="page">
        <div className="header">
          <h1>MM Planner</h1>
          <p>업무별 월간 공수(MM) 배분 도구 · 총합 1.00 MM</p>
        </div>

        {tasks.length === 0 ? (
          <div className="empty">
            <p>📋</p>
            <p>업무를 추가해 공수를 배분해보세요.</p>
          </div>
        ) : (
          <div className="bar-wrap">
            <div className="bar-label-row">
              <span>공수 비율</span>
              <span>드래그로 조정</span>
            </div>

            <div className="bar-track" ref={barRef}>
              {tasks.map((task, i) => {
                const ratio = mm(task.weight);
                const pct = ratio * 100;
                const color = PALETTE[i % PALETTE.length];
                const isLast = i === tasks.length - 1;
                const label = task.name || `항목 ${i + 1}`;

                return (
                  <div
                    key={task.id}
                    className="bar-segment"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  >
                    {pct > 5 && (
                      <span className="seg-label" title={`${label}: ${ratio.toFixed(2)}`}>
                        {pct > 12 ? label + ' · ' : ''}{ratio.toFixed(2)}
                      </span>
                    )}
                    {!isLast && (
                      <div
                        className="drag-handle"
                        onMouseDown={(e) => handleDragStart(e, i)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <p className="bar-hint">구분선을 좌우로 드래그해 비율을 조정하세요</p>
          </div>
        )}

        {tasks.length > 0 && (
          <div className="card">
            {tasks.map((task, i) => (
              <div key={task.id} className="task-row">
                <div
                  className="color-dot"
                  style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                />
                <input
                  className="task-name-input"
                  value={task.name}
                  onChange={(e) => updateName(task.id, e.target.value)}
                  placeholder={`항목 ${i + 1}`}
                />
                <span className="task-mm">{mm(task.weight).toFixed(2)} MM</span>
                <button
                  className="remove-btn"
                  onClick={() => removeTask(task.id)}
                  title="삭제"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="footer-row">
          <button className="add-btn" onClick={addTask}>
            + 업무 추가
          </button>
          <div className="total-badge">
            합계 <span>{tasks.length > 0 ? '1.00' : '0.00'}</span> MM
          </div>
        </div>
      </div>
    </>
  );
}
