import React, { useState, useRef, useEffect, useMemo } from 'react';
import Holidays from 'date-holidays';
import './CalendarTable.css';


const cellWidth = 30;
const labelWidth = 120;
const times = Array.from({ length: 100 }, (_, i) => { // ←100マスにしてます
  const hour = Math.floor(i / 4);
  const minute = (i % 4) * 15;
  return { hour, minute };
});
const tableWidth = 100 * cellWidth + labelWidth;

function formatDate(date) {
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  });
}
function getCellKey(user, idx) {
  return `${user}-${idx}`;
}

// --- 祝日名取得関数（v3対応） ---
function getJPHolidayName(date) {
  if (!(date instanceof Date) || isNaN(date)) return null;
  const hd = new Holidays();
  hd.init('JP');
  const year = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const dateString = `${year}-${m}-${d}`;
  const list = hd.getHolidays(year);
  for (const h of list) {
    const hdStr = h.date.length > 10 ? h.date.slice(0, 10) : h.date;
    if (
      (h.type === 'public' || h.type === 'substitute') &&
      hdStr === dateString
    ) {
      return h.name;
    }
  }
  return null;
}

export default function CalendarTable() {
  const [currentDate, setCurrentDate] = useState(new Date());

  // 祝日名・日曜・土曜判定
  const holidayName = useMemo(() => getJPHolidayName(currentDate), [currentDate]);
  const isSunday = currentDate.getDay() === 0;
  const isSaturday = currentDate.getDay() === 6;

  // --- 以下は従来のロジックと同じ ---
  const [selectedCells, setSelectedCells] = useState([]);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const dragging = useRef(false);

  const tableWrapRef = useRef(null);
  useEffect(() => {
    function handleClickOutside(e) {
      if (tableWrapRef.current && !tableWrapRef.current.contains(e.target)) {
        setSelectedCells([]);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const moveDay = (delta) => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta);
      return d;
    });
    setSelectedCells([]);
  };
  const toToday = () => {
    setCurrentDate(new Date());
    setSelectedCells([]);
  };

  function handleMouseDown(user, idx, e) {
    e.preventDefault();
    dragging.current = true;
    setDragStart({ user, idx });
    setDragEnd({ user, idx });
  }
  function handleMouseEnter(user, idx) {
    if (dragging.current && dragStart) {
      setDragEnd({ user, idx });
    }
  }
  function handleMouseUp() {
    if (dragStart && dragEnd) {
      if (dragStart.user === dragEnd.user) {
        const s = Math.min(dragStart.idx, dragEnd.idx);
        const e = Math.max(dragStart.idx, dragEnd.idx);
        setSelectedCells(
          Array.from({ length: e - s + 1 }, (_, k) => ({ user: dragStart.user, idx: s + k }))
        );
         // ▼▼▼ 追加ここから ▼▼▼
    setEntryStep("new");
    setEntryData({
      day: dragStart.day,
      startIdx: s,
      endIdx: e,
    });
      } else {
        setSelectedCells([{ user: dragEnd.user, idx: dragEnd.idx }]);
      }
    }
    setDragStart(null);
    setDragEnd(null);
    dragging.current = false;
  }
  async function handleEntrySave() {
  let { day, idx, startIdx, endIdx, title, color } = entryData;
  if (!title?.trim() || !color) return;
  let s = typeof startIdx === "number" ? startIdx : idx;
  let e = typeof endIdx === "number" ? endIdx : idx;
  s = Math.max(0, Math.min(95, s));
  e = Math.max(0, Math.min(95, e));
  const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  await addDoc(collection(db, "events"), {
    userId: currentUser.id,
    day,
    date: dateStr,
    startIdx: s,
    endIdx: e,
    title: title.trim(),
    color,
    month: currentMonth.toISOString().slice(0, 7)
  });
  setEntryStep(null);
  setEntryData(null);
  setSelectedCells([]); // ←これで登録後に選択色も解除
}
  useEffect(() => {
    const up = () => handleMouseUp();
    document.addEventListener('mouseup', up);
    return () => document.removeEventListener('mouseup', up);
  }, [dragStart, dragEnd]);

  // 赤線（リアルタイム表示）
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    if (new Date().toDateString() !== currentDate.toDateString()) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [currentDate]);
  const isToday = (() => {
    const today = new Date();
    return today.toDateString() === currentDate.toDateString();
  })();
  function getNowCellInfo(date) {
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();
    const quarter = Math.floor(minute / 15);
    const cellIdx = hour * 4 + quarter;
    const minuteInCell = minute % 15;
    const percent = (minuteInCell * 60 + second) / (15 * 60);
    return { cellIdx, percent };
  }
  let nowCellInfo = null;
  if (isToday) nowCellInfo = getNowCellInfo(now);

