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
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatMonthJST(date) {
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
const cellWidth = 25;
const USER_COL_WIDTH = 120;
const ROW_HEIGHT = 38;
function getCellKey(userId, idx) { return `${userId}-${idx}`; }
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
    String(e.userId) === String(evt.userId) &&
    (Number(e.startIdx) <= Number(evt.endIdx) && Number(e.endIdx) >= Number(evt.startIdx))
  );
}

export default function CalendarDay({
  groups, users, currentGroup, onChangeGroup,
  currentDate, setCurrentDate, handlePrevDate, handleNextDate, handleNowDate
}) {
  const [events, setEvents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [copyCounts, setCopyCounts] = useState(loadCopyCounts());
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [entryStep, setEntryStep] = useState(null);
  const [entryData, setEntryData] = useState(null);
  const [editEvent, setEditEvent] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [selectedCells, setSelectedCells] = useState([]);
  const dragModeRef = useRef();
  const selectInfoRef = useRef();
  const [dragMode, setDragMode] = useState(null);
  const [selectInfo, setSelectInfo] = useState(null);
  const [moveInfo, setMoveInfo] = useState(null);
  const [clipboard, setClipboard] = useState(null); // ←追加

  useEffect(() => { dragModeRef.current = dragMode; }, [dragMode]);
  useEffect(() => { selectInfoRef.current = selectInfo; }, [selectInfo]);
  const orderedUsers = useMemo(() =>
    users && currentGroup
      ? users.filter(u => u && u.groupId === currentGroup.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : []
  , [users, currentGroup]);

  const tableScrollRef = useRef(null);
  const clickTimeout = useRef(null);
  useEffect(() => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollLeft = USER_COL_WIDTH + cellWidth * 36;
    }
  }, [currentDate, currentGroup]);

  // Firestore取得
  useEffect(() => {
    if (!orderedUsers.length) {
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
  useEffect(() => { saveCopyCounts(copyCounts); }, [copyCounts]);

  const hd = useMemo(() => new Holidays('JP'), []);
  function formatDateDisplay(date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const w = ['日','月','火','水','木','金','土'][date.getDay()];
    return `${y}/${m}/${d}（${w}）`;
  }
  const holidayObj = hd.isHoliday(formatDateJST(currentDate));
  const holidayName = holidayObj
    ? Array.isArray(holidayObj)
      ? holidayObj[0].name
      : holidayObj.name
    : "";
  const weekDay = currentDate.getDay();
  let dateColor = "#222";
  if (holidayName) dateColor = "#e53935";
  else if (weekDay === 0) dateColor = "#e53935";
  else if (weekDay === 6) dateColor = "#1976d2";
  const today = new Date();
  const isToday =
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
    moveInfo &&
    (dragMode === "move" || dragMode === "resize-left" || dragMode === "resize-right")
  ) {
    ghostBar = {
      userIdx: moveInfo.userIdx,
      startIdx: moveInfo.startIdx,
      endIdx: moveInfo.endIdx,
      color: moveInfo.event.color,
      title: moveInfo.event.title,
    };
  }
  const [nowCellIdx, setNowCellIdx] = useState(getNowCellIndex());
  useEffect(() => {
    const timer = setInterval(() => setNowCellIdx(getNowCellIndex()), 10000);
    return () => clearInterval(timer);
  }, []);

  // --- キーボードショートカット対応：DEL, Ctrl+C, Ctrl+V
  useEffect(() => {
    function handleKeyDown(e) {
      // ダイアログ開いてる時は何もしない
      if (editEvent || entryStep || showTemplateManager) return;

      // DEL/Backspace: イベントバー選択中のみ削除
      if ((e.key === "Delete" || e.key === "Backspace") && selectedEventId) {
        e.preventDefault();
        const evt = events.find(ev => ev.id === selectedEventId);
        if (evt && window.confirm("本当に削除しますか？")) {
          handleEditEventDelete(evt);
        }
      }
      // Ctrl+C: イベントバー選択中のみコピー
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selectedEventId) {
        e.preventDefault();
        const evt = events.find(ev => ev.id === selectedEventId);
        if (evt) {
          setClipboard({ title: evt.title, color: evt.color });
          handleEditEventCopy(evt);
        }
      }
      // Ctrl+V: セル選択中のみ貼り付け
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && clipboard) {
        e.preventDefault();
        // 現在選択セルが1つだけならそこに貼り付け
        if (selectedCells.length === 1) {
          const { userId, idx } = selectedCells[0];
          setEntryStep("color");
          setEntryData({ userId, idx, startIdx: idx, endIdx: idx, title: clipboard.title, color: clipboard.color });
        } else {
          alert("貼り付け先のセルを1つ選択してください");
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEventId, selectedCells, clipboard, editEvent, entryStep, showTemplateManager, events]);

  // --- セルクリックやドラッグ選択等 ---
  function handleCellClick(e) {
    if (dragMode) return;
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
    if (e.button !== 0) return;
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
  function handleCellMouseEnter(e) {
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
  }, [orderedUsers]);

  const handleCellDoubleClick = (userId, idx) => {
    if (dragMode) return;
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
    setMoveInfo(null);
  }

  useEffect(() => {
    function handleClickAway(e) {
      if (!e.target.closest('.event-dialog')) {
        setEditEvent(null);
        setSelectedEventId(null);
      }
    }
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, []);

  function handleBarMouseDown(evt, mode, e, userId, userIdx) {
    e.stopPropagation();
    if (e.button !== 0) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let dragged = false;

    function onMouseMove(eMove) {
      const diffX = Math.abs(eMove.clientX - startX);
      const diffY = Math.abs(eMove.clientY - startY);

      if (!dragged && (diffX > 3 || diffY > 3)) {
        dragged = true;
        clearTimeout(clickTimeout.current);
        setDragMode(
          mode === "left" ? "resize-left" :
          mode === "right" ? "resize-right" : "move"
        );
        setMoveInfo({
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
        });
        setSelectedEventId(evt.id);
        setSelectedCells([]);
        setEntryStep(null);
        setEntryData(null);
        setEditEvent(null);
        document.body.style.userSelect = "none";
      }
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    clickTimeout.current = setTimeout(() => {
      if (!dragged) {
        setSelectedEventId(evt.id);
        setSelectedCells([]);
        setEditEvent(null);
        setEntryStep(null);
        setEntryData(null);
      }
    }, 200); // シングルクリック判定時間
  }

  // ★イベントバーをダブルクリックした時の処理
  function handleBarDoubleClick(evt, e) {
    e.stopPropagation();
    clearTimeout(clickTimeout.current); // ドラッグキャンセル
    openEditTab(evt);                   // 編集タブを開く
  }

  // ★イベントバーを右クリックした時の処理（念のため）
  function handleBarContextMenu(evt, e) {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(clickTimeout.current); // ドラッグキャンセル
    openEditTab(evt);                   // 編集タブを開く
  }

  useEffect(() => {
    if (!dragMode || !moveInfo) return;
    function onMouseMove(e) {
      const diffX = e.clientX - moveInfo.startX;
      const diffCells = Math.round(diffX / cellWidth);
      const diffY = e.clientY - moveInfo.startY;
      const diffUserIdx = Math.round(diffY / ROW_HEIGHT);

      if (dragMode === "move") {
        let newStart = moveInfo.originalStart + diffCells;
        let newEnd = moveInfo.originalEnd + diffCells;
        if (newStart < 0) {
          newEnd += -newStart;
          newStart = 0;
        }
        if (newEnd > 95) {
          newStart -= (newEnd - 95);
          newEnd = 95;
        }
        let newUserIdx = moveInfo.userIdx + diffUserIdx;
        if (newUserIdx < 0) newUserIdx = 0;
        if (newUserIdx >= orderedUsers.length) newUserIdx = orderedUsers.length - 1;

        setMoveInfo(mi => ({
          ...mi,
          startIdx: Math.max(0, newStart),
          endIdx: Math.min(95, newEnd),
          userIdx: newUserIdx
        }));
      } else if (dragMode === "resize-left") {
        let newStart = Math.min(moveInfo.originalEnd, Math.max(0, moveInfo.originalStart + diffCells));
        if (newStart > moveInfo.originalEnd) newStart = moveInfo.originalEnd;
        setMoveInfo(mi => ({
          ...mi,
          startIdx: newStart
        }));
      } else if (dragMode === "resize-right") {
        let newEnd = Math.max(moveInfo.originalStart, Math.min(95, moveInfo.originalEnd + diffCells));
        if (newEnd < moveInfo.originalStart) newEnd = moveInfo.originalStart;
        setMoveInfo(mi => ({
          ...mi,
          endIdx: newEnd
        }));
      }
    }
    function onMouseUp(e) {
      document.body.style.userSelect = "";
      if (dragMode && moveInfo) {
        let newUserIdx = moveInfo.userIdx;
        let newStartIdx = moveInfo.startIdx;
        let newEndIdx = moveInfo.endIdx;
        const newUser = orderedUsers[newUserIdx];

        if (
          newStartIdx !== moveInfo.event.startIdx ||
          newEndIdx !== moveInfo.event.endIdx ||
          (newUser && String(newUser.id) !== String(moveInfo.event.userId))
        ) {
          updateDoc(doc(db, "events", moveInfo.event.id), {
            ...moveInfo.event,
            startIdx: newStartIdx,
            endIdx: newEndIdx,
            userId: String(newUser.id),
            date: formatDateJST(currentDate),
            month: formatMonthJST(currentDate)
          });
        }
      }
      setDragMode(null);
      setMoveInfo(null);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragMode, moveInfo, db, currentDate, orderedUsers]);

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
    let { userId, idx, startIdx, endIdx, title, color } = entryData;
    if (!title?.trim() || !color) return;
    let s = typeof startIdx === "number" ? startIdx : idx;
    let e = typeof endIdx === "number" ? endIdx : idx;
    s = Math.max(0, Math.min(95, s));
    e = Math.max(0, Math.min(95, e));
    if (e < s) [s, e] = [e, s];
    if (isEventOverlapping({ id: undefined, userId, startIdx: s, endIdx: e }, events)) {
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
        startIdx: s,
        endIdx: e,
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
  function handleEditEventCopy(evt) {
    setClipboard({ title: evt.title, color: evt.color }); // ←追加
    const key = `${evt.title}__${evt.color}`;
    setCopyCounts(prev => {
      const next = { ...prev, [key]: (prev[key] || 0) + 1 };
      saveCopyCounts(next);
      return next;
    });
    setEditEvent(null);
    setSelectedEventId(null);
  }
  function handlePasteSelect(key) {
    const [title, color] = key.split("__");
    setClipboard({ title, color }); // ←追加
    setEntryStep("color");
    setEntryData(prev => ({ ...prev, title, color }));
    setSelectedEventId(null);
  }
  async function handleAddTemplate(title, color) {
    if (!title.trim()) return;
    await addDoc(collection(db, "templates"), { title: title.trim(), color });
  }
  async function handleDeleteTemplate(id) {
    await deleteDoc(doc(db, "templates", id));
  }
  const pasteCandidates = Object.entries(copyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (!currentGroup || !users || users.length === 0 || orderedUsers.length === 0) {
    return (
      <div style={{ padding: 40 }}>
        表示できるグループまたはユーザーがいません（右上の追加ボタンからどうぞ）
      </div>
    );
  }

  // ===================== レンダリング =====================
  return (
    <div className="calendar-root">
      {/* --- 上部ナビ --- */}
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
        {/* ====== MUIカレンダー（祝日色付き・日本語） ====== */}
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
        <button className="calendar-btn calendar-btn-outline"
          style={{ marginLeft: "auto", fontSize: 15 }}
          onClick={() => setShowTemplateManager(true)}>
          テンプレート管理
        </button>
      </div>
      {/* === テーブル === */}
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
            minWidth: USER_COL_WIDTH + cellWidth * 96,
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
                  minWidth: USER_COL_WIDTH,
                  maxWidth: USER_COL_WIDTH,
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
                ユーザー＼時間
              </th>
              {Array.from({ length: 24 }).map((_, h) => (
                <th
                  key={h}
                  colSpan={4}
                  className="calendar-th-hour"
                  style={{
                    minWidth: cellWidth * 4,
                    maxWidth: cellWidth * 4,
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
                >{`${h}:00`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orderedUsers
              .filter(Boolean)
              .map((user, userIdx) => (
                <tr key={user.id} style={{ height: ROW_HEIGHT }}>
                  {/* ユーザー名セル */}
                  <td
                    style={{
                      minWidth: USER_COL_WIDTH,
                      maxWidth: USER_COL_WIDTH,
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
                  {Array.from({ length: 96 }).map((_, idx) => {
                    const isHourBorder = (idx + 1) % 4 === 0;
                    const isSelected = selectedCellSet.has(getCellKey(String(user.id), idx));
                    const evt = events.find(e => String(e.userId) === String(user.id) && Number(e.startIdx) === idx);
                    let showGhost = false;
                    if (
                      ghostBar &&
                      ghostBar.userIdx === userIdx &&
                      ghostBar.startIdx === idx
                    ) {
                      showGhost = true;
                    }
                    return (
                      <td
                        key={idx}
                        className={`calendar-td${isSelected ? " selected-td" : ""}`}
                        style={{
                          width: cellWidth,
                          minWidth: cellWidth,
                          maxWidth: cellWidth,
                          height: ROW_HEIGHT,
                          borderRight: isHourBorder
                            ? "1px dashed #42a5f5"
                            : "1px solid #eee",
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
                        onMouseEnter={handleCellMouseEnter}
                        onDoubleClick={e => {
                          if (!evt) {
                            handleCellDoubleClick(user.id, idx);
                          }
                        }}
                      >
                        {/* 現在時刻の赤線 */}
                        {isToday && idx === nowCellIdx && (
                          <div style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: 2,
                            background: "#e53935",
                            zIndex: 12,
                            borderRadius: 2
                          }} />
                        )}
                        {/* イベントバー */}
                      {evt && !showGhost && (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 3,
      height: ROW_HEIGHT - 6,
      width: (evt.endIdx - evt.startIdx + 1) * cellWidth,
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
      opacity: dragMode && moveInfo && moveInfo.event.id === evt.id ? 0.65 : 1,
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
        width: 9,
        height: "100%",
        borderRadius: "7px 0 0 7px",
        background: "rgba(255,255,255,0.13)",
        cursor: "ew-resize"
      }}
      onMouseDown={e => handleBarMouseDown(evt, "left", e, user.id, userIdx)}
      onDoubleClick={e => handleBarDoubleClick(evt, e)}
      onContextMenu={e => handleBarContextMenu(evt, e)}
    />

    {/* 中央タイトル部 */}
    <Tooltip
      title={
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{evt.title}</div>
          <div>
            時間: {formatTime(evt.startIdx)}～{formatTime(evt.endIdx + 1)}
          </div>
        </div>
      }
      arrow
      placement="top"
      enterDelay={100}
      disableInteractive
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
)}

                        {/* ゴーストバー */}
                        {showGhost && (
                          <div
                            style={{
                              position: "absolute",
                              left: 0,
                              top: 3,
                              height: ROW_HEIGHT - 6,
                              width: (ghostBar.endIdx - ghostBar.startIdx + 1) * cellWidth,
                              background: ghostBar.color,
                              opacity: 0.5,
                              border: "2.5px dashed #1976d2",
                              zIndex: 20,
                              pointerEvents: "none",
                              borderRadius: 7,
                              display: "flex",
                              alignItems: "center",
                              fontWeight: 600,
                              color: "#fff",
                              textShadow: "0 1px 2px #3335",
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
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* --- 以降、ダイアログ --- */}
      {/* 新規追加選択 */}
      {entryStep === "select" && (
        <div className="event-dialog-backdrop" onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
          <div className="event-dialog" onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex", flexDirection:"column", gap:16, alignItems:"stretch", minWidth:200}}>
              <button className="calendar-btn calendar-btn-main" onClick={()=>handleEntryNext("new")}>新規入力</button>
              <button className="calendar-btn calendar-btn-main" onClick={()=>handleEntryNext("template")}>テンプレート</button>
              <button className="calendar-btn calendar-btn-main" onClick={()=>handleEntryNext("paste")}>貼り付け</button>
            </div>
            <div style={{marginTop:20, textAlign:"right"}}>
              <button className="calendar-btn calendar-btn-outline" onClick={handleEntryCancel}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {/* 新規入力 */}
      {entryStep === "new" && (
        <div className="event-dialog-backdrop" onMouseDown={e=>e.stopPropagation()}>
          <div className="event-dialog">
            <div>
              <label>用件：</label>
              <input
                autoFocus
                value={entryData.title || ""}
                onChange={e=>setEntryData(data=>({...data, title:e.target.value}))}
                style={{width:"180px", fontSize:16, marginLeft:4}}
                onKeyDown={e=>{
                  if (e.key === "Enter" && entryData.title?.trim()) handleEntryNext("color", {title:entryData.title.trim()});
                  if (e.key === "Escape") handleEntryCancel();
                }}
              />
            </div>
            <div style={{marginTop:18, textAlign:"right"}}>
              <button className="calendar-btn calendar-btn-main" onClick={()=>entryData.title?.trim() && handleEntryNext("color", {title:entryData.title.trim()})} style={{marginRight:8}}>次へ</button>
              <button className="calendar-btn calendar-btn-outline" onClick={handleEntryCancel}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {/* 色選択 */}
      {entryStep === "color" && (
        <div className="event-dialog-backdrop" onMouseDown={e=>e.stopPropagation()}>
          <div className="event-dialog">
            <div>
              <label>バー色：</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:8}}>
                {COLORS_36.map(c=>(
                  <div
                    key={c}
                    style={{
                      width:22, height:22, borderRadius:4,
                      background:c,
                      border:entryData.color===c?"2.5px solid #1976d2":"1.5px solid #bbb",
                      cursor:"pointer", margin:1,
                    }}
                    onClick={()=>setEntryData(data=>({...data, color:c}))}
                  />
                ))}
              </div>
            </div>
            <div style={{marginTop:18, textAlign:"right"}}>
              <button className="calendar-btn calendar-btn-main" onClick={handleEntrySave} style={{marginRight:8}} disabled={!entryData.title||!entryData.color}>保存</button>
              <button className="calendar-btn calendar-btn-outline" onClick={handleEntryCancel}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {/* テンプレートから選択 */}
      {entryStep === "template" && (
        <div className="event-dialog-backdrop" onMouseDown={e=>e.stopPropagation()}>
          <div className="event-dialog">
            <div>テンプレートから選択：</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,margin:"10px 0 18px 0"}}>
              {templates.map(tpl=>
                <button key={tpl.id}
                  className="calendar-btn"
                  style={{background:tpl.color,color:"#fff",fontWeight:600}}
                  onClick={()=>handleEntryNext("color",{title:tpl.title,color:tpl.color})}
                >{tpl.title}</button>
              )}
              {templates.length===0 && <div style={{color:"#999"}}>テンプレートなし</div>}
            </div>
            <div style={{marginTop:8,textAlign:"right"}}>
              <button className="calendar-btn calendar-btn-outline" onClick={handleEntryCancel}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {/* 貼り付け：コピー履歴 */}
      {entryStep === "paste" && (
        <div className="event-dialog-backdrop" onMouseDown={e=>e.stopPropagation()}>
          <div className="event-dialog">
            <div>貼り付け候補：</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,margin:"10px 0 18px 0"}}>
              {pasteCandidates.map(([key,count])=>{
                const [title,color] = key.split("__");
                return (
                  <button key={key}
                    className="calendar-btn"
                    style={{background:color,color:"#fff",fontWeight:600}}
                    onClick={()=>handlePasteSelect(key)}
                  >{title}（{count}回）</button>
                );
              })}
              {pasteCandidates.length===0 && <div style={{color:"#999"}}>コピー履歴なし</div>}
            </div>
            <div style={{marginTop:8,textAlign:"right"}}>
              <button className="calendar-btn calendar-btn-outline" onClick={handleEntryCancel}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {/* 編集・削除・コピー */}
      {editEvent && !editEvent.op && (
        <div className="event-dialog-backdrop" onMouseDown={e=>e.stopPropagation()}>
          <div className="event-dialog"onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}>
            <div style={{display:"flex",flexDirection:"column",gap:16,minWidth:200}}>
              <button className="calendar-btn calendar-btn-main" onClick={()=>setEditEvent({...editEvent, op:"edit"})}>変更</button>
              <button className="calendar-btn calendar-btn-main" onClick={()=>setEditEvent({...editEvent, op:"copy"})}>コピー</button>
              <button className="calendar-btn calendar-btn-main" onClick={()=>setEditEvent({...editEvent, op:"delete"})}>削除</button>
            </div>
            <div style={{marginTop:20, textAlign:"right"}}>
              <button className="calendar-btn calendar-btn-outline" onClick={()=>setEditEvent(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {/* 編集 */}
      {editEvent && editEvent.op==="edit" && (
        <div className="event-dialog-backdrop" onMouseDown={e=>e.stopPropagation()}>
          <div className="event-dialog">
            <div>
              <label>用件：</label>
              <input
                autoFocus
                value={editEvent.event.title}
                onChange={e=>setEditEvent(ee=>({...ee, event:{...ee.event, title:e.target.value}}))}
                style={{width:"180px", fontSize:16, marginLeft:4}}
                onKeyDown={e=>{
                  if (e.key === "Enter" && editEvent.event.title?.trim()) handleEditEventSave(editEvent.event);
                  if (e.key === "Escape") setEditEvent(null);
                }}
              />
            </div>
            <div style={{marginTop:10}}>
              <label>バー色：</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                {COLORS_36.map(c=>(
                  <div
                    key={c}
                    style={{
                      width:22, height:22, borderRadius:4,
                      background:c,
                      border:editEvent.event.color===c?"2.5px solid #1976d2":"1.5px solid #bbb",
                      cursor:"pointer", margin:1,
                    }}
                    onClick={()=>setEditEvent(ee=>({...ee, event:{...ee.event, color:c}}))}
                  />
                ))}
              </div>
            </div>
            <div style={{marginTop:18,textAlign:"right"}}>
              <button className="calendar-btn calendar-btn-main" onClick={()=>handleEditEventSave(editEvent.event)} style={{marginRight:8}}>保存</button>
              <button className="calendar-btn calendar-btn-outline" onClick={()=>setEditEvent(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {/* 削除 */}
      {editEvent && editEvent.op==="delete" && (
        <div className="event-dialog-backdrop" onMouseDown={e=>e.stopPropagation()}>
          <div className="event-dialog">
            <div>本当に削除しますか？</div>
            <div style={{marginTop:18, textAlign:"right"}}>
              <button className="calendar-btn calendar-btn-main" onClick={()=>handleEditEventDelete(editEvent.event)} style={{marginRight:8,background:"#e53935"}}>削除</button>
              <button className="calendar-btn calendar-btn-outline" onClick={()=>setEditEvent(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {/* コピー */}
      {editEvent && editEvent.op==="copy" && (
        <div className="event-dialog-backdrop" onMouseDown={e=>e.stopPropagation()}>
          <div className="event-dialog">
            <div>この用件を「貼り付け候補」にコピーしますか？</div>
            <div style={{marginTop:18, textAlign:"right"}}>
              <button className="calendar-btn calendar-btn-main" onClick={()=>handleEditEventCopy(editEvent.event)} style={{marginRight:8}}>コピー</button>
              <button className="calendar-btn calendar-btn-outline" onClick={()=>setEditEvent(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {/* テンプレ管理画面 */}
      {showTemplateManager && (
        <div className="event-dialog-backdrop" onMouseDown={e=>e.stopPropagation()}>
          <div className="event-dialog">
            <div style={{fontWeight:600,marginBottom:12}}>テンプレート管理</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {templates.map(tpl=>
                <div key={tpl.id} style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{background:tpl.color, borderRadius:4, width:22, height:22, marginRight:6}}></div>
                  <div style={{fontSize:16,fontWeight:600,minWidth:80}}>{tpl.title}</div>
                  <button className="calendar-btn calendar-btn-outline" onClick={()=>handleDeleteTemplate(tpl.id)}>削除</button>
                </div>
              )}
            </div>
            <div style={{margin:"18px 0 10px 0", borderTop:"1px solid #ddd"}}></div>
            <div style={{display:"flex",gap:6}}>
              <input id="tpl-add-title" placeholder="タイトル" style={{width:120}} />
              <select id="tpl-add-color">
                {COLORS_36.map(c=>
                  <option key={c} value={c} style={{background:c,color:"#fff"}}>{c}</option>
                )}
              </select>
              <button className="calendar-btn calendar-btn-main"
                onClick={()=>{const title = document.getElementById("tpl-add-title").value;
                  const color = document.getElementById("tpl-add-color").value;
                  handleAddTemplate(title,color);
                  document.getElementById("tpl-add-title").value = "";
                }}
              >追加</button>
            </div>
            <div style={{marginTop:18,textAlign:"right"}}>
              <button className="calendar-btn calendar-btn-outline" onClick={()=>setShowTemplateManager(false)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
