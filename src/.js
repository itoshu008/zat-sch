import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, NavLink } from "react-router-dom";
import { db } from "./firebase";
import { collection, onSnapshot, addDoc, deleteDoc } from "firebase/firestore";
import CalendarDay from "./components/CalendarDay";
import CalendarMonth from "./components/CalendarMonth";
import UserSettings from "./components/UserSettings";
import GroupSettings from "./components/GroupSettings";
import "./components/CalendarTable.css";

export default function App() {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);

  // ユーザー・グループ購読
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), snap => {
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubGroups = onSnapshot(collection(db, "groups"), snap => {
      setGroups(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => {
      unsubUsers();
      unsubGroups();
    };
  }, []);

  // グループ初期選択/切替でcurrentUserも
  useEffect(() => {
    if (groups.length === 0) {
      setCurrentGroup(null);
      setCurrentUser(null);
      return;
    }
    // 選択グループ無効なら1つ目に
    if (!currentGroup || !groups.some(g => g.id === currentGroup.id)) {
      setCurrentGroup(groups[0]);
    }
  }, [groups]);

  // グループ選択でユーザーも
  useEffect(() => {
    if (!currentGroup) {
      setCurrentUser(null);
      return;
    }
    const groupUsers = users.filter(u => u.groupId === currentGroup.id);
    setCurrentUser(groupUsers[0] || null);
  }, [currentGroup, users]);

  // --- UI ---
  return (
    <Router>
      <div style={{ background: "#e3f2fd", padding: "18px 0 8px 0", borderBottom: "1.5px solid #bbdefb" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, paddingLeft: 20 }}>
          <NavLink to="/" end className={({ isActive }) => "nav-btn" + (isActive ? " active" : "")}>日別カレンダー</NavLink>
          <NavLink to="/month" className={({ isActive }) => "nav-btn" + (isActive ? " active" : "")}>月別カレンダー</NavLink>
          <button className="nav-btn" style={{ marginLeft: "auto" }} onClick={() => setShowGroupSettings(true)}>部署登録</button>
          <button className="nav-btn" onClick={() => setShowUserSettings(true)}>ユーザー登録</button>
        </div>
        {/* ↓ 日付右側にグループタブ */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          margin: "16px 0 0 0", paddingLeft: 20,
        }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>部署：</span>
          {groups.map(group => (
            <button
              key={group.id}
              className={"calendar-btn" + (currentGroup && currentGroup.id === group.id ? " calendar-btn-main" : " calendar-btn-outline")}
              style={{ fontWeight: 600, minWidth: 80 }}
              onClick={() => setCurrentGroup(group)}
            >
              {group.name}
            </button>
          ))}
        </div>
      </div>

      <Routes>
        <Route path="/"
          element={
            <CalendarDay
              users={users.filter(u => currentGroup && u.groupId === currentGroup.id)}
              currentUser={currentUser}
              currentGroup={currentGroup}
              groups={groups}
              onChangeGroup={setCurrentGroup}
              onChangeUser={setCurrentUser}
            />
          }
        />
        <Route path="/month"
          element={
            <CalendarMonth
              users={users.filter(u => currentGroup && u.groupId === currentGroup.id)}
              currentUser={currentUser}
              currentGroup={currentGroup}
              groups={groups}
              onChangeGroup={setCurrentGroup}
              onChangeUser={setCurrentUser}
            />
          }
        />
      </Routes>

      {/* ユーザー/グループ登録モーダル */}
      {showUserSettings && (
        <UserSettings
          groups={groups}
          onClose={() => setShowUserSettings(false)}
        />
      )}
      {showGroupSettings && (
        <GroupSettings
          onClose={() => setShowGroupSettings(false)}
        />
      )}
    </Router>
  );
}
