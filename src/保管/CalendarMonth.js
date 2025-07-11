import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { db } from "../firebase";
import {
  collection, onSnapshot, addDoc, doc, deleteDoc, updateDoc, query, where
} from "firebase/firestore";
import Holidays from "date-holidays";

// ======= 色定義 =======
const COLORS_36 = [
  "#1976d2", "#43a047", "#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5", "#2196f3",
  "#03a9f4", "#00bcd4", "#009688", "#4caf50", "#8bc34a", "#cddc39", "#ffeb3b", "#ffc107",
  "#ff9800", "#ff5722", "#795548", "#607d8b", "#c2185b", "#7b1fa2", "#512da8",
  "#0288d1", "#0097a7", "#388e3c", "#689f38", "#afb42b", "#fbc02d", "#ffa000", "#f57c00",
  "#e64a19", "#5d4037", "#455a64", "#6d4c41", "#00acc1"
];
const cellWidth = 21;
const DATE_COL_WIDTH = 65;
const ROW_HEIGHT = 40;
const TIME_LIST = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
});
function timeToIndex(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 4 + Math.floor(m / 15);
}
function indexToTime(idx) {
  const hour = Math.floor(idx / 4);
  const min = (idx % 4) * 15;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
function formatRange(startIdx, endIdx) {
  const start = indexToTime(startIdx);
  const endTime = indexToTime(endIdx + 1);
  return `${start}〜${endTime}`;
}
function getJPHolidayName(date) {
  if (!(date instanceof Date) || isNaN(date)) return null;
  const hd = new Holidays('JP');
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const dateString = `${y}-${m}-${d}`;
  const list = hd.getHolidays(y);
  for (const h of list) {
    const hdStr = h.date.length > 10 ? h.date.slice(0, 10) : h.date;
    if ((h.type === 'public' || h.type === 'substitute') && hdStr === dateString) {
      return h.name;
    }
  }
  return null;
}
function getNowCellIndex() {
  const now = new Date();
  return now.getHours() * 4 + Math.floor(now.getMinutes() / 15);
}
function loadCopyCounts() {
  try { return JSON.parse(localStorage.getItem("eventCopyCounts") || "{}"); } catch { return {}; }
}
function saveCopyCounts(counts) {
  localStorage.setItem("eventCopyCounts", JSON.stringify(counts));
}
function isEventOverlapping(evt, allEvents) {
  return allEvents.some(e =>
    e.id !== evt.id &&
    e.userId === evt.userId &&
    Number(e.day) === Number(evt.day) &&
    (e.startIdx <= evt.endIdx && e.endIdx >= evt.startIdx)
  );
}
function parseDateString(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatDateJST(date) {
  if (!date || !(date instanceof Date) || isNaN(date)) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ========== メイン CalendarMonth ==========
export default function CalendarMonth({
  users, currentUser, onChangeUser,
  currentMonth, setCurrentMonth,
}) {
  const scrollRef = useRef(null);
  const footerTimeRef = useRef(null);

  // 横スクロール同期
  useEffect(() => {
    function onScroll() {
      if (footerTimeRef.current && scrollRef.current)
        footerTimeRef.current.scrollLeft = scrollRef.current.scrollLeft;
    }
    if (!scrollRef.current) return;
    scrollRef.current.addEventListener("scroll", onScroll);
    return () => {
      if (scrollRef.current) scrollRef.current.removeEventListener("scroll", onScroll);
    };
  }, []);

  // 日付配列
  const daysArray = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return {
        day: i + 1,
        date: d,
        holiday: getJPHolidayName(d),
        isSunday: d.getDay() === 0,
        isSaturday: d.getDay() === 6
      };
    });
  }, [currentMonth]);

  // イベントデータ
  const [events, setEvents] = useState([]);
  useEffect(() => {
    if (!currentUser) return;
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
    const q = query(
      collection(db, "events"),
      where("userId", "==", currentUser.id),
      where("month", "==", monthStr)
    );
    const unsub = onSnapshot(q, (snap) => {
      setEvents(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    });
    return () => unsub();
  }, [currentUser, currentMonth]);

  // テンプレート
  const [templates, setTemplates] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "templates"), (snap) => {
      setTemplates(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    });
    return () => unsub();
  }, []);

  // コピペ履歴
  const [copyCounts, setCopyCounts] = useState(loadCopyCounts());
  useEffect(() => { saveCopyCounts(copyCounts); }, [copyCounts]);
  const pasteCandidates = Object.entries(copyCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // 各種状態
  const [selectedBar, setSelectedBar] = useState(null);
  const [barClipboard, setBarClipboard] = useState(null);
  const [selectedCells, setSelectedCells] = useState([]);
  const [dragMode, setDragMode] = useState(null);
  const [moveInfo, setMoveInfo] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const dragging = useRef(false);

  const [hoveredEvent, setHoveredEvent] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, w: 0 });
  const tooltipTimer = useRef();
  const longPressTimeout = useRef();

  // 貼り付けモード
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteGhost, setPasteGhost] = useState(null);

  // ゴーストバー
  let ghostBar = null;
  if (dragMode && moveInfo) {
    ghostBar = {
      rowIdx: moveInfo.rowIdx,
      startIdx: moveInfo.startIdx,
      endIdx: moveInfo.endIdx,
      color: moveInfo.event?.color || "#2196f3",
      title: moveInfo.event?.title || "",
    };
  }

  function handleRootClick(e) { setSelectedBar(null); setSelectedCells([]); setHoveredEvent(null); }

  function handleBarClick(evt, day, rowIdx, e) {
    e.stopPropagation();
    setSelectedBar({ eventId: evt.id, day, rowIdx });
    setSelectedCells([]);
  }

  // --- マウス・タッチ両対応: セル選択 ---
  function handleCellMouseDown(day, idx, e) {
    if ((e.button !== undefined && e.button !== 0) || pasteMode) return;
    dragging.current = true;
    const rowIdx = daysArray.findIndex(d => d.day === day);
    setDragStart({ rowIdx, idx });
    setDragEnd({ rowIdx, idx });
    setSelectedBar(null);

    // --- タッチ用 ---
    if (e.touches) {
      const touch = e.touches[0];
      if (!touch) return;
      function onTouchMove(te) {
        const t = te.touches[0];
        if (!t) return;
        const scrollContainer = scrollRef.current;
        if (!scrollContainer) return;
        const tbody = scrollContainer.querySelector('tbody');
        if (!tbody) return;
        const tbodyRect = tbody.getBoundingClientRect();
        const y = t.clientY - tbodyRect.top;
        const rowIdx2 = Math.floor(y / ROW_HEIGHT);
        setDragEnd({ rowIdx: rowIdx2, idx });
      }
      function onTouchEnd() {
        handleMouseUp();
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
      }
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", onTouchEnd, { passive: false });
    }
  }
  function handleCellMouseEnter(day, idx) {
    const rowIdx = daysArray.findIndex(d => d.day === day);
    if (dragging.current && dragStart && dragStart.rowIdx === rowIdx) {
      setDragEnd({ rowIdx, idx });
    }
  }
  function handleMouseUp() {
    if (!dragging.current) return;
    if (dragStart && dragEnd && dragStart.rowIdx === dragEnd.rowIdx) {
      const s = Math.min(dragStart.idx, dragEnd.idx);
      const e = Math.max(dragStart.idx, dragEnd.idx);
      const selected = Array.from({ length: e - s + 1 }, (_, k) => ({ rowIdx: dragStart.rowIdx, idx: s + k }));
      setSelectedCells(selected);
      if (selected.length >= 2) {
        setEntryStep("select");
        setEntryData({
          rowIdx: dragStart.rowIdx,
          startIdx: s,
          endIdx: e,
        });
      }
    } else {
      setSelectedCells([]);
      setEntryStep(null);
      setEntryData(null);
    }
    setDragStart(null);
    setDragEnd(null);
    dragging.current = false;
  }

  function isSelected(day, idx) {
    if (selectedBar) return false;
    const rowIdx = daysArray.findIndex(d => d.day === day);
    if (dragStart && dragEnd && dragStart.rowIdx === rowIdx && dragEnd.rowIdx === rowIdx) {
      const s = Math.min(dragStart.idx, dragEnd.idx);
      const e = Math.max(dragStart.idx, dragEnd.idx);
      return idx >= s && idx <= e;
    }
    return selectedCells.some(cell => cell.rowIdx === rowIdx && cell.idx === idx);
  }

  // --- バー移動・リサイズ: タッチ対応も追加 ---
  function handleBarMouseDown(evt, type, e, day, rowIdx) {
    e.stopPropagation();
    setSelectedBar({ eventId: evt.id, day, rowIdx });
    setDragMode(type);
    const getClientXY = e =>
      e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
    const { x, y } = getClientXY(e);
    setMoveInfo({
      event: evt,
      rowIdx,
      startIdx: evt.startIdx,
      endIdx: evt.endIdx,
      dragStartX: x,
      dragStartY: y,
      dragStartCell: evt.startIdx,
      dragStartEndCell: evt.endIdx,
      dragStartRowIdx: rowIdx,
      type,
    });

    // --- タッチ用 ---
    if (e.touches) {
      function onTouchMove(te) {
        const t = te.touches[0];
        if (!t) return;
        onBarMoveOrResize(t.clientX, t.clientY);
      }
      function onTouchEnd() {
        onBarMouseUp();
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
      }
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", onTouchEnd, { passive: false });
    }
  }

  function onBarMoveOrResize(clientX, clientY) {
    if (!dragMode || !moveInfo) return;
    const dx = clientX - moveInfo.dragStartX;
    const dy = clientY - moveInfo.dragStartY;
    let newRowIdx = moveInfo.dragStartRowIdx;
    let newStart = moveInfo.dragStartCell;
    let newEnd = moveInfo.dragStartEndCell;

    if (Math.abs(dy) > ROW_HEIGHT / 2) {
      const rowOffset = Math.round(dy / ROW_HEIGHT);
      newRowIdx = Math.max(0, Math.min(daysArray.length - 1, moveInfo.dragStartRowIdx + rowOffset));
    }
    if (dragMode === "move") {
      const cellOffset = Math.round(dx / cellWidth);
      newStart = Math.max(0, Math.min(95, moveInfo.dragStartCell + cellOffset));
      const width = moveInfo.dragStartEndCell - moveInfo.dragStartCell;
      newEnd = Math.max(newStart, Math.min(95, newStart + width));
    } else if (dragMode === "resize-left") {
      const cellOffset = Math.round(dx / cellWidth);
      newStart = Math.max(0, Math.min(moveInfo.dragStartEndCell - 1, moveInfo.dragStartCell + cellOffset));
    } else if (dragMode === "resize-right") {
      const cellOffset = Math.round(dx / cellWidth);
      newEnd = Math.max(moveInfo.dragStartCell + 1, Math.min(95, moveInfo.dragStartEndCell + cellOffset));
    }
    setMoveInfo(mi => ({
      ...mi,
      startIdx: newStart,
      endIdx: newEnd,
      rowIdx: newRowIdx,
    }));
  }

  async function onBarMouseUp() {
    if (!dragMode || !moveInfo) {
      setDragMode(null);
      setMoveInfo(null);
      return;
    }
    const { rowIdx } = moveInfo;
    const { day, date } = daysArray[rowIdx];
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const eventRef = doc(db, "events", moveInfo.event.id);
    if (dragMode === "move") {
      await updateDoc(eventRef, {
        day,
        date: dateStr,
        month: monthStr,
        startIdx: moveInfo.startIdx,
        endIdx: moveInfo.endIdx,
      });
    } else if (dragMode === "resize-left") {
      await updateDoc(eventRef, { startIdx: moveInfo.startIdx });
    } else if (dragMode === "resize-right") {
      await updateDoc(eventRef, { endIdx: moveInfo.endIdx });
    }
    setDragMode(null);
    setMoveInfo(null);
  }

  // --- PCマウスドラッグ（既存のまま） ---
  useEffect(() => {
    function onMouseMove(e) {
      if (!dragMode || !moveInfo) return;
      onBarMoveOrResize(e.clientX, e.clientY);
    }
    function onMouseUp() {
      onBarMouseUp();
    }
    if (dragMode) {
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      return () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
    }
  }, [dragMode, moveInfo, daysArray]);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [dragStart, dragEnd]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const idx14 = 14 * 4;
    const viewWidth = scrollRef.current.clientWidth;
    const targetScrollLeft = DATE_COL_WIDTH + cellWidth * idx14 - viewWidth / 2 + cellWidth / 2;
    scrollRef.current.scrollLeft = Math.max(0, targetScrollLeft);
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedBar) {
        e.preventDefault();
        const targetEvent = events.find(ev => ev.id === selectedBar.eventId);
        if (targetEvent) {
          setEditEvent({ event: targetEvent, op: "delete" });
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selectedBar) {
        e.preventDefault();
        const targetEvent = events.find(ev => ev.id === selectedBar.eventId);
        if (targetEvent) {
          setBarClipboard({ ...targetEvent });
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && barClipboard) {
        e.preventDefault();
        setPasteMode(true);
        setPasteGhost(null);
      }
      if (e.key === "Escape" && pasteMode) {
        setPasteMode(false);
        setPasteGhost(null);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [selectedBar, barClipboard, selectedCells, daysArray, events, currentUser, pasteMode]);

  // --- 貼り付けモード時のマウス・タッチ対応 ---
  useEffect(() => {
    if (!pasteMode) return;
    function onMove(e) {
      let clientX, clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      const scrollContainer = scrollRef.current;
      if (!scrollContainer) return;
      const tbody = scrollContainer.querySelector('tbody');
      if (!tbody) return;
      const tbodyRect = tbody.getBoundingClientRect();
      const y = clientY - tbodyRect.top;
      const containerRect = scrollContainer.getBoundingClientRect();
      const scrollX = scrollContainer.scrollLeft || 0;
      const x = clientX - containerRect.left - DATE_COL_WIDTH + scrollX;
      if (x < 0 || y < 0) { setPasteGhost(null); return; }
      const idx = Math.floor(x / cellWidth);
      const rowIdx = Math.floor(y / ROW_HEIGHT);
      if (rowIdx < 0 || idx < 0 || rowIdx >= daysArray.length || idx >= 96) {
        setPasteGhost(null); return;
      }
      setPasteGhost({ rowIdx, idx });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
    };
  }, [pasteMode, daysArray]);

  // --- ゴーストバー貼り付け時のクリック（重複チェック付き）
  function handlePasteCellClick(rowIdx, idx) {
    if (
      pasteMode &&
      barClipboard &&
      typeof barClipboard.startIdx === "number" &&
      typeof barClipboard.endIdx === "number"
    ) {
      const dayObj = daysArray[rowIdx];
      const date = dayObj.date;
      const dayNum = dayObj.day;
      const len = Math.max(0, barClipboard.endIdx - barClipboard.startIdx); // 長さ
      const dayEvents = events.filter(e => Number(e.day) === Number(dayNum));
      if (
        isEventOverlapping(
          {
            id: undefined,
            userId: currentUser.id,
            day: dayNum,
            startIdx: idx,
            endIdx: Math.min(idx + len, 95)
          },
          dayEvents
        )
      ) return;
      addDoc(collection(db, "events"), {
        userId: currentUser.id,
        title: barClipboard.title,
        color: barClipboard.color,
        startIdx: idx,
        endIdx: Math.min(idx + len, 95),
        date: formatDateJST(date),
        month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        day: dayNum
      }).then(() => {
        setPasteMode(false);
        setPasteGhost(null);
        setBarClipboard(null);
      });
    }
  }

  // 既存の貼り付けショートカット用（セル選択貼り付けは消さず維持・併用）
  useEffect(() => {
    function onKeyDownPaste(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && barClipboard && selectedCells.length > 0 && !pasteMode) {
        e.preventDefault();
        const cell = selectedCells[0];
        const { rowIdx, idx } = cell;
        const dayObj = daysArray[rowIdx];
        const date = dayObj.date;
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const len = barClipboard.endIdx - barClipboard.startIdx;
        addDoc(collection(db, "events"), {
          userId: currentUser.id,
          title: barClipboard.title,
          color: barClipboard.color,
          startIdx: idx,
          endIdx: idx + len,
          date: dateStr,
          month: monthStr,
          day: date.getDate()
        });
      }
    }
    window.addEventListener("keydown", onKeyDownPaste, true);
    return () => window.removeEventListener("keydown", onKeyDownPaste, true);
  }, [barClipboard, selectedCells, daysArray, currentUser, pasteMode]);

  const [entryStep, setEntryStep] = useState(null);
  const [entryData, setEntryData] = useState(null);
  const [editEvent, setEditEvent] = useState(null);
  const closeAllDialogs = () => {
    setEntryStep(null);
    setEntryData(null);
    setEditEvent(null);
  };
  function handleCellDoubleClick(day, idx) {
    if (dragMode || pasteMode) return;
    const rowIdx = daysArray.findIndex(d => d.day === day);
    setSelectedCells([{ rowIdx, idx }]);
    setEntryStep("select");
    setEntryData({
      rowIdx,
      startIdx: idx,
      endIdx: idx,
    });
  }
  async function handleEntrySave(data) {
    try {
      let { rowIdx, startIdx, endIdx, title, color, date, startTime, endTime } = data;
      if (!title?.trim() || !color) return;
      let s = timeToIndex(startTime);
      let e = timeToIndex(endTime) - 1;
      if (e < s) [s, e] = [e, s];
      const d = parseDateString(date);
      if (!d) {
        alert("日付が不正です");
        return;
      }
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const dateStr = formatDateJST(d);
      const dayNum = d.getDate();
      await addDoc(collection(db, "events"), {
        userId: currentUser.id,
        title: title.trim(),
        color,
        startIdx: s,
        endIdx: e,
        date: dateStr,
        month: monthStr,
        day: dayNum
      });
      closeAllDialogs();
    } catch (e) {
      alert("保存できませんでした: " + e.message);
    }
  }
  function handleEditEventCopy(evt) {
    const key = `${evt.title}__${evt.color}`;
    setCopyCounts(prev => { const next = { ...prev, [key]: (prev[key] || 0) + 1 }; saveCopyCounts(next); return next; });
    closeAllDialogs();
  }
  function handlePasteSelect(key) {
    const [title, color] = key.split("__");
    setEntryStep("new");
    setEntryData(prev => ({ ...prev, title, color }));
  }
  async function handleAddTemplate(title, color) {
    if (!title.trim()) return;
    await addDoc(collection(db, "templates"), { title: title.trim(), color });
  }
  async function handleDeleteTemplate(id) {
    await deleteDoc(doc(db, "templates", id));
  }
  function handleEventCellDoubleClick(evt) {
    setDragMode(null); setSelectedCells([]); setMoveInfo(null); closeAllDialogs();
    setTimeout(() => setEditEvent({ event: evt, op: null }), 0);
  }
  async function handleEditEventSave(changed) {
    if (!changed.title.trim()) return;
    let startIdx = Math.max(0, Math.min(95, changed.startIdx));
    let endIdx = Math.max(0, Math.min(95, changed.endIdx));
    if (endIdx < startIdx) [startIdx, endIdx] = [endIdx, startIdx];
    const d = parseDateString(changed.date);
    const evDay = d ? d.getDate() : changed.day;
    await updateDoc(doc(db, "events", changed.id), { title: changed.title, color: changed.color, startIdx, endIdx });
    closeAllDialogs();
  }
  async function handleEditEventDelete(evt) {
    await deleteDoc(doc(db, "events", evt.id));
    closeAllDialogs();
  }
  const [nowCellIdx, setNowCellIdx] = useState(getNowCellIndex());
  useEffect(() => { const timer = setInterval(() => setNowCellIdx(getNowCellIndex()), 10000); return () => clearInterval(timer); }, []);

  // --- TooltipPortal
  function TooltipPortal({ evt, x, y, w }) {
    if (!evt) return null;
    let px = x + w / 2 - 60;
    if (px < 8) px = 8;
    let py = y - 56;
    if (py < 0) py = y + 36;
    return createPortal(
      <div style={{
        position: "fixed",
        top: py,
        left: px,
        background: "#223040",
        color: "#fff",
        borderRadius: 7,
        padding: "8px 18px 6px",
        fontSize: 15,
        fontWeight: 700,
        boxShadow: "0 4px 16px #0007",
        zIndex: 99999,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        minWidth: 130,
        maxWidth: 320,
        textAlign: "center"
      }}>
        <div>{evt.title}</div>
        <div style={{ fontSize: 13, fontWeight: 400, marginTop: 3 }}>{formatRange(evt.startIdx, evt.endIdx)}</div>
      </div>,
      document.body
    );
  }

  // --- 表本体 ---
  const tableWidth = DATE_COL_WIDTH + cellWidth * 96;
  const getCellRightBorder = idx =>
    idx % 4 === 3
      ? "2px solid #42a5f5"
      : "1px dashed #b4b7c7";
  const getRowBottomBorder = rowIdx =>
    rowIdx === daysArray.length - 1
      ? "none"
      : "2px solid #42a5f5";

  function handleSelectDialogOpen(step, entryDataArg) {
    const ed = entryDataArg || entryData || {};
    const filled = {
      ...ed,
      startIdx: ed.startIdx ?? 36,
      endIdx: ed.endIdx ?? 40,
      rowIdx: ed.rowIdx ?? 0,
      date: ed.date ?? (() => {
        const today = new Date(currentMonth);
        today.setDate(1 + (ed.rowIdx ?? 0));
        return formatDateJST(today);
      })(),
      startTime: ed.startTime ?? "09:00",
      endTime: ed.endTime ?? "10:00",
      title: ed.title ?? "",
      color: ed.color ?? COLORS_36[0],
    };
    setEntryData(filled);
    setEntryStep(step);
  }

  // ---- レスポンシブCSS ----
  // ※ 追加で外部css, CalendarTable.css等にも貼ってください
  const style = `
@media (max-width: 800px) {
  .event-dialog .dialog-content,
  .event-dialog-new .dialog-content {
    width: 97vw !important;
    min-width: 0 !important;
    max-width: 99vw !important;
    font-size: 17px !important;
    padding: 16px 7px !important;
  }
  .calendar-btn,
  .calendar-btn-main,
  .calendar-btn-outline {
    min-height: 44px !important;
    font-size: 18px !important;
    padding: 0 20px !important;
  }
  th, td {
    font-size: 15px !important;
  }
  .color-swatch {
    width: 28px !important;
    height: 28px !important;
  }
}
`;

  // ---- JSX ----
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#e3f2fd"
      }}
      onClick={handleRootClick}
    >
      <style>{style}</style>
      {/* ----- 表本体 ----- */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          position: "relative"
        }}
        onClick={e => e.stopPropagation()}
      >
        <table
          style={{
            width: tableWidth, minWidth: tableWidth,
            borderCollapse: "separate", tableLayout: "fixed"
          }}>
          <thead style={{
            position: "sticky",
            top: 0,
            zIndex: 120,
            background: '#f1f8ff'
          }}>
            <tr>
              <th style={{
                minWidth: DATE_COL_WIDTH, maxWidth: DATE_COL_WIDTH, width: DATE_COL_WIDTH,
                background: "#f5f7fa",
                borderRight: "1px solid #ccc",
                fontSize: 15, textAlign: "center",
                position: "sticky",
                left: 0,
                zIndex: 121,
              }}>
                日付＼時間
              </th>
           {Array.from({ length: 24 }).map((_, hour) => (
  <th
    key={hour}
    colSpan={4}
    style={{
      minWidth: cellWidth * 4,
      maxWidth: cellWidth * 4,
      width: cellWidth * 4,
      color: "#357",
      borderRight: "2px solid #42a5f5",
      fontWeight: 700,
      fontSize: 14,
      textAlign: "center",
      padding: "8px 0",
      boxSizing: "border-box",
      background: "#f1f8ff",  // 見やすさUP
    }}
  >
    {`${String(hour).padStart(2, "0")}:00`}
  </th>
))}

            </tr>
          </thead>
          <tbody>
            {daysArray.map((dayObj, rowIdx) => {
              const { day, date, holiday, isSunday, isSaturday } = dayObj;
              const dayEvents = events.filter(e => Number(e.day) === Number(day));
              return (
                <tr key={day}
                  style={{
                    height: ROW_HEIGHT,
                    borderBottom: getRowBottomBorder(rowIdx)
                  }}>
                  <td style={{
                    minWidth: DATE_COL_WIDTH, maxWidth: DATE_COL_WIDTH, width: DATE_COL_WIDTH,
                    background: "#fff", borderRight: "1px solid #bbb", textAlign: "right",
                    position: "sticky", left: 0,
                    zIndex: 100,
                    padding: 0, margin: 0, verticalAlign: "top"
                  }}>
                    <div style={{
                      width: "100%", height: ROW_HEIGHT, display: "flex", alignItems: "center",
                      justifyContent: "flex-end", paddingRight: 8
                    }}>
                      <span style={{
                        fontWeight: 700, fontSize: 18,
                        color: holiday ? "#e53935" : isSunday ? "#e53935" : isSaturday ? "#1976d2" : "#222",
                        userSelect: "none"
                      }}>
                        {day}日
                      </span>
                    </div>
                  </td>
                  {/* --- 96コマ分 --- */}
                  {Array.from({ length: 96 }).map((_, idx) => {
                    const isSel = isSelected(day, idx);
                    const evt = dayEvents.find(e => e.startIdx === idx);
                    const showGhost = ghostBar && ghostBar.rowIdx === rowIdx && ghostBar.startIdx === idx;
                    // ▼▼▼ 貼り付けゴースト（マウス下） ▼▼▼
                    const showPasteGhost = pasteMode && pasteGhost && pasteGhost.rowIdx === rowIdx && pasteGhost.idx === idx && barClipboard;
                    return (
                      <td key={idx}
                        className={isSel ? "selected-td" : ""}
                        style={{
                          width: cellWidth, minWidth: cellWidth, maxWidth: cellWidth,
                          height: ROW_HEIGHT,
                          borderRight: getCellRightBorder(idx),
                          background: isSel ? "#b2ebf2" : "#fff",
                          position: "relative", padding: 0, margin: 0,
                          overflow: "visible",
                          boxSizing: "border-box",
                          cursor: pasteMode ? "pointer" : undefined,
                          touchAction: "none",
                        }}
                        onMouseDown={e => handleCellMouseDown(day, idx, e)}
                        onTouchStart={e => handleCellMouseDown(day, idx, e)}
                        onMouseEnter={e => handleCellMouseEnter(day, idx)}
                        onDoubleClick={e => {
                          e.stopPropagation();
                          setSelectedCells([{ rowIdx, idx }]);
                          setEntryStep("select");
                          setEntryData({
                            rowIdx,
                            startIdx: idx,
                            endIdx: idx,
                          });
                        }}
                        onClick={e => { handlePasteCellClick(rowIdx, idx); }}
                        onTouchEnd={e => { handlePasteCellClick(rowIdx, idx); }}
                      >
                        {/* イベントバー */}
                      {/* イベントバー */}
{evt && !showGhost && (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 3,
      height: ROW_HEIGHT - 6,
      width: Math.max(0, (evt.endIdx - evt.startIdx + 1) * cellWidth - 2),
      background: evt.color,
      color: "#fff",
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      borderRadius: 7,
      border: selectedBar?.eventId === evt.id
        ? "3px solid #00A0FF"
        : isEventOverlapping(evt, dayEvents)
          ? "2px solid #e53935"
          : "1px solid #888",
      zIndex: selectedBar?.eventId === evt.id ? 11 : 10,
      cursor: dragMode ? "grabbing" : "pointer",
      opacity: dragMode && moveInfo && moveInfo.event.id === evt.id ? 0.65 : 1,
      boxShadow: selectedBar?.eventId === evt.id
        ? "0 0 0 2.5px #00A0FF, 0 2px 12px 2px #00A0FF66"
        : "0 2px 5px #3331",
      outline: selectedBar?.eventId === evt.id ? "2.5px solid #0072C6" : "none",
      boxSizing: "content-box",
      touchAction: "none"
    }}
    tabIndex={0}
    onClick={e => handleBarClick(evt, day, rowIdx, e)}
    onDoubleClick={e => {
      e.stopPropagation();
      handleEventCellDoubleClick(evt);
    }}
    onContextMenu={e => {
      e.preventDefault();
      setSelectedBar({ eventId: evt.id, day, rowIdx });
      setEditEvent({ event: evt, op: null });
    }}
    // ▼▼ クリックとドラッグの明確な分離 ▼▼
    onMouseDown={e => {
      if (e.button !== 0) return;
      let dragStarted = false;
      let startX = e.clientX, startY = e.clientY;
      handleBarClick(evt, day, rowIdx, e);

      function onMouseMove(me) {
        if (dragStarted) return;
        const dx = Math.abs(me.clientX - startX);
        const dy = Math.abs(me.clientY - startY);
        if (dx > 3 || dy > 3) {
          dragStarted = true;
          handleBarMouseDown(evt, "move", e, day, rowIdx); // ←移動開始
          cleanup();
        }
      }
      function cleanup() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", cleanup);
      }
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", cleanup);
    }}
    onTouchStart={e => {
      if (!e.touches || e.touches.length !== 1) return;
      let dragStarted = false;
      const touch = e.touches[0];
      let startX = touch.clientX, startY = touch.clientY;
      handleBarClick(evt, day, rowIdx, e);

      function onTouchMove(te) {
        if (dragStarted) return;
        const t = te.touches[0];
        const dx = Math.abs(t.clientX - startX);
        const dy = Math.abs(t.clientY - startY);
        if (dx > 5 || dy > 5) {
          dragStarted = true;
          handleBarMouseDown(evt, "move", e, day, rowIdx);
          cleanup();
        }
      }
      function cleanup() {
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", cleanup);
      }
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", cleanup);
    }}
    onMouseEnter={e => {
      clearTimeout(tooltipTimer.current);
      const rect = e.target.getBoundingClientRect();
      setTooltipPos({
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        w: rect.width
      });
      setHoveredEvent(evt);
    }}
    onMouseLeave={() => {
      tooltipTimer.current = setTimeout(() => setHoveredEvent(null), 90);
    }}
  >
    {/* 左リサイズハンドル */}
    <div
      style={{
        width: 9, height: "100%",
        borderRadius: "7px 0 0 7px",
        background: "rgba(255,255,255,0.13)",
        cursor: "ew-resize",
        alignSelf: "stretch"
      }}
      onMouseDown={e => handleBarMouseDown(evt, "resize-left", e, day, rowIdx)}
      onTouchStart={e => handleBarMouseDown(evt, "resize-left", e, day, rowIdx)}
      onContextMenu={e => e.preventDefault()}
    />
    {/* 中央タイトル */}
    <div style={{
      display: "flex",
      flexDirection: "column",
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      padding: "0 2px",
      overflow: "hidden",
      minWidth: 0,
    }}>
      <span style={{
        fontSize: 14,
        fontWeight: 600,
        textAlign: "center",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        width: "100%",
        lineHeight: 1.2,
      }}>
        {evt.title}
        {isEventOverlapping(evt, dayEvents) && (
          <span
            style={{
              marginLeft: 6,
              color: "#fff200",
              fontWeight: 900,
              fontSize: 15,
              verticalAlign: "middle",
              textShadow: "1px 1px 2px #e53935,0 0 5px #fff"
            }}
            title="重複イベント！"
          >⚠</span>
        )}
      </span>
      {(evt.endIdx - evt.startIdx) > 1 && (
        <span style={{
          fontSize: 15,
          fontWeight: 600,
          opacity: 0.93,
          lineHeight: 1.2,
          marginTop: 1,
          textShadow: "0 1px 2px #3335",
          width: "100%",
          textAlign: "center",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {formatRange(evt.startIdx, evt.endIdx)}
        </span>
      )}
    </div>
    {/* 右リサイズハンドル */}
    <div
      style={{
        width: 9, height: "100%",
        borderRadius: "0 7px 7px 0",
        background: "rgba(255,255,255,0.13)",
        cursor: "ew-resize",
        alignSelf: "stretch"
      }}
      onMouseDown={e => handleBarMouseDown(evt, "resize-right", e, day, rowIdx)}
      onTouchStart={e => handleBarMouseDown(evt, "resize-right", e, day, rowIdx)}
      onContextMenu={e => e.preventDefault()}
    />
  </div>
)}

                        {/* --- ゴーストバー --- */}
                        {showGhost && (
                          <div style={{
                            position: "absolute",
                            left: 0, top: 3,
                            height: ROW_HEIGHT - 6,
                            width: Math.round((ghostBar.endIdx - ghostBar.startIdx + 1) * cellWidth),
                            background: ghostBar.color,
                            opacity: 0.5,
                            border: "2.5px dashed #1976d2",
                            zIndex: 20,
                            pointerEvents: "none",
                            borderRadius: 7,
                            display: "flex",
                            alignItems: "center",
                            boxSizing: "border-box",
                          }}>
                            <div style={{
                              width: 9, height: "100%",
                              borderRadius: "7px 0 0 7px",
                              background: "rgba(255,255,255,0.2)",
                            }} />
                            <div style={{
                              display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center", width: "100%", padding: "0 2px", color: "#fff", textShadow: "0 1px 2px #3335", overflow: "hidden"
                            }}>
                              <span style={{
                                fontSize: 14, fontWeight: 600, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", lineHeight: 1.2,
                              }}>{ghostBar.title}</span>
                              {(ghostBar.endIdx - ghostBar.startIdx) > 1 && (
                                <span style={{
                                  fontSize: 15, fontWeight: 600, width: "100%", textAlign: "center", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                                }}>{formatRange(ghostBar.startIdx, ghostBar.endIdx)}</span>
                              )}
                            </div>
                            <div style={{
                              width: 9, height: "100%",
                              borderRadius: "0 7px 7px 0",
                              background: "rgba(255,255,255,0.2)",
                            }} />
                          </div>
                        )}
                        {/* --- 貼り付けゴーストバー（マウス下） --- */}
                        {showPasteGhost && (
                          <div style={{
                            position: "absolute",
                            left: 0, top: 3,
                            height: ROW_HEIGHT - 6,
                            width: Math.round((barClipboard.endIdx - barClipboard.startIdx + 1) * cellWidth),
                            background: barClipboard.color,
                            opacity: 0.54,
                            border: "2.5px dashed #0066cc",
                            zIndex: 100,
                            pointerEvents: "none",
                            borderRadius: 7,
                            display: "flex",
                            alignItems: "center",
                            boxSizing: "border-box",
                          }}>
                            <div style={{
                              width: 9, height: "100%",
                              borderRadius: "7px 0 0 7px",
                              background: "rgba(255,255,255,0.18)",
                            }} />
                            <div style={{
                              display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center", width: "100%", padding: "0 2px", color: "#fff", textShadow: "0 1px 2px #3335", overflow: "hidden"
                            }}>
                              <span style={{
                                fontSize: 14, fontWeight: 600, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", lineHeight: 1.2,
                              }}>{barClipboard.title}</span>
                              {(barClipboard.endIdx - barClipboard.startIdx) > 1 && (
                                <span style={{
                                  fontSize: 15, fontWeight: 600, width: "100%", textAlign: "center", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                                }}>{formatRange(barClipboard.startIdx, barClipboard.endIdx)}</span>
                              )}
                            </div>
                            <div style={{
                              width: 9, height: "100%",
                              borderRadius: "0 7px 7px 0",
                              background: "rgba(255,255,255,0.18)",
                            }} />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {/* --- 各種ダイアログ・ツールチップ --- */}
        <TooltipPortal evt={hoveredEvent} x={tooltipPos.x} y={tooltipPos.y} w={tooltipPos.w} />
        {entryStep === "select" && entryData && (
          <SelectEntryDialog
            onSelect={step => handleSelectDialogOpen(step, entryData)}
            onCancel={closeAllDialogs}
          />
        )}
        {entryStep === "new" && entryData && (
          <EventDialogNew
            entryData={entryData}
            setEntryData={setEntryData}
            onSave={() => handleEntrySave(entryData)}
            onCancel={closeAllDialogs}
          />
        )}
        {entryStep === "template" && entryData && (
          <TemplateDialog
            entryData={entryData}
            setEntryData={setEntryData}
            templates={templates}
            onSelectTemplate={tpl => {
              handleEntrySave({
                ...entryData,
                title: tpl.title,
                color: tpl.color,
                date: formatDateJST(daysArray[entryData.rowIdx].date),
                startTime: indexToTime(entryData.startIdx),
                endTime: indexToTime(entryData.endIdx + 1),
              });
            }}
            onCancel={closeAllDialogs}
          />
        )}
        {entryStep === "paste" && entryData && (
          <PasteDialog
            entryData={entryData}
            setEntryData={setEntryData}
            pasteCandidates={pasteCandidates}
            onSelectPaste={(title, color) => {
              handleEntrySave({
                ...entryData,
                title,
                color,
                date: formatDateJST(daysArray[entryData.rowIdx].date),
                startTime: indexToTime(entryData.startIdx),
                endTime: indexToTime(entryData.endIdx + 1),
              });
            }}
            onCancel={closeAllDialogs}
          />
        )}
        {editEvent && !editEvent.op && (
          <EventDialogEditMenu
            onEdit={() => setEditEvent(ev => ({ ...ev, op: "edit" }))}
            onCopy={() => setEditEvent(ev => ({ ...ev, op: "copy" }))}
            onDelete={() => setEditEvent(ev => ({ ...ev, op: "delete" }))}
            onCancel={closeAllDialogs}
          />
        )}
        {editEvent && editEvent.op === "edit" && (
          <EventDialogEdit editEvent={editEvent} setEditEvent={setEditEvent} onSave={handleEditEventSave} onCancel={closeAllDialogs} />
        )}
        {editEvent && editEvent.op === "delete" && (
          <EventDialogDelete editEvent={editEvent} onDelete={handleEditEventDelete} onCancel={closeAllDialogs} />
        )}
        {editEvent && editEvent.op === "copy" && (
          <EventDialogCopy editEvent={editEvent} onCopy={handleEditEventCopy} onCancel={closeAllDialogs} />
        )}
      </div>
      {/* フッター時間帯バー */}
      <div
        ref={footerTimeRef}
        style={{
          width: "100vw",
          overflowX: "hidden",
          background: "#fff",
          borderTop: "2.5px solid #42a5f5",
          position: "relative",
          height: 36,
          zIndex: 30,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: DATE_COL_WIDTH + cellWidth * 96,
            minWidth: DATE_COL_WIDTH + cellWidth * 96,
            display: "flex",
            alignItems: "center",
            position: "relative",
          }}
        >
          {/* 日付欄（空欄） */}
          <div
            style={{
              minWidth: DATE_COL_WIDTH,
              maxWidth: DATE_COL_WIDTH,
              width: DATE_COL_WIDTH,
              height: 34,
              background: "#f8fafd",
              borderRight: "1px solid #b4b7c7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 14,
              color: "#444",
              zIndex: 2
            }}
          ></div>
          {/* 時間帯（24個） */}
          {Array.from({ length: 24 }).map((_, hour) => (
            <div
              key={hour}
              style={{
                minWidth: cellWidth * 4,
                maxWidth: cellWidth * 4,
                width: cellWidth * 4,
                height: 34,
                borderRight: "2px solid #42a5f5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 16,
                color: "#1976d2",
                background: hour % 2 === 0 ? "#e3f2fd" : "#f9fbff",
                letterSpacing: 1,
                zIndex: 1,
                userSelect: "none"
              }}
            >
              {`${String(hour).padStart(2, "0")}:00`}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- ダイアログ群：全て省略なし（あなたの直近投稿の全文そのままコピペ） ----
// ここに EventDialogNew, EventDialogEditMenu, EventDialogEdit, EventDialogDelete,
// EventDialogCopy, TemplateDialog, PasteDialog, SelectEntryDialog
// 全部 **そのまま全文コピペ** してください（既にあなたの投稿にあります）



// --- ダイアログ群：前回のもの（全文）を利用 ---
// ... EventDialogNew, EventDialogEditMenu, EventDialogEdit, EventDialogDelete,
// ... EventDialogCopy, TemplateDialog, PasteDialog, SelectEntryDialog
// （ここはすでに提供されている全文を貼ってください！）


// ------ ダイアログ群・全文は前回のまま省略なしで使用可 ------
// ▼▼▼ 省略禁止！ ダイアログ全部全文必要な場合は「そのまま前回のもの」を貼って使ってください ▼▼▼


// ▼▼▼ この関数を差し替えてください ▼▼▼
function EventDialogNew({ entryData, setEntryData, onSave, onCancel }) {
  // useEffectを使用して、entryDataから時間インデックスを更新
  useEffect(() => {
    if (entryData.startTime && entryData.endTime) {
      const startIdx = timeToIndex(entryData.startTime);
      const endIdx = timeToIndex(entryData.endTime) - 1;
      // startIdxやendIdxが現在の値と異なる場合のみ更新
      if (entryData.startIdx !== startIdx || entryData.endIdx !== endIdx) {
        setEntryData(data => ({
          ...data,
          startIdx,
          endIdx: endIdx < startIdx ? startIdx : endIdx
        }));
      }
    }
  }, [entryData.startTime, entryData.endTime, setEntryData]);

  return (
    <>
      {/* --- CSSスタイル定義 --- */}
      <style>{`
        .event-dialog-new .dialog-content {
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
          padding: 28px;
          width: 100%;
          max-width: 480px;
          border: 1px solid #e2e8f0;
          animation: dialog-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes dialog-fade-in {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .event-dialog-new .dialog-header {
          font-size: 22px;
          font-weight: 700;
          color: #1a202c;
          margin-bottom: 24px;
        }

        .event-dialog-new .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          margin-bottom: 24px;
        }

        .event-dialog-new .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .event-dialog-new .form-group.full-width {
          grid-column: 1 / -1;
        }

        .event-dialog-new .form-group label {
          font-weight: 600;
          font-size: 14px;
          color: #4a5568;
        }

        .event-dialog-new .form-group input,
        .event-dialog-new .form-group select {
          padding: 12px;
          border: 1px solid #cbd5e0;
          border-radius: 8px;
          font-size: 15px;
          background-color: #f7fafc;
          transition: all 0.2s ease-in-out;
          color: #2d3748;
        }
        .event-dialog-new .form-group input:focus,
        .event-dialog-new .form-group select:focus {
          outline: none;
          border-color: #3182ce;
          box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.5);
          background-color: #fff;
        }

        .event-dialog-new .time-inputs {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .event-dialog-new .time-inputs span {
          color: #718096;
        }

        .event-dialog-new .color-palette {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
          gap: 8px;
          padding-top: 4px;
        }

        .event-dialog-new .color-swatch {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          border: 3px solid #fff;
          box-shadow: 0 0 0 1px #d1d5db;
          transition: all 0.2s ease-in-out;
          position: relative;
        }
        .event-dialog-new .color-swatch:hover {
          transform: scale(1.15);
          box-shadow: 0 0 0 1.5px #a0aec0;
        }
        .event-dialog-new .color-swatch.selected {
          box-shadow: 0 0 0 3px var(--swatch-color, #3182ce);
        }

        .event-dialog-new .dialog-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 28px;
          padding-top: 24px;
          border-top: 1px solid #e2e8f0;
        }
      `}</style>

      {/* --- JSX --- */}
      <div className="event-dialog-backdrop event-dialog-new" onClick={onCancel}>
        <div className="dialog-content" onClick={e => e.stopPropagation()}>
          
          <div className="dialog-header">新規予定</div>

          <div className="form-group full-width">
            <label htmlFor="event-title">用件</label>
            <input
              id="event-title"
              autoFocus
              value={entryData.title || ""}
              onChange={e => setEntryData(data => ({ ...data, title: e.target.value }))}
              onKeyDown={e => {
                if (e.key === "Enter" && entryData.title?.trim()) onSave();
                if (e.key === "Escape") onCancel();
              }}
              placeholder="例：クライアントとの打ち合わせ"
            />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="event-date">日付</label>
              <input
                id="event-date"
                type="date"
                value={entryData.date || ""}
                onChange={e => setEntryData(data => ({ ...data, date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>時間</label>
              <div className="time-inputs">
                <select
                  value={entryData.startTime}
                  onChange={e => setEntryData(data => ({
                    ...data,
                    startTime: e.target.value,
                  }))}
                >
                  {TIME_LIST.slice(0, 96).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span>〜</span>
                <select
                  value={entryData.endTime}
                  onChange={e => setEntryData(data => ({ ...data, endTime: e.target.value }))}
                >
                  {/* 開始時刻より前の時間は選択不可にする */}
                  {TIME_LIST.slice(timeToIndex(entryData.startTime) + 1).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="form-group full-width">
            <label>バー色</label>
            <div className="color-palette">
              {COLORS_36.map(c => (
                <div
                  key={c}
                  className={`color-swatch ${entryData.color === c ? 'selected' : ''}`}
                  style={{ background: c, '--swatch-color': c }}
                  onClick={() => setEntryData(data => ({ ...data, color: c }))}
                />
              ))}
            </div>
          </div>

          <div className="dialog-footer">
            <button className="calendar-btn calendar-btn-outline" onClick={onCancel}>キャンセル</button>
            <button
              className="calendar-btn calendar-btn-main"
              onClick={onSave}
              disabled={!entryData.title || !entryData.color || !entryData.date}
            >
              保存
            </button>
          </div>

        </div>
      </div>
    </>
  );
}

// ... 他ダイアログコンポーネントはそのまま ...
function EventDialogEditMenu({ onEdit, onCopy, onDelete, onCancel }) {
  return (
    <div className="event-dialog-backdrop" onClick={onCancel}>
      <div className="event-dialog" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 200 }}>
          <button className="calendar-btn calendar-btn-main" onClick={onEdit}>変更</button>
          <button className="calendar-btn calendar-btn-main" onClick={onCopy}>コピー</button>
          <button className="calendar-btn calendar-btn-main" onClick={onDelete}>削除</button>
        </div>
        <div style={{ marginTop: 20, textAlign: "right" }}>
          <button className="calendar-btn calendar-btn-outline" onClick={onCancel}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
function EventDialogEdit({ editEvent, setEditEvent, onSave, onCancel }) {
  return (
    <div className="event-dialog-backdrop" onClick={onCancel}>
      <div className="event-dialog" onClick={e => e.stopPropagation()}>
        <div>
          <label>日付：</label>
          <input
            type="date"
            value={editEvent.event.date || ""}
            onChange={e => setEditEvent(ev => ({ ...ev, event: { ...ev.event, date: e.target.value } }))}
            style={{ width: "150px", fontSize: 15, marginLeft: 4, marginBottom: 10 }}
          />
        </div>
        <div>
          <label>用件：</label>
          <input
            value={editEvent.event.title}
            onChange={e => setEditEvent(ev => ({ ...ev, event: { ...ev.event, title: e.target.value } }))}
            style={{ width: "180px", fontSize: 16, marginLeft: 4, marginBottom: 10 }}
            onKeyDown={e => {
              if (e.key === "Enter" && editEvent.event.title?.trim()) onSave(editEvent.event);
              if (e.key === "Escape") onCancel();
            }}
          />
        </div>
        <div>
          <label>バー色：</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 8 }}>
            {COLORS_36.map(c => (
              <div
                key={c}
                style={{
                  width: 22, height: 22, borderRadius: 4,
                  background: c,
                  border: editEvent.event.color === c ? "2.5px solid #1976d2" : "1.5px solid #bbb",
                  cursor: "pointer", margin: 1,
                }}
                onClick={() => setEditEvent(ev => ({ ...ev, event: { ...ev.event, color: c } }))}
              />
            ))}
          </div>
        </div>
        <div style={{ marginTop: 18, textAlign: "right" }}>
          <button className="calendar-btn calendar-btn-main" onClick={() => onSave(editEvent.event)} style={{ marginRight: 8 }}>保存</button>
          <button className="calendar-btn calendar-btn-outline" onClick={onCancel}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
function EventDialogDelete({ editEvent, onDelete, onCancel }) {
  return (
    <div className="event-dialog-backdrop" onClick={onCancel}>
      <div className="event-dialog" onClick={e => e.stopPropagation()}>
        <div>本当に削除しますか？</div>
        <div style={{ marginTop: 18, textAlign: "right" }}>
          <button className="calendar-btn calendar-btn-main" onClick={() => onDelete(editEvent.event)} style={{ marginRight: 8, background: "#e53935" }}>削除</button>
          <button className="calendar-btn calendar-btn-outline" onClick={onCancel}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
function EventDialogCopy({ editEvent, onCopy, onCancel }) {
  return (
    <div className="event-dialog-backdrop" onClick={onCancel}>
      <div className="event-dialog" onClick={e => e.stopPropagation()}>
        <div>この用件を「貼り付け候補」にコピーしますか？</div>
        <div style={{ marginTop: 18, textAlign: "right" }}>
          <button className="calendar-btn calendar-btn-main" onClick={() => onCopy(editEvent.event)} style={{ marginRight: 8 }}>コピー</button>
          <button className="calendar-btn calendar-btn-outline" onClick={onCancel}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
function TemplateDialog({ entryData, setEntryData, templates, onSelectTemplate, onCancel }) {
  return (
    <div className="event-dialog-backdrop" onClick={onCancel}>
      <div className="event-dialog" onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: 10, fontWeight: 700 }}>テンプレートから選択：</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {templates && templates.length > 0 ? (
            templates.map(tpl => (
              <button
                key={tpl.id}
                className="calendar-btn calendar-btn-main"
                style={{ background: tpl.color, color: "#fff" }}
                onClick={() => onSelectTemplate(tpl)}
              >
                {tpl.title}
              </button>
            ))
          ) : (
            <div style={{ color: "#888" }}>テンプレートがありません</div>
          )}
        </div>
        <div style={{ marginTop: 20, textAlign: "right" }}>
          <button className="calendar-btn calendar-btn-outline" onClick={onCancel}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
function PasteDialog({ entryData, setEntryData, pasteCandidates, onSelectPaste, onCancel }) {
  return (
    <div className="event-dialog-backdrop" onClick={onCancel}>
      <div className="event-dialog" onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: 10, fontWeight: 700 }}>貼り付け候補：</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pasteCandidates && pasteCandidates.length > 0 ? (
            pasteCandidates.map(([key, count]) => {
              const [title, color] = key.split("__");
              return (
                <button
                  key={key}
                  className="calendar-btn calendar-btn-main"
                  style={{ background: color, color: "#fff" }}
                  onClick={() => onSelectPaste(title, color)}
                >
                  {title}（{count}回）
                </button>
              );
            })
          ) : (
            <div style={{ color: "#888" }}>貼り付け候補がありません</div>
          )}
        </div>
        <div style={{ marginTop: 20, textAlign: "right" }}>
          <button className="calendar-btn calendar-btn-outline" onClick={onCancel}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
function SelectEntryDialog({ onSelect, onCancel }) {
  return (
    <div className="event-dialog-backdrop" onClick={onCancel}>
      <div className="event-dialog" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "stretch", minWidth: 200 }}>
          <button className="calendar-btn calendar-btn-main" onClick={() => onSelect("new")}>新規入力</button>
          <button className="calendar-btn calendar-btn-main" onClick={() => onSelect("template")}>テンプレート</button>
          <button className="calendar-btn calendar-btn-main" onClick={() => onSelect("paste")}>貼り付け</button>
        </div>
        <div style={{ marginTop: 20, textAlign: "right" }}>
          <button className="calendar-btn calendar-btn-outline" onClick={onCancel}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
