import React, { useState, useRef, useEffect, useMemo } from "react";
import { db } from "../firebase";
import {
  collection, query, where, onSnapshot, doc, updateDoc, addDoc, deleteDoc
} from "firebase/firestore";
import Holidays from "date-holidays";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { PickersDay } from "@mui/x-date-pickers/PickersDay";
import Tooltip from "@mui/material/Tooltip";
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import ja from "date-fns/locale/ja";
import "./CalendarTable.css";

// --- Util関数 ---
function formatDateJST(date) {
  if (!date || typeof date.getFullYear !== "function") return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatMonthJST(date) {
  if (!date || typeof date.getFullYear !== "function") return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function formatTime(idx) {
  const h = Math.floor(idx / 4);
  const m = (idx % 4) * 15;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
const COLORS_36 = [
  "#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5", "#2196f3",
  "#03a9f4", "#00bcd4", "#009688", "#4caf50", "#8bc34a", "#cddc39",
  "#ffeb3b", "#ffc107", "#ff9800", "#ff5722", "#795548", "#607d8b",
  "#c2185b", "#7b1fa2", "#512da8", "#1976d2", "#0288d1", "#0097a7",
  "#388e3c", "#689f38", "#afb42b", "#fbc02d", "#ffa000", "#f57c00",
  "#e64a19", "#5d4037", "#455a64", "#6d4c41", "#00acc1", "#43a047"
];
function getCellKey(userId, idx) { return `${userId}-${idx}`; }
function getNowCellIndex() {
  const now = new Date();
  return now.getHours() * 4 + Math.floor(now.getMinutes() / 15);
}
function isEventOverlapping(evt, allEvents) {
  const evtStart = Number(evt.startIdx);
  const evtEnd = Number(evt.endIdx) + 1;
  return allEvents.some(e => {
    if (e.id === evt.id) return false;
    if (String(e.userId) !== String(evt.userId)) return false;
    const otherStart = Number(e.startIdx);
    const otherEnd = Number(e.endIdx) + 1;
    return evtStart < otherEnd && otherStart < evtEnd;
  });
}

// ------------------ CalendarDayコンポーネント本体 ------------------
export default function CalendarDay({
  groups, users, currentGroup, onChangeGroup,
  currentDate, setCurrentDate, handlePrevDate, handleNextDate, handleNowDate
}) {
  // ★ 完全レスポンシブなcellSize
const [cellSize, setCellSize] = useState(() => {
  const w = window.innerWidth;
  if (w < 500) return { cellWidth: 36, rowHeight: 44, userColWidth: 70 };
  if (w < 700) return { cellWidth: 28, rowHeight: 36, userColWidth: 96 };
  if (w < 900) return { cellWidth: 24, rowHeight: 32, userColWidth: 120 };
  return { cellWidth: 22, rowHeight: 32, userColWidth: 140 };
});
useEffect(() => {
  function handleResize() {
    const w = window.innerWidth;
    if (w < 500) setCellSize({ cellWidth: 36, rowHeight: 44, userColWidth: 70 });
    else if (w < 700) setCellSize({ cellWidth: 28, rowHeight: 36, userColWidth: 96 });
    else if (w < 900) setCellSize({ cellWidth: 24, rowHeight: 32, userColWidth: 120 });
    else setCellSize({ cellWidth: 22, rowHeight: 32, userColWidth: 140 });
  }
  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}, []);

  const [events, setEvents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [entryStep, setEntryStep] = useState(null);
  const [entryData, setEntryData] = useState(null);
  const [editEvent, setEditEvent] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [selectedCells, setSelectedCells] = useState([]);
  const [dragMode, setDragMode] = useState(null);
  const [selectInfo, setSelectInfo] = useState(null);

  const moveInfoRef = useRef(null);
  const dragModeRef = useRef();
  const selectInfoRef = useRef();

  const [renderFlag, setRenderFlag] = useState(false);
  const [clipboard, setClipboard] = useState(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteGhost, setPasteGhost] = useState(null);

  useEffect(() => { dragModeRef.current = dragMode; }, [dragMode]);
  useEffect(() => { selectInfoRef.current = selectInfo; }, [selectInfo]);

  const orderedUsers = useMemo(() =>
    users && currentGroup
      ? users.filter(u => u && u.groupId === currentGroup.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : []
    , [users, currentGroup]);

  const tableScrollRef = useRef(null);

  useEffect(() => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollLeft = cellSize.userColWidth + cellSize.cellWidth * 36;
    }
  }, [currentDate, currentGroup, cellSize]);

  // Firestore取得
  useEffect(() => {
    if (!orderedUsers.length || !currentDate || typeof currentDate.getFullYear !== "function") {
      setEvents([]);
      return;
    }
    const dateStr = formatDateJST(currentDate);
    const userIds = orderedUsers.map(u => String(u.id));
    let unsubs = [];
    for (let i = 0; i < userIds.length; i += 10) {
      const targetIds = userIds.slice(i, i + 10);
      const q = query(
        collection(db, "events"),
        where("userId", "in", targetIds),
        where("date", "==", dateStr)
      );
      const unsub = onSnapshot(q, (snap) => {
        setEvents(prev => {
          const others = prev.filter(e => !targetIds.includes(String(e.userId)));
          return [...others, ...snap.docs.map(doc => ({ ...doc.data(), id: doc.id }))];
        });
      });
      unsubs.push(unsub);
    }
    return () => unsubs.forEach(f => f());
  }, [orderedUsers, currentDate]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "templates"), (snap) => {
      setTemplates(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    });
    return () => unsub();
  }, []);

  const hd = useMemo(() => new Holidays('JP'), []);
  function formatDateDisplay(date) {
    if (!date || typeof date.getFullYear !== "function") return "-";
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const w = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
    return `${y}/${m}/${d}（${w}）`;
  }
  const holidayObj = hd.isHoliday(formatDateJST(currentDate));
  const holidayName = holidayObj
    ? Array.isArray(holidayObj)
      ? holidayObj[0].name
      : holidayObj.name
    : "";
  const weekDay = (currentDate && typeof currentDate.getDay === "function") ? currentDate.getDay() : 0;
  let dateColor = "#222";
  if (holidayName) dateColor = "#e53935";
  else if (weekDay === 0) dateColor = "#e53935";
  else if (weekDay === 6) dateColor = "#1976d2";
  const today = new Date();
  const isToday =
    currentDate &&
    typeof currentDate.getFullYear === "function" &&
    today.getFullYear() === currentDate.getFullYear() &&
    today.getMonth() === currentDate.getMonth() &&
    today.getDate() === currentDate.getDate();

  let selectedCellSet = new Set();
  if (
    dragMode === "select" &&
    selectInfo &&
    (selectInfo.startUserIdx === selectInfo.endUserIdx) &&
    orderedUsers[selectInfo.startUserIdx]
  ) {
    const min = Math.min(selectInfo.startIdx, selectInfo.endIdx);
    const max = Math.max(selectInfo.startIdx, selectInfo.endIdx);
    for (let i = min; i <= max; ++i) {
      selectedCellSet.add(getCellKey(String(orderedUsers[selectInfo.startUserIdx].id), i));
    }
  }
  if (selectedCells.length > 0) {
    selectedCells.forEach(c => {
      selectedCellSet.add(getCellKey(String(c.userId), c.idx));
    });
  }

  let ghostBar = null;
  if (
    dragMode &&
    moveInfoRef.current &&
    (dragMode === "move" || dragMode === "resize-left" || dragMode === "resize-right")
  ) {
    ghostBar = {
      userIdx: moveInfoRef.current.userIdx,
      startIdx: moveInfoRef.current.startIdx,
      endIdx: moveInfoRef.current.endIdx,
      color: moveInfoRef.current.event.color,
      title: moveInfoRef.current.event.title,
    };
  }

  const [nowCellIdx, setNowCellIdx] = useState(getNowCellIndex());
  useEffect(() => {
    const timer = setInterval(() => setNowCellIdx(getNowCellIndex()), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (editEvent || entryStep || showTemplateManager) return;
      if (pasteMode && e.key === "Escape") {
        setPasteMode(false);
        setPasteGhost(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedEventId) {
        e.preventDefault();
        const evt = events.find(ev => ev.id === selectedEventId);
        if (evt) {
          setEditEvent({ event: evt, op: "delete" }); // ← これだけ！
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selectedEventId) {
        e.preventDefault();
        const evt = events.find(ev => ev.id === selectedEventId);
        if (evt) {
          setClipboard({
            title: evt.title,
            color: evt.color,
            duration: Math.abs(evt.endIdx - evt.startIdx)
          });
          setEditEvent(null);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        if (!clipboard) {
          alert("コピーされた用件がありません");
          return;
        }
        setPasteMode(true);
        setPasteGhost(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEventId, clipboard, pasteMode, editEvent, entryStep, showTemplateManager, events]);

  function handleCellClick(e) {
    if (dragMode || pasteMode) return;
    const td = e.currentTarget;
    const idx = parseInt(td.dataset.idx, 10);
    const userIdx = parseInt(td.dataset.useridx, 10);
    if (userIdx < 0 || userIdx >= orderedUsers.length || !orderedUsers[userIdx]) return;
    setSelectedCells([{ userId: String(orderedUsers[userIdx].id), idx }]);
    setEntryStep(null);
    setEntryData(null);
    setSelectedEventId(null);
    setEditEvent(null);
  }
  function handleCellMouseDown(e) {
    if (e.button !== 0 || pasteMode) return;
    const td = e.currentTarget;
    const idx = parseInt(td.dataset.idx, 10);
    const userIdx = parseInt(td.dataset.useridx, 10);
    if (userIdx < 0 || userIdx >= orderedUsers.length || !orderedUsers[userIdx]) return;
    setDragMode("select");
    setSelectInfo({
      userIdx,
      userId: String(orderedUsers[userIdx].id),
      startIdx: idx,
      endIdx: idx,
      startUserIdx: userIdx,
      endUserIdx: userIdx,
    });
    setSelectedCells([]);
    setEntryStep(null);
    setEntryData(null);
    setSelectedEventId(null);
    setEditEvent(null);
  }
  function handleCellTouchStart(e) {
    if (pasteMode) return;
      e.preventDefault(); // ← これ追加
    const td = e.currentTarget;
    const idx = parseInt(td.dataset.idx, 10);
    const userIdx = parseInt(td.dataset.useridx, 10);
    if (userIdx < 0 || userIdx >= orderedUsers.length || !orderedUsers[userIdx]) return;
    setDragMode("select");
    setSelectInfo({
      userIdx,
      userId: String(orderedUsers[userIdx].id),
      startIdx: idx,
      endIdx: idx,
      startUserIdx: userIdx,
      endUserIdx: userIdx,
    });
    setSelectedCells([]);
    setEntryStep(null);
    setEntryData(null);
    setSelectedEventId(null);
    setEditEvent(null);

    let lastIdx = idx;
    function onTouchMove(te) {
      if (!te.touches[0]) return;
      const rect = td.parentNode.parentNode.getBoundingClientRect();
      const x = te.touches[0].clientX - rect.left - cellSize.userColWidth;
      let cellIdx = Math.floor(x / cellSize.cellWidth);
      cellIdx = Math.max(0, Math.min(95, cellIdx));
      setSelectInfo(si => ({
        ...si,
        endIdx: cellIdx,
        endUserIdx: userIdx,
      }));
      lastIdx = cellIdx;
    }
    function onTouchEnd() {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      if (
        selectInfoRef.current &&
        selectInfoRef.current.startUserIdx === selectInfoRef.current.endUserIdx &&
        Math.abs(selectInfoRef.current.startIdx - selectInfoRef.current.endIdx) > 0
      ) {
        const min = Math.min(selectInfoRef.current.startIdx, selectInfoRef.current.endIdx);
        const max = Math.max(selectInfoRef.current.startIdx, selectInfoRef.current.endIdx);
        const arr = [];
        for (let i = min; i <= max; ++i) {
          arr.push({ userId: String(orderedUsers[selectInfoRef.current.startUserIdx].id), idx: i });
        }
        setSelectedCells(arr);
        setEntryStep("select");
        setEntryData({
          userId: selectInfoRef.current.userId,
          startIdx: min,
          endIdx: max,
        });
      }
      setDragMode(null);
      setSelectInfo(null);
    }
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: false });
  }
  function handleCellMouseEnter(e) {
    if (pasteMode) {
      const td = e.currentTarget;
      const idx = parseInt(td.dataset.idx, 10);
      const userIdx = parseInt(td.dataset.useridx, 10);
      setPasteGhost({ userIdx, idx });
      return;
    }
    if (dragModeRef.current === "select" && selectInfoRef.current) {
      const td = e.currentTarget;
      const idx = parseInt(td.dataset.idx, 10);
      const userIdx = parseInt(td.dataset.useridx, 10);
      setSelectInfo(si => ({
        ...si,
        endIdx: idx,
        endUserIdx: userIdx,
      }));
    }
  }
  useEffect(() => {
    function onMouseUp() {
      if (pasteMode) return;
      const dragMode = dragModeRef.current;
      const selectInfo = selectInfoRef.current;
      if (dragMode === "select" && selectInfo) {
        if (
          selectInfo.startUserIdx === selectInfo.endUserIdx &&
          Math.abs(selectInfo.startIdx - selectInfo.endIdx) > 0
        ) {
          const min = Math.min(selectInfo.startIdx, selectInfo.endIdx);
          const max = Math.max(selectInfo.startIdx, selectInfo.endIdx);
          const arr = [];
          for (let i = min; i <= max; ++i) {
            arr.push({ userId: String(orderedUsers[selectInfo.startUserIdx].id), idx: i });
          }
          setSelectedCells(arr);
          setEntryStep("select");
          setEntryData({
            userId: selectInfo.userId,
            startIdx: min,
            endIdx: max,
          });
        }
        setDragMode(null);
        setSelectInfo(null);
      }
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [orderedUsers, pasteMode]);

  const handleCellDoubleClick = (userId, idx) => {
    if (dragMode || pasteMode) return;
    if (selectedCells.length !== 1 ||
      selectedCells[0].userId !== String(userId) ||
      selectedCells[0].idx !== idx) {
      setSelectedCells([{ userId: String(userId), idx }]);
    }
    setEntryStep("select");
    setEntryData({ userId: String(userId), idx, startIdx: idx, endIdx: idx });
    setSelectedEventId(null);
    setEditEvent(null);
  };

  function openEditTab(evt) {
    setEditEvent({ event: { ...evt }, op: null });
    setSelectedEventId(evt.id);
    setSelectedCells([]);
    setEntryStep(null);
    setEntryData(null);
    setDragMode(null);
    setSelectInfo(null);
    moveInfoRef.current = null;
  }

  useEffect(() => {
    function handleClickAway(e) {
      if (!e.target.closest('.event-dialog')) {
        setEditEvent(null);
        setSelectedEventId(null);
        setEntryStep(null);
        setEntryData(null);
      }
    }
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, []);

  function handleBarMouseDown(evt, mode, e, userId, userIdx) {
    if (pasteMode) return;
    e.stopPropagation();
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    moveInfoRef.current = {
      event: evt,
      userId,
      userIdx,
      startX,
      startY,
      offsetX: startX - e.target.getBoundingClientRect().left,
      offsetY: startY - e.target.getBoundingClientRect().top,
      originalStart: evt.startIdx,
      originalEnd: evt.endIdx,
      startIdx: evt.startIdx,
      endIdx: evt.endIdx
    };
    setDragMode(
      mode === "left" ? "resize-left" :
        mode === "right" ? "resize-right" : "move"
    );
    setSelectedEventId(evt.id);
    setSelectedCells([]);
    setEntryStep(null);
    setEntryData(null);
    setEditEvent(null);
    document.body.style.userSelect = "none";
    setRenderFlag(f => !f);
  }

// --- ここをCalendarDay関数の中の適切な位置（stateやrefなどの定義より下、returnより上）に書いてください ---

// ドラッグ処理
function onMouseMove(e) {
  if (!dragModeRef.current) return;
  const mi = moveInfoRef.current;
  if (!mi) return;

  const diffX = e.clientX - mi.startX;
  const diffCells = Math.round(diffX / cellSize.cellWidth);

  if (dragModeRef.current === "move") {
    let newStart = mi.originalStart + diffCells;
    let newEnd = mi.originalEnd + diffCells;
    if (newStart < 0) {
      newEnd += -newStart;
      newStart = 0;
    }
    if (newEnd > 95) {
      newStart -= (newEnd - 95);
      newEnd = 95;
    }

    // 修正: tableNodeが取れない場合は何もしない
    let tableNode = document.querySelector('.calendar-table'); // ← 安定取得
    if (!tableNode) return;

    let rect = tableNode.getBoundingClientRect();
    let mouseY = e.clientY - rect.top;
    let newUserIdx = Math.floor(mouseY / cellSize.rowHeight);

    if (newUserIdx < 0) newUserIdx = 0;
    if (newUserIdx >= orderedUsers.length) newUserIdx = orderedUsers.length - 1;

    moveInfoRef.current = {
      ...mi,
      startIdx: Math.max(0, newStart),
      endIdx: Math.min(95, newEnd),
      userIdx: newUserIdx
    };
  } else if (dragModeRef.current === "resize-left") {
    let newStart = Math.min(mi.originalEnd, Math.max(0, mi.originalStart + diffCells));
    if (newStart > mi.originalEnd) newStart = mi.originalEnd;
    moveInfoRef.current = {
      ...mi,
      startIdx: newStart
    };
  } else if (dragModeRef.current === "resize-right") {
    let newEnd = Math.max(mi.originalStart, Math.min(95, mi.originalEnd + diffCells));
    if (newEnd < mi.originalStart) newEnd = mi.originalStart;
    moveInfoRef.current = {
      ...mi,
      endIdx: newEnd
    };
  }
  setRenderFlag(f => !f);
}



// --- useEffectでイベント登録 ---
useEffect(() => {
  function onMouseUp() {
    document.body.style.userSelect = "";
    const mi = moveInfoRef.current;
    if (dragModeRef.current && mi) {
      let newUserIdx = mi.userIdx;
      let newStartIdx = mi.startIdx;
      let newEndIdx = mi.endIdx;
      const newUser = orderedUsers[newUserIdx];

      if (
        newUser && (
          newStartIdx !== mi.event.startIdx ||
          newEndIdx !== mi.event.endIdx ||
          String(newUser.id) !== String(mi.event.userId)
        )
      ) {
        updateDoc(doc(db, "events", mi.event.id), {
          ...mi.event,
          startIdx: newStartIdx,
          endIdx: newEndIdx,
          userId: String(newUser.id),
          date: formatDateJST(currentDate),
          month: formatMonthJST(currentDate)
        });
      }
    }
    moveInfoRef.current = null;
    setDragMode(null);
    setRenderFlag(f => !f);
  }

  if (dragMode) {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp, { once: true });
  }
  return () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };
}, [dragMode, db, currentDate, orderedUsers, cellSize]);




  function handleBarDoubleClick(evt, e) {
    if (pasteMode) return;
    e.stopPropagation();
    openEditTab(evt);
  }
  function handleBarContextMenu(evt, e) {
    if (pasteMode) return;
    e.preventDefault();
    e.stopPropagation();
    openEditTab(evt);
  }

  function handleEntryNext(step, extra) {
    setEntryStep(step);
    setEntryData(prev => ({ ...prev, ...extra }));
  }
  function handleEntryCancel() {
    setEntryStep(null);
    setEntryData(null);
    setEditEvent(null);
    setSelectedCells([]);
    setSelectedEventId(null);
  }
  async function handleEntrySave() {
    let { userId, idx, startIdx, endIdx, title, color, startTime, endTime } = entryData;

    if (!title?.trim()) {
      alert("用件を入力してください。");
      return;
    }
    if (!color) {
      alert("バーの色を選んでください。");
      return;
    }

    // 時刻選択優先
    if (startTime && endTime) {
      startIdx = timeStringToIndex(startTime);
      endIdx = timeStringToIndex(endTime) - 1;
      if (endIdx < startIdx) [startIdx, endIdx] = [startIdx, endIdx];
    } else {
      startIdx = typeof startIdx === "number" ? startIdx : idx;
      endIdx = typeof endIdx === "number" ? endIdx : idx;
    }

    startIdx = Math.max(0, Math.min(95, startIdx));
    endIdx = Math.max(0, Math.min(95, endIdx));

    if (isEventOverlapping({ id: undefined, userId, startIdx, endIdx }, events)) {
      alert("他の予定と重複しています！");
      return;
    }
    const dateObj = currentDate instanceof Date ? currentDate : new Date(currentDate);
    const dateStr = formatDateJST(dateObj);
    const monthStr = formatMonthJST(dateObj);
    const dayNum = dateObj.getDate();
    try {
      await addDoc(collection(db, "events"), {
        userId: String(userId),
        title: title.trim(),
        color,
        startIdx,
        endIdx,
        date: dateStr,
        month: monthStr,
        day: dayNum
      });
      setEntryStep(null);
      setEntryData(null);
      setSelectedCells([]);
      setSelectedEventId(null);
      setEditEvent(null);
    } catch (e) {
      alert("保存できませんでした: " + e.message);
    }
  }


  function timeStringToIndex(str) {
    if (!str) return 0;
    const [h, m] = str.split(":").map(Number);
    return h * 4 + Math.floor(m / 15);
  }

  async function handleEditEventSave(changed) {
    if (!changed.title.trim()) return;
    let startIdx = Math.max(0, Math.min(95, changed.startIdx));
    let endIdx = Math.max(0, Math.min(95, changed.endIdx));
    if (endIdx < startIdx) [startIdx, endIdx] = [endIdx, startIdx];
    if (isEventOverlapping({ ...changed, startIdx, endIdx }, events)) {
      alert("他の予定と重複しています！");
      return;
    }
    await updateDoc(doc(db, "events", changed.id), {
      userId: String(changed.userId),
      startIdx,
      endIdx,
      title: changed.title,
      color: changed.color,
      date: formatDateJST(currentDate),
      month: formatMonthJST(currentDate),
    });
    setEditEvent(null);
    setSelectedEventId(null);
  }
  async function handleEditEventDelete(evt) {
    await deleteDoc(doc(db, "events", evt.id));
    setEditEvent(null);
    setSelectedEventId(null);
  }

  // テンプレート機能
  async function handleAddTemplate(title, color) {
    if (!title.trim() || !color) return;
    await addDoc(collection(db, "templates"), { title: title.trim(), color });
  }
  async function handleDeleteTemplate(id) {
    await deleteDoc(doc(db, "templates", id));
  }

  async function handlePasteAtCell(userIdx, idx) {
    if (!clipboard) return;
    const userId = orderedUsers[userIdx].id;
    const s = idx;
    const e = Math.min(idx + clipboard.duration, 95);
    await addDoc(collection(db, "events"), {
      userId: String(userId),
      title: clipboard.title,
      color: clipboard.color,
      startIdx: s,
      endIdx: e,
      date: formatDateJST(currentDate),
      month: formatMonthJST(currentDate),
      day: currentDate.getDate()
    });
    setPasteMode(false);
    setPasteGhost(null);
  }

  if (!currentGroup || !users || users.length === 0 || orderedUsers.length === 0) {
    return (
      <div style={{ padding: 40 }}>
        表示できるグループまたはユーザーがいません（右上の追加ボタンからどうぞ）
      </div>
    );
  }

 return (
    <>
      <div className="calendar-root">
        <div
          className="calendar-header-bar"
          style={{
            display: "flex", alignItems: "center", gap: 16,
            background: "#f9fbff", borderBottom: "2px solid #e1e5ee", padding: 10, marginBottom: 3
          }}
        >
          <button className="calendar-btn calendar-btn-main" onClick={handlePrevDate}>前日</button>
          <button className="calendar-btn calendar-btn-outline" onClick={handleNowDate}>今日</button>
          <button className="calendar-btn calendar-btn-main" onClick={handleNextDate}>翌日</button>
          <span
            style={{
              fontWeight: 700,
              fontSize: 22,
              color: dateColor,
              marginLeft: 24,
              marginRight: 8
            }}
          >
            {formatDateDisplay(currentDate)}
          </span>
          {holidayName && (
            <span
              style={{
                color: "#e53935",
                fontWeight: 700,
                fontSize: 16,
                marginLeft: 5
              }}
            >
              {holidayName}
            </span>
          )}
          <div style={{ marginLeft: 18, minWidth: 180 }}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ja}>
              <DatePicker
                value={currentDate}
                format="yyyy-MM-dd"
                onChange={newDate => {
                  if (newDate) setCurrentDate(newDate);
                }}
                slotProps={{
                  textField: {
                    size: "small",
                    inputProps: {
                      style: {
                        fontSize: 16,
                        padding: "3px 8px",
                        border: "1.5px solid #97b7de",
                        borderRadius: 6,
                        background: "#fff",
                        color: "#2979ff",
                        height: 36,
                        minWidth: 132
                      }
                    }
                  }
                }}
                slots={{
                  day: (props) => {
                    const day = props.day;
                    const hObj = hd.isHoliday(formatDateJST(day));
                    const holiday = hObj ? (Array.isArray(hObj) ? hObj[0].name : hObj.name) : "";
                    const isSunday = day.getDay() === 0;
                    const isSaturday = day.getDay() === 6;
                    let sx = {};
                    if (holiday) {
                      sx = { color: "#e53935" };
                    } else if (isSunday) {
                      sx = { color: "#e53935" };
                    } else if (isSaturday) {
                      sx = { color: "#1976d2" };
                    }
                    return (
                      <Tooltip title={holiday || ""} key={day.toString()}>
                        <PickersDay {...props} sx={sx} />
                      </Tooltip>
                    );
                  }
                }}
              />
            </LocalizationProvider>
          </div>
        
          {pasteMode &&
            <span style={{ marginLeft: 14, fontWeight: 700, color: "#1976d2", fontSize: 16 }}>
              クリックで貼り付け、ESCで解除
            </span>
          }
        </div>

        <div
          className="calendar-table-scroll"
          ref={tableScrollRef}
          style={{
            overflowX: "auto",
            overflowY: "visible",
            border: "1px solid #bbb",
            borderRadius: 12,
            marginTop: 10,
            background: "#fff",
            position: "relative",
            width: "100%",
            maxWidth: "100vw"
          }}
        >
          <table
            className="calendar-table"
            style={{
              minWidth: cellSize.userColWidth + cellSize.cellWidth * 96,
              tableLayout: "fixed",
              borderCollapse: "collapse",
              background: "#fff"
            }}
          >
            <thead>
              <tr>
                <th
                  className="calendar-th calendar-th-sticky"
                  style={{
                    minWidth: cellSize.userColWidth,
                    maxWidth: cellSize.userColWidth,
                    background: "#1976d2",
                    color: "#fff",
                    textAlign: "center",
                    position: "sticky",
                    left: 0,
                    zIndex: 20,
                    borderRight: "2.5px solid #1565c0",
                    borderTop: "1px solid #bbb",
                    borderBottom: "1px solid #bbb",
                    borderLeft: "1px solid #bbb",
                    boxSizing: "border-box",
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  ユーザー｜時間
                </th>
                {Array.from({ length: 24 }).map((_, h) => (
                  <th
                    key={h}
                    colSpan={4}
                    className="calendar-th-hour"
                    style={{
                      minWidth: cellSize.cellWidth * 4,
                      maxWidth: cellSize.cellWidth * 4,
                      fontSize: 14,
                      fontWeight: 700,
                      background: "#f1f8ff",
                      color: "#4a6fa4",
                      borderTop: "1px solid #bbb",
                      borderBottom: "1px solid #bbb",
                      borderRight: "1px solid #42a5f5",
                      textAlign: "center",
                      boxSizing: "border-box",
                      zIndex: 10,
                    }}
                   >{`${h.toString().padStart(2, "0")}:00`}</th>
))}
              </tr>
            </thead>
    <tbody>
  {orderedUsers
    .filter(Boolean)
    .map((user, userIdx) => (
      <tr key={user.id} style={{ height: cellSize.rowHeight, position: "relative" }}>
        {/* --- ユーザー名セル --- */}
        <td
          style={{
            minWidth: cellSize.userColWidth,
            maxWidth: cellSize.userColWidth,
            background: "#fff",
            borderRight: "2.5px solid #1565c0",
            fontWeight: 600,
            fontSize: 15,
            position: "sticky",
            left: 0,
            zIndex: 10,
            textAlign: "center",
            padding: 0,
            borderTop: "1px solid #eee",
            borderBottom: "1px solid #eee",
            boxSizing: "border-box",
            verticalAlign: "middle",
            letterSpacing: 1.5,
          }}
        >
          {user.name}
        </td>
        {/* --- 96セル --- */}
        {Array.from({ length: 96 }).map((_, idx) => {
          const isHourBorder = (idx + 1) % 4 === 0;
          const isSelected = selectedCellSet.has(getCellKey(String(user.id), idx));
          const evt = events.find(e => String(e.userId) === String(user.id) && Number(e.startIdx) === idx);

          return (
            <td
              key={idx}
              className={`calendar-td${isSelected ? " selected-td" : ""}`}
              style={{
                width: cellSize.cellWidth,
                minWidth: cellSize.cellWidth,
                maxWidth: cellSize.cellWidth,
                height: cellSize.rowHeight,
                borderRight: isHourBorder ? "1px dashed #42a5f5" : "1px solid #eee",
                borderTop: "1px solid #eee",
                borderBottom: "1px solid #eee",
                background: isSelected ? "#b2ebf2" : "#fff",
                boxSizing: "border-box",
                position: "relative",
                padding: 0,
                margin: 0,
                cursor: "pointer",
                overflow: "visible",
              }}
              data-idx={idx}
              data-useridx={userIdx}
              onClick={handleCellClick}
              onMouseDown={handleCellMouseDown}
              onTouchStart={handleCellTouchStart}
              onMouseEnter={handleCellMouseEnter}
              onDoubleClick={e => {
                if (!evt) handleCellDoubleClick(user.id, idx);
              }}
            >
              {isToday && idx === nowCellIdx && (
                <div style={{
                  position: "absolute",
                  left: 0, top: 0, bottom: 0,
                  width: 2,
                  background: "#e53935",
                  zIndex: 12,
                  borderRadius: 2
                }} />
              )}
            </td>
          );
        })}
        {/* --- イベントバー群 --- */}
        {events
          .filter(e => String(e.userId) === String(user.id))
          .map(evt => (
            <div
              key={evt.id}
              style={{
                position: "absolute",
                left: cellSize.userColWidth + evt.startIdx * cellSize.cellWidth,
                top: 3,
                height: cellSize.rowHeight - 6,
                width: (evt.endIdx - evt.startIdx + 1) * cellSize.cellWidth,
                background: evt.color,
                color: "#fff",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                borderRadius: 7,
                border: selectedEventId === evt.id
                  ? "3px solid #00A0FF"
                  : isEventOverlapping(evt, events)
                    ? "2px solid #e53935"
                    : "1px solid #888",
                zIndex: 10,
                cursor: dragMode ? "grabbing" : "pointer",
                opacity: dragMode && moveInfoRef.current && moveInfoRef.current.event.id === evt.id ? 0.65 : 1,
                overflow: "visible",
                boxShadow: selectedEventId === evt.id
                  ? "0 0 0 2.5px #00A0FF, 0 2px 12px 2px #00A0FF66"
                  : "0 2px 5px #3331",
              }}
              onMouseDown={e => handleBarMouseDown(evt, "move", e, user.id, userIdx)}
              onDoubleClick={e => handleBarDoubleClick(evt, e)}
              onContextMenu={e => handleBarContextMenu(evt, e)}
            >
              {/* 左ハンドル */}
              <div
                style={{
                  width: 9, height: "100%",
                  borderRadius: "7px 0 0 7px",
                  background: "rgba(255,255,255,0.13)",
                  cursor: "ew-resize"
                }}
                onMouseDown={e => handleBarMouseDown(evt, "left", e, user.id, userIdx)}
                onDoubleClick={e => handleBarDoubleClick(evt, e)}
                onContextMenu={e => handleBarContextMenu(evt, e)}
              />
              {/* タイトル */}
              <Tooltip
                title={<div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{evt.title}</div>
                  <div>時間: {formatTime(evt.startIdx)}～{formatTime(evt.endIdx + 1)}</div>
                </div>}
                arrow placement="top" enterDelay={100} disableInteractive
              >
                <span style={{
                  fontSize: 13,
                  paddingLeft: 7,
                  paddingRight: 7,
                  textShadow: "0 1px 2px #3335",
                  flex: 1,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  position: "relative"
                }}
                  onDoubleClick={e => handleBarDoubleClick(evt, e)}
                  onContextMenu={e => handleBarContextMenu(evt, e)}
                >
                  {evt.title}
                  {isEventOverlapping(evt, events) && (
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
              </Tooltip>
              {/* 右ハンドル */}
              <div
                style={{
                  width: 9,
                  height: "100%",
                  borderRadius: "0 7px 7px 0",
                  background: "rgba(255,255,255,0.13)",
                  cursor: "ew-resize"
                }}
                onMouseDown={e => handleBarMouseDown(evt, "right", e, user.id, userIdx)}
                onDoubleClick={e => handleBarDoubleClick(evt, e)}
                onContextMenu={e => handleBarContextMenu(evt, e)}
              />
            </div>
          ))}
        {/* === ゴーストバー（移動・リサイズ中のみ） === */}
        {ghostBar && ghostBar.userIdx === userIdx && (
          <div
            className="event-bar ghost-bar"
            style={{
              position: "absolute",
              left: cellSize.userColWidth + ghostBar.startIdx * cellSize.cellWidth,
              top: 3,
              height: cellSize.rowHeight - 6,
              width: (ghostBar.endIdx - ghostBar.startIdx + 1) * cellSize.cellWidth,
              background: ghostBar.color,
              opacity: 0.45,
              border: "2.5px dashed #1976d2",
              zIndex: 22,
              pointerEvents: "none",
              borderRadius: 7,
              display: "flex",
              alignItems: "center",
              fontWeight: 600,
              color: "#fff",
              textShadow: "0 1px 2px #3335",
              fontStyle: "italic"
            }}
          >
            <span style={{
              fontSize: 13,
              flex: 1,
              textAlign: "center",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}>{ghostBar.title}</span>
          </div>
        )}
      </tr>
    ))}
</tbody>



          </table>
        </div>
      </div>

      {/* --- 以降、ダイアログ類（変更なし） --- */}
      {entryStep === "select" && (
        <div className="event-dialog-backdrop" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
          <div className="event-dialog" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "stretch", minWidth: 200 }}>
              <button className="calendar-btn calendar-btn-main" onClick={() => handleEntryNext("new")}>新規入力</button>
              <button className="calendar-btn calendar-btn-main" onClick={() => handleEntryNext("template")}>テンプレート</button>
              <button className="calendar-btn calendar-btn-main" onClick={() => handleEntryNext("paste")}>貼り付け</button>
            </div>
            <div style={{ marginTop: 20, textAlign: "right" }}>
              <button className="calendar-btn calendar-btn-outline" onClick={handleEntryCancel}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {entryStep === "new" && (
        <div className="event-dialog-backdrop" onMouseDown={e => e.stopPropagation()}>
          <div className="event-dialog" style={{
            minWidth: 380, maxWidth: 470, padding: "30px 32px", borderRadius: 18
          }}>
            <div style={{ fontWeight: 700, fontSize: 19, marginBottom: 22 }}>新規予定</div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontWeight: 600 }}>用件</label>
              <input
                autoFocus
                value={entryData.title || ""}
                onChange={e => setEntryData(data => ({ ...data, title: e.target.value }))}
                placeholder="例：クライアントとの打ち合わせ"
                style={{
                  width: "100%",
                  fontSize: 16,
                  marginTop: 3,
                  border: "1.5px solid #cfd8dc",
                  borderRadius: 7,
                  padding: "8px 10px"
                }}
                onKeyDown={e => { if (e.key === "Escape") handleEntryCancel(); }}
              />
            </div>

            <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontWeight: 600 }}>日付</label>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ja}>
                  <DatePicker
                    value={entryData.date || currentDate}
                    format="yyyy/MM/dd"
                    onChange={newDate => setEntryData(data => ({ ...data, date: newDate }))}
                    slotProps={{
                      textField: { size: "small", style: { fontSize: 15, width: "100%", marginTop: 3 } }
                    }}
                  />
                </LocalizationProvider>
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ fontWeight: 600 }}>時間</label>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                  <select
                    value={entryData.startTime || "09:00"}
                    onChange={e => setEntryData(data => ({ ...data, startTime: e.target.value }))}
                    style={{ fontSize: 15, padding: "4px 6px", borderRadius: 5 }}
                  >
                    {Array.from({ length: 96 }).map((_, i) =>
                      <option key={i} value={formatTime(i)}>{formatTime(i)}</option>
                    )}
                  </select>
                  <span>～</span>
                  <select
                    value={entryData.endTime || "10:00"}
                    onChange={e => setEntryData(data => ({ ...data, endTime: e.target.value }))}
                    style={{ fontSize: 15, padding: "4px 6px", borderRadius: 5 }}
                  >
                    {Array.from({ length: 96 }).map((_, i) =>
                      <option key={i} value={formatTime(i)}>{formatTime(i)}</option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontWeight: 600 }}>バー色</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {COLORS_36.map(c => (
                  <div
                    key={c}
                    style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: c,
                      border: entryData.color === c ? "3px solid #1976d2" : "2px solid #bbb",
                      cursor: "pointer",
                      boxSizing: "border-box"
                    }}
                    onClick={() => setEntryData(data => ({ ...data, color: c }))}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 18, justifyContent: "flex-end", marginTop: 10 }}>
              <button
                className="calendar-btn calendar-btn-outline"
                onClick={handleEntryCancel}
                style={{ minWidth: 95, fontSize: 16 }}
              >キャンセル</button>
              <button
                className="calendar-btn calendar-btn-main"
                onClick={handleEntrySave}
                style={{ minWidth: 95, fontSize: 16 }}
              >保存</button>
            </div>
          </div>
        </div>
      )}

      {entryStep === "template" && (
        <div className="event-dialog-backdrop" onMouseDown={e => e.stopPropagation()}>
          <div className="event-dialog">
            <div>テンプレートから選択：</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0 18px 0" }}>
              {templates.map(tpl =>
                <button key={tpl.id}
                  className="calendar-btn"
                  style={{ background: tpl.color, color: "#fff", fontWeight: 600 }}
                  onClick={async () => {
                    if (!entryData?.userId || entryData.startIdx == null || entryData.endIdx == null) {
                      alert("セルを選択してからテンプレートを選択してください");
                      return;
                    }
                    await addDoc(collection(db, "events"), {
                      userId: String(entryData.userId),
                      title: tpl.title,
                      color: tpl.color,
                      startIdx: entryData.startIdx,
                      endIdx: entryData.endIdx,
                      date: formatDateJST(currentDate),
                      month: formatMonthJST(currentDate),
                      day: currentDate.getDate()
                    });
                    setEntryStep(null);
                    setEntryData(null);
                    setSelectedCells([]);
                    setSelectedEventId(null);
                    setEditEvent(null);
                  }}
                >{tpl.title}</button>
              )}
              {templates.length === 0 && <div style={{ color: "#999" }}>テンプレートなし</div>}
            </div>
            <div style={{ marginTop: 8, textAlign: "right" }}>
              <button className="calendar-btn calendar-btn-outline" onClick={handleEntryCancel}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {entryStep === "paste" && (
        <div className="event-dialog-backdrop" onMouseDown={e => e.stopPropagation()}>
          <div className="event-dialog">
            <div>貼り付け内容：</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0 18px 0" }}>
              {clipboard ?
                <button
                  className="calendar-btn"
                  style={{ background: clipboard.color, color: "#fff", fontWeight: 600 }}
                  onClick={async () => {
                    if (!entryData?.userId || entryData.startIdx == null || entryData.endIdx == null) {
                      alert("セルを選択してから貼り付けを選んでください");
                      return;
                    }
                    await addDoc(collection(db, "events"), {
                      userId: String(entryData.userId),
                      title: clipboard.title,
                      color: clipboard.color,
                      startIdx: entryData.startIdx,
                      endIdx: entryData.endIdx,
                      date: formatDateJST(currentDate),
                      month: formatMonthJST(currentDate),
                      day: currentDate.getDate()
                    });
                    setEntryStep(null);
                    setEntryData(null);
                    setSelectedCells([]);
                    setSelectedEventId(null);
                    setEditEvent(null);
                  }}
                >{clipboard.title}</button>
                : <div style={{ color: "#999" }}>コピーされた用件がありません</div>
              }
            </div>
            <div style={{ marginTop: 8, textAlign: "right" }}>
              <button className="calendar-btn calendar-btn-outline" onClick={handleEntryCancel}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {editEvent && !editEvent.op && (
        <div className="event-dialog-backdrop" onMouseDown={e => e.stopPropagation()}>
          <div className="event-dialog" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 200 }}>
              <button className="calendar-btn calendar-btn-main" onClick={() => setEditEvent({ ...editEvent, op: "edit" })}>変更</button>
              <button className="calendar-btn calendar-btn-main"
                onClick={() => {
                  setClipboard({
                    title: editEvent.event.title,
                    color: editEvent.event.color,
                    duration: Math.abs(editEvent.event.endIdx - editEvent.event.startIdx)
                  });
                  setEditEvent(null);
                  setSelectedEventId(null);
                }}
              >コピー</button>
              <button className="calendar-btn calendar-btn-main" onClick={() => setEditEvent({ ...editEvent, op: "delete" })}>削除</button>
            </div>
            <div style={{ marginTop: 20, textAlign: "right" }}>
              <button className="calendar-btn calendar-btn-outline" onClick={() => setEditEvent(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {editEvent && editEvent.op === "edit" && (
        <div className="event-dialog-backdrop" onMouseDown={e => e.stopPropagation()}>
          <div className="event-dialog">
            <div>
              <label>用件：</label>
              <input
                autoFocus
                value={editEvent.event.title}
                onChange={e => setEditEvent(ee => ({ ...ee, event: { ...ee.event, title: e.target.value } }))}
                style={{ width: "180px", fontSize: 16, marginLeft: 4 }}
                onKeyDown={e => {
                  if (e.key === "Enter" && editEvent.event.title?.trim()) handleEditEventSave(editEvent.event);
                  if (e.key === "Escape") setEditEvent(null);
                }}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <label>バー色：</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                {COLORS_36.map(c => (
                  <div
                    key={c}
                    style={{
                      width: 22, height: 22, borderRadius: 4,
                      background: c,
                      border: editEvent.event.color === c ? "2.5px solid #1976d2" : "1.5px solid #bbb",
                      cursor: "pointer", margin: 1,
                    }}
                    onClick={() => setEditEvent(ee => ({ ...ee, event: { ...ee.event, color: c } }))}
                  />
                ))}
              </div>
            </div>
            <div style={{ marginTop: 18, textAlign: "right" }}>
              <button className="calendar-btn calendar-btn-main" onClick={() => handleEditEventSave(editEvent.event)} style={{ marginRight: 8 }}>保存</button>
              <button className="calendar-btn calendar-btn-outline" onClick={() => setEditEvent(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {editEvent && editEvent.op === "delete" && (
        <div className="event-dialog-backdrop" onMouseDown={e => e.stopPropagation()}>
          <div className="event-dialog">
            <div>本当に削除しますか？</div>
            <div style={{ marginTop: 18, textAlign: "right" }}>
              <button className="calendar-btn calendar-btn-main" onClick={() => handleEditEventDelete(editEvent.event)} style={{ marginRight: 8, background: "#e53935" }}>削除</button>
              <button className="calendar-btn calendar-btn-outline" onClick={() => setEditEvent(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {showTemplateManager && (
        <div className="event-dialog-backdrop" onMouseDown={e => e.stopPropagation()}>
          <div className="event-dialog">
            <div style={{ fontWeight: 600, marginBottom: 12 }}>テンプレート管理</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {templates.map(tpl =>
                <div key={tpl.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ background: tpl.color, borderRadius: 4, width: 22, height: 22, marginRight: 6 }}></div>
                  <div style={{ fontSize: 16, fontWeight: 600, minWidth: 80 }}>{tpl.title}</div>
                  <button className="calendar-btn calendar-btn-outline" onClick={() => handleDeleteTemplate(tpl.id)}>削除</button>
                </div>
              )}
            </div>
            <div style={{ margin: "18px 0 10px 0", borderTop: "1px solid #ddd" }}></div>
            <div style={{ display: "flex", gap: 6 }}>
              <input id="tpl-add-title" placeholder="タイトル" style={{ width: 120 }} />
              <select id="tpl-add-color">
                {COLORS_36.map(c =>
                  <option key={c} value={c} style={{ background: c, color: "#fff" }}>{c}</option>
                )}
              </select>
              <button className="calendar-btn calendar-btn-main"
                onClick={() => {
                  const title = document.getElementById("tpl-add-title").value;
                  const color = document.getElementById("tpl-add-color").value;
                  handleAddTemplate(title, color);
                  document.getElementById("tpl-add-title").value = "";
                }}
              >追加</button>
            </div>
            <div style={{ marginTop: 18, textAlign: "right" }}>
              <button className="calendar-btn calendar-btn-outline" onClick={() => setShowTemplateManager(false)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}