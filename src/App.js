import React, { useEffect, useRef, useState } from "react";
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import CalendarDay from "./components/CalendarDay";
import CalendarMonth from "./components/CalendarMonth";
import GroupSettings from "./components/GroupSettings"; // ★ UserGroupSettingsからGroupSettingsに変更
import TemplateManager from "./components/TemplateManager";


function AppContent() {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  
  // ★ モーダルの表示状態を修正
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);

  const [templates, setTemplates] = useState([]);
  const calendarScrollRef = useRef(null);

  // 月
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  // 日
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });

  const location = useLocation();

  // --- Firestore同期 ---
  useEffect(() => {
    // groupsを先に読み込み、orderでソートする
    const unsubGroups = onSnapshot(collection(db, "groups"), snap => {
      const groupsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      groupsData.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setGroups(groupsData);
    });

    const unsubUsers = onSnapshot(collection(db, "users"), snap => {
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubUsers();
      unsubGroups();
    };
  }, []);

  useEffect(() => {
    if (showTemplateManager) {
      const unsub = onSnapshot(collection(db, "templates"), snap => {
        setTemplates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return () => unsub();
    }
  }, [showTemplateManager]);

  // currentGroup選択ロジック
  useEffect(() => {
    if (!groups.length) {
      setCurrentGroup(null);
      setCurrentUser(null);
      return;
    }
    // 現在選択中のグループが存在しなくなった場合、または未選択の場合に先頭を選択
    if (!currentGroup || !groups.some(g => g.id === currentGroup.id)) {
      setCurrentGroup(groups[0]);
    }
  }, [groups]);

  // currentUserを選択し直し
  useEffect(() => {
    if (!currentGroup) {
      setCurrentUser(null);
      return;
    }
    const groupUsers = users
      .filter(u => u.groupId === currentGroup.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (!groupUsers.length) {
      setCurrentUser(null);
    } else if (!currentUser || !groupUsers.some(u => u.id === currentUser.id)) {
      setCurrentUser(groupUsers[0]);
    }
  }, [currentGroup, users]);

  // 月送り／日送り
// 月送り／日送り
const handlePrevDate = () => setCurrentDate(d => 
  new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
);
const handleNextDate = () => setCurrentDate(d => 
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
);
const handleNowDate = () => {
  const now = new Date();
  setCurrentDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
};


  // 月送り（ルーティングで切替）
  const handlePrevMonth = () => {
    const dateToChange = location.pathname === "/month" ? currentMonth : currentDate;
    const newDate = new Date(dateToChange.getFullYear(), dateToChange.getMonth() - 1, 1);
    location.pathname === "/month" ? setCurrentMonth(newDate) : setCurrentDate(newDate);
  };
  const handleNextMonth = () => {
    const dateToChange = location.pathname === "/month" ? currentMonth : currentDate;
    const newDate = new Date(dateToChange.getFullYear(), dateToChange.getMonth() + 1, 1);
    location.pathname === "/month" ? setCurrentMonth(newDate) : setCurrentDate(newDate);
  };
  const handleNowMonth = () => {
    const now = new Date();
    const newDate = new Date(now.getFullYear(), now.getMonth(), 1);
    location.pathname === "/month" ? setCurrentMonth(newDate) : setCurrentDate(newDate);
  };

  // 年月ラベル
  const ymLabel = (() => {
    const dateToShow = location.pathname === "/month" ? currentMonth : currentDate;
    return dateToShow && dateToShow instanceof Date && !isNaN(dateToShow)
      ? `${dateToShow.getFullYear()}年${dateToShow.getMonth() + 1}月`
      : "";
  })();

  // 部署ごとのユーザー
  const usersInGroup = users
    .filter(u => currentGroup && u.groupId === currentGroup.id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        background: "#f8fbff"
      }}
    >
      {/* 1段目 sticky（ナビ） */}
      <div className="sticky-header-1"
        style={{
          position: "sticky", top: 0, zIndex: 100, background: "#fff",
          borderBottom: "1px solid #eee"
        }}
      >
        <div className="header-buttons-row">
          <div className="header-left-btns">
            <NavLink to="/" end className={({ isActive }) => "nav-btn" + (isActive ? " active" : "")}>
              日別カレンダー
            </NavLink>
            <NavLink to="/month" className={({ isActive }) => "nav-btn" + (isActive ? " active" : "")}>
              月別カレンダー
            </NavLink>
          </div>
          <div className="header-right-btns">
            {/* ★ モーダルを開くボタンを修正 */}
            <button className="nav-btn" onClick={() => setShowGroupSettings(true)}>登録管理</button>
            <button className="nav-btn" onClick={() => setShowTemplateManager(true)}>テンプレート管理</button>
          </div>
        </div>
      </div>

      {/* 2段目 sticky（部署+月送り+ユーザー） */}
      <div className="sticky-header-2"
        style={{
          position: "sticky",
          top: 54, // ヘッダーの高さに合わせる
          zIndex: 90,
          background: "#fff",
          boxShadow: "0 3px 14px #eaf4ff55",
          padding: "0 0 14px 0",
          minWidth: 960,
          width: "100vw"
        }}
      >
        <div
          className="calendar-toolbar-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            columnGap: 10,
            alignItems: "start",
            padding: "8px 0 0 8px"
          }}
        >
          <div style={{
            fontWeight: 600,
            fontSize: 16,
            paddingTop: 6,
            minWidth: 54
          }}>部署：</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {groups.map(group => (
                <button
                  key={group.id}
                  className={
                    "toolbar-group-btn" +
                    (currentGroup && currentGroup.id === group.id ? " selected" : "")
                  }
                  onClick={() => setCurrentGroup(group)}
                >
                  {group.name}
                </button>
              ))}
            </div>
            <div className="toolbar-month-bar" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button className="toolbar-btn" onClick={handlePrevMonth}>前月</button>
              <button className="toolbar-btn" onClick={handleNowMonth}>今月</button>
              <button className="toolbar-btn" onClick={handleNextMonth}>次月</button>
              <span className="toolbar-ym-label">{ymLabel}</span>
              {location.pathname === "/month" && (
                <select
                  className="toolbar-user-select"
                  value={currentUser?.id || ""}
                  onChange={e => {
                    const sel = usersInGroup.find(u => u.id === e.target.value);
                    setCurrentUser(sel || null);
                  }}
                >
                  {usersInGroup.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ルーティング部 */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, width: "100vw", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Routes>
          <Route
            path="/"
            element={
              currentDate && currentUser && currentGroup ? (
                <CalendarDay
                  users={usersInGroup}
                  currentUser={currentUser}
                  currentGroup={currentGroup}
                  groups={groups}
                  onChangeGroup={setCurrentGroup}
                  onChangeUser={setCurrentUser}
                  scrollRef={calendarScrollRef}
                  currentDate={currentDate}
                  setCurrentDate={setCurrentDate}
                  handlePrevDate={handlePrevDate}
                  handleNextDate={handleNextDate}
                  handleNowDate={handleNowDate}
                />
              ) : (
                <div style={{ padding: 32, textAlign: "center", color: "#888" }}>
                  {groups.length === 0 ? "グループを登録してください" : "表示するユーザーがいません"}
                </div>
              )
            }
          />

          <Route
            path="/month"
            element={
              currentMonth && currentGroup ? (
                <div style={{ flex: 1, minHeight: 0, minWidth: 0, width: "100vw", height: "100%", overflowX: "auto", overflowY: "visible" }}>
                  <CalendarMonth
                    users={usersInGroup}
                    currentUser={currentUser}
                    onChangeUser={setCurrentUser}
                    currentMonth={currentMonth}
                    setCurrentMonth={setCurrentMonth}
                    scrollRef={calendarScrollRef}
                  />
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
                  {groups.length === 0 ? "グループを登録してください" : "ロード中..."}
                </div>
              )
            }
          />
        </Routes>
      </div>

      {/* ★ モーダル呼び出しを修正 */}
      {showGroupSettings && (
        <GroupSettings
          onClose={() => setShowGroupSettings(false)}
        />
      )}
      {showTemplateManager && (
        <TemplateManager
          templates={templates}
          onClose={() => setShowTemplateManager(false)}
          onSelectTemplate={() => { }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}