function isSelected(day, idx) {
  // デバッグ
  if (typeof day !== "number") {
    console.log("day型ミス:", day);
  }
  // 残りはそのまま
  if (dragStart && dragEnd && dragStart.day === day && dragEnd.day === day) {
    const s = Math.min(dragStart.idx, dragEnd.idx);
    const e = Math.max(dragStart.idx, dragEnd.idx);
    return idx >= s && idx <= e;
  }
  return selectedCells.some(cell => cell.day === day && cell.idx === idx);
}

  // 横スクロール/バー連動
  const scrollRef = useRef(null);
  const [slider, setSlider] = useState(0);
  const isBarAction = useRef(false);

  function handleTableScroll(e) {
    if (isBarAction.current) {
      isBarAction.current = false;
      return;
    }
    const scrollW = e.target.scrollWidth;
    const clientW = e.target.clientWidth;
    const maxScroll = scrollW - clientW;
    setSlider(maxScroll > 0 ? e.target.scrollLeft / maxScroll : 0);
  }
  function handleBarChange(e) {
    const ratio = Number(e.target.value);
    setSlider(ratio);
    if (scrollRef.current) {
      const scrollW = scrollRef.current.scrollWidth;
      const clientW = scrollRef.current.clientWidth;
      const maxScroll = scrollW - clientW;
      isBarAction.current = true;
      scrollRef.current.scrollLeft = maxScroll * ratio;
    }
  }
  useEffect(() => {
    if (scrollRef.current) {
      const scrollW = scrollRef.current.scrollWidth;
      const clientW = scrollRef.current.clientWidth;
      const target = labelWidth + cellWidth * 32;
      scrollRef.current.scrollLeft = target;
      const maxScroll = scrollW - clientW;
      setSlider(maxScroll > 0 ? target / maxScroll : 0);
    }
  }, [currentDate]);

  // ウィンドウ横幅（スライダーのため）
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="calendar-root">
      {/* --- ヘッダー --- */}
      <div className="calendar-header-row">
        <button className="calendar-btn calendar-btn-main" onClick={() => moveDay(-1)}>前日</button>
        <button className="calendar-btn calendar-btn-outline" onClick={toToday}>本日</button>
        <button className="calendar-btn calendar-btn-main" onClick={() => moveDay(1)}>次の日</button>
        <input
    type="date"
    value={currentDate.toISOString().slice(0, 10)}
    onChange={e => {
      if (!e.target.value) return;
      setCurrentDate(new Date(e.target.value + "T09:00:00"));
      setSelectedCells([]);
    }}
    style={{
      marginLeft: 18,
      padding: "6px 16px",
      fontSize: 15,
      borderRadius: 8,
      border: "1.5px solid #90caf9",
      background: "#f1f8ff",
      color: "#1976d2",
      fontWeight: 600,
      boxShadow: "0 1px 5px #1976d20a"
    }}
  />
        <span
          className={
            "calendar-date-label" +
            ((isSunday || holidayName) ? " red" : "") +
            (isSaturday ? " blue" : "")
          }
        >
          {formatDate(currentDate)}
          {holidayName && <span className="calendar-holiday-label">（{holidayName}）</span>}
        </span>
      </div>
      <div ref={tableWrapRef} className="calendar-wrap">
        <div className="calendar-bg" />
        <div ref={scrollRef} className="calendar-table-scroll" onScroll={handleTableScroll}>
          <table
  className="calendar-table"
  style={{
    minWidth: USER_COL_WIDTH + cellWidth * 96,
    width: USER_COL_WIDTH + cellWidth * 96,
    tableLayout: "auto",
  }}
  onMouseDown={e => e.stopPropagation()}
>
            <thead>
              <tr>
                <th className="calendar-th">ユーザー＼時間</th>
  {[...Array(24)].map((_, h) => (
    <th key={h} colSpan={4} className="calendar-th-hour">
      {`${h}:00`}
    </th>
  ))}
  {/* ▼ ここ！ダミー2つだけ */}
  <th className="calendar-dummy-th" />
  <th className="calendar-dummy-th" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user}>
                  <td className="calendar-user-cell">{user}</td>
                {times.map((t, i) => {
  const isLast4 = i >= times.length - 4;
  let redLine = null;
  if (isToday && nowCellInfo && nowCellInfo.cellIdx === i) {
    const left = nowCellInfo.percent * cellWidth;
    redLine = (
      <div className="now-line" style={{ left }} />
    );
  }
  const isSel = isSelected(user, i);
  return (
    <td
  key={getCellKey(user, i)}
  className={`calendar-td`}
  style={{
    cursor: 'pointer',
    userSelect: 'none',
    pointerEvents: 'auto'
  }}
  onMouseDown={e => {
    console.log("mousedown!!", user, i); // ← 追加！
    if (e.button !== 0) return;
    handleMouseDown(user, i, e);
  }}
  onMouseEnter={e => {
    if (dragging.current) handleMouseEnter(user, i);
  }}
>
      {redLine}
    </td>
  );
})}
                  {/* ダミー空白セル2つ */}
                  <td className="calendar-dummy-td" />
                  <td className="calendar-dummy-td" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* === スライドバー帯 === */}
        <div className="calendar-slider-wrap" style={{ width: '100vw' }}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={slider}
            onChange={handleBarChange}
            className="calendar-slider"
            style={{
              width: `${vw - 60}px`
            }}
          />
        </div>
      </div>
    </div>
  );
}
