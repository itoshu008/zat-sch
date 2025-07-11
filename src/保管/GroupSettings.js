import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, deleteDoc, updateDoc, onSnapshot, doc, writeBatch
} from "firebase/firestore";

export default function GroupSettings({ onClose }) {
  const [tab, setTab] = useState("user");
  const [name, setName] = useState("");
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [users, setUsers] = useState([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingUserOrder, setEditingUserOrder] = useState(null);
  const [isReorderingGroups, setIsReorderingGroups] = useState(false);

  // ★追加: ユーザー名・グループ名編集中のid・値
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingUserName, setEditingUserName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState("");

  // --- グループ取得 ---
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "groups"), snap => {
      let arr = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const batch = writeBatch(db);
      let needsUpdate = false;
      arr.forEach((g, i) => {
        if (g.order === undefined) {
          batch.update(doc(db, "groups", g.id), { order: i });
          g.order = i;
          needsUpdate = true;
        }
      });
      if(needsUpdate) batch.commit();
      arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setGroups(arr);
      if (arr.length > 0 && !selectedGroupId) {
        setSelectedGroupId(arr[0].id);
      } else if (arr.length === 0) {
        setSelectedGroupId("");
      }
    });
    return () => unsub();
  }, [selectedGroupId]);

  // --- ユーザー取得 ---
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), snap => {
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // --- ユーザー追加 ---
  async function handleAddUser() {
    if (!name.trim() || !selectedGroupId) return;
    const groupUsers = users.filter(u => u.groupId === selectedGroupId);
    const orderMax = groupUsers.length > 0 ? Math.max(...groupUsers.map(u => u.order ?? 0)) : 0;
    await addDoc(collection(db, "users"), {
      name: name.trim(),
      groupId: selectedGroupId,
      order: orderMax + 1,
    });
    setName("");
  }

  async function handleDeleteUser(id) {
    if (!window.confirm("本当にこのユーザーを削除しますか？")) return;
    await deleteDoc(doc(db, "users", id));
  }

  async function handleMoveUserOrder(userId, groupId, direction) {
    const groupUsers = users
      .filter(u => u.groupId === groupId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = groupUsers.findIndex(u => u.id === userId);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= groupUsers.length) return;
    const userA = groupUsers[idx];
    const userB = groupUsers[swapIdx];
    const batch = writeBatch(db);
    batch.update(doc(db, "users", userA.id), { order: userB.order });
    batch.update(doc(db, "users", userB.id), { order: userA.order });
    await batch.commit();
  }

  async function handleMoveUserGroup(userId, newGroupId) {
    const groupUsers = users.filter(u => u.groupId === newGroupId);
    const orderMax = groupUsers.length > 0 ? Math.max(...groupUsers.map(u => u.order ?? 0)) : 0;
    await updateDoc(doc(db, "users", userId), {
      groupId: newGroupId,
      order: orderMax + 1
    });
  }

  // --- グループ追加 ---
  async function handleAddGroup() {
    if (!newGroupName.trim()) return;
    await addDoc(collection(db, "groups"), { name: newGroupName.trim(), order: groups.length });
    setNewGroupName("");
  }

  async function handleDeleteGroup(id) {
    const usersInGroup = users.filter(u => u.groupId === id);
    if (usersInGroup.length > 0) {
      alert("所属するユーザーがいるため、このグループは削除できません。\n先にユーザーを別のグループに移動または削除してください。");
      return;
    }
    if (!window.confirm("このグループを削除しますか？")) return;
    await deleteDoc(doc(db, "groups", id));
    const remainingGroups = groups.filter(g => g.id !== id);
    if (remainingGroups.length > 0) {
        setSelectedGroupId(remainingGroups[0].id);
    } else {
        setSelectedGroupId("");
    }
  }

  async function handleMoveGroupOrder(idx, direction) {
    const newIndex = idx + direction;
    if (newIndex < 0 || newIndex >= groups.length) return;
    const g1 = groups[idx];
    const g2 = groups[newIndex];
    const batch = writeBatch(db);
    batch.update(doc(db, "groups", g1.id), { order: g2.order });
    batch.update(doc(db, "groups", g2.id), { order: g1.order });
    await batch.commit();
  }

  // --- ユーザー名インライン編集 ---
  function startEditUserName(user) {
    setEditingUserId(user.id);
    setEditingUserName(user.name);
  }
  function handleUserNameInputChange(e) {
    setEditingUserName(e.target.value);
  }
  async function finishEditUserName(user) {
    const trimmed = editingUserName.trim();
    if (!trimmed || trimmed === user.name) {
      setEditingUserId(null);
      return;
    }
    await updateDoc(doc(db, "users", user.id), { name: trimmed });
    setEditingUserId(null);
  }

  // --- グループ名インライン編集 ---
  function startEditGroupName(group) {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  }
  function handleGroupNameInputChange(e) {
    setEditingGroupName(e.target.value);
  }
  async function finishEditGroupName(group) {
    const trimmed = editingGroupName.trim();
    if (!trimmed || trimmed === group.name) {
      setEditingGroupId(null);
      return;
    }
    await updateDoc(doc(db, "groups", group.id), { name: trimmed });
    setEditingGroupId(null);
  }

  return (
    <div className="modal-backdrop" onClick={onClose} style={{
      position: "fixed", zIndex: 3000, inset: 0, background: "rgba(0,0,0,0.3)"
    }}>
      <div className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          minWidth: 420, maxWidth: 650, background: "#fff", borderRadius: 15,
          boxShadow: "0 8px 32px rgba(0,0,0,0.1)", margin: "50px auto", padding: 26,
          position: "relative", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column"
        }}>
        <div className="tab-header" style={{ display: "flex", gap: 6, marginBottom: 16, flexShrink: 0 }}>
          <button
            className={tab === "user" ? "active" : ""}
            style={{
              fontWeight: 700, fontSize: 16, padding: "8px 20px", borderRadius: 7,
              border: "1px solid #1976d2", background: tab === "user" ? "#1976d2" : "#fff",
              color: tab === "user" ? "#fff" : "#1976d2", cursor: "pointer"
            }}
            onClick={() => setTab("user")}
          >ユーザー管理</button>
          <button
            className={tab === "group" ? "active" : ""}
            style={{
              fontWeight: 700, fontSize: 16, padding: "8px 20px", borderRadius: 7,
              border: "1px solid #1976d2", background: tab === "group" ? "#1976d2" : "#fff",
              color: tab === "group" ? "#fff" : "#1976d2", cursor: "pointer"
            }}
            onClick={() => setTab("group")}
          >グループ管理</button>
          <button
            onClick={onClose}
            style={{
              position: "absolute", right: 20, top: 15, fontWeight: 800, fontSize: 20,
              background: "none", border: "none", color: "#aaa", cursor: "pointer", padding: "0 8px"
            }}>×</button>
        </div>
        <div className="modal-tab-scroll" style={{
          flex: 1, minHeight: 0,
          overflowY: "auto", padding: "0 4px 12px 0"
        }}>
          {/* ---- ユーザー管理タブ ---- */}
          {tab === "user" && (
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
                <label style={{ fontWeight: 700 }}>氏名</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{
                    width: 170, padding: "6px 12px", borderRadius: 6,
                    border: "1.2px solid #bbb", fontSize: 16
                  }}
                  placeholder="例：雑踏　太郎"
                />
                <label style={{ fontWeight: 700, marginLeft: 10 }}>グループ</label>
                <select
                  value={selectedGroupId}
                  onChange={e => setSelectedGroupId(e.target.value)}
                  style={{
                    padding: "7px 14px", fontSize: 15, borderRadius: 7, border: "1.2px solid #bbb", minWidth: 120
                  }}
                >
                  {groups.map(g =>
                    <option key={g.id} value={g.id}>{g.name}</option>
                  )}
                </select>
                <button
                  style={{
                    fontWeight: 600, fontSize: 16, marginLeft: 8, padding: "7px 24px", borderRadius: 8,
                    border: "none", background: "#1976d2", color: "#fff", cursor: "pointer"
                  }}
                  onClick={handleAddUser}
                  disabled={!name.trim() || !selectedGroupId}
                >追加</button>
              </div>
              {groups.map(group => {
                const usersInGroup = users
                  .filter(u => u.groupId === group.id)
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                const isEditing = editingUserOrder === group.id;
                return (
                  <div key={group.id} style={{ marginBottom: 28 }}>
                    <div style={{
                      display: "flex", alignItems: "center",
                      fontWeight: 700, fontSize: 15, color: "#2a58ad",
                      margin: "12px 0 4px 0", borderLeft: "5px solid #e3edff", paddingLeft: 10
                    }}>
                      {editingGroupId === group.id ? (
                        <input
                          autoFocus
                          value={editingGroupName}
                          onChange={handleGroupNameInputChange}
                          onBlur={() => finishEditGroupName(group)}
                          onKeyDown={e => {
                            if (e.key === "Enter") finishEditGroupName(group);
                            if (e.key === "Escape") setEditingGroupId(null);
                          }}
                          style={{
                            fontSize: 15, fontWeight: 700,
                            border: "2px solid #1976d2", borderRadius: 5,
                            padding: "2px 12px", marginRight: 4, background: "#f6f9ff",
                            outline: "none", color: "#2a58ad"
                          }}
                        />
                      ) : (
                        <span
                          style={{ cursor: "pointer" }}
                          onClick={() => startEditGroupName(group)}
                          title="クリックしてグループ名を編集"
                        >
                          {group.name}
                        </span>
                      )}
                      {!isEditing ? (
                        <button
                          style={{
                            marginLeft: 14, fontSize: 13, padding: "2px 14px",
                            borderRadius: 8, border: "1.1px solid #1976d2", background: "#fff",
                            color: "#1976d2", cursor: "pointer"
                          }}
                          onClick={() => setEditingUserOrder(group.id)}
                        >順番変更</button>
                      ) : (
                        <button
                          style={{
                            marginLeft: 14, fontSize: 13, padding: "2px 14px",
                            borderRadius: 8, border: "1.1px solid #aaa", background: "#f7fafd",
                            color: "#555", cursor: "pointer"
                          }}
                          onClick={() => setEditingUserOrder(null)}
                        >並び替え終了</button>
                      )}
                    </div>
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px" }}>
                      <tbody>
                        {usersInGroup.length === 0 ? (
                          <tr>
                            <td colSpan={4} style={{ color: "#bbb", fontSize: 14, textAlign: "center", padding: "10px 0" }}>
                              このグループのユーザーはいません
                            </td>
                          </tr>
                        ) : (
                          usersInGroup.map((u, i) => (
                            <tr key={u.id} style={{ background: "#f8fbff", boxShadow: "0 1px 3px rgba(0,0,0,0.04)"}}>
                              <td style={{ padding: "8px 12px", width: 120, fontSize: 15 }}>
                                {editingUserId === u.id ? (
                                  <input
                                    autoFocus
                                    value={editingUserName}
                                    onChange={handleUserNameInputChange}
                                    onBlur={() => finishEditUserName(u)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") finishEditUserName(u);
                                      if (e.key === "Escape") setEditingUserId(null);
                                    }}
                                    style={{
                                      fontSize: 15,
                                      border: "2px solid #1976d2",
                                      borderRadius: 5,
                                      padding: "2px 8px",
                                      background: "#f7fbff",
                                      outline: "none"
                                    }}
                                  />
                                ) : (
                                  <span
                                    style={{ cursor: "pointer" }}
                                    onClick={() => startEditUserName(u)}
                                    title="クリックして氏名を編集"
                                  >
                                    {u.name}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "8px 12px", width: 90 }}>
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={() => handleMoveUserOrder(u.id, group.id, -1)}
                                      disabled={i === 0}
                                      style={{ border: "1px solid #ccc", background: "#fff", cursor:"pointer", marginRight: 4, padding: "2px 8px", borderRadius: 8 }}
                                    >↑</button>
                                    <button
                                      onClick={() => handleMoveUserOrder(u.id, group.id, 1)}
                                      disabled={i === usersInGroup.length - 1}
                                      style={{ border: "1px solid #ccc", background: "#fff", cursor:"pointer", padding: "2px 8px", borderRadius: 8 }}
                                    >↓</button>
                                  </>
                                ) : (
                                  <span style={{ color: "#888" }}>{i + 1}</span>
                                )}
                              </td>
                              <td style={{ padding: "8px 12px", width: 120 }}>
                                <select
                                  value={u.groupId}
                                  onChange={e => handleMoveUserGroup(u.id, e.target.value)}
                                  style={{
                                    padding: "4px 14px", fontSize: 15, borderRadius: 6, border: "1.2px solid #bbb"
                                  }}
                                >
                                  {groups.map(g =>
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                  )}
                                </select>
                              </td>
                              <td style={{ padding: "8px 12px", width: 80 }}>
                                <button
                                  style={{
                                    fontSize: 13, padding: "4px 14px", borderRadius: 10,
                                    border: "1px solid #d32f2f", color: "#d32f2f", background: "#fff", cursor:"pointer"
                                  }}
                                  onClick={() => handleDeleteUser(u.id)}
                                >削除</button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          {/* ---- グループ管理タブ ---- */}
          {tab === "group" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <input
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      placeholder="グループ名を入力"
                      style={{
                        width: 200, padding: "7px 10px",
                        borderRadius: 7, border: "1.2px solid #bbb", fontSize: 16
                      }}
                    />
                    <button
                      style={{ padding: "7px 22px", fontSize: 15, borderRadius: 8,
                              border: "none", background: "#1976d2", color: "#fff", cursor: "pointer" }}
                      onClick={handleAddGroup}
                      disabled={!newGroupName.trim()}
                    >追加</button>
                </div>
                {!isReorderingGroups ? (
                    <button
                        style={{ padding: "7px 22px", fontSize: 15, borderRadius: 8, border: "1px solid #1976d2", background: "#fff", color: "#1976d2", cursor: "pointer" }}
                        onClick={() => setIsReorderingGroups(true)}
                    >順番変更</button>
                ) : (
                    <button
                        style={{ padding: "7px 22px", fontSize: 15, borderRadius: 8, border: "1px solid #aaa", background: "#f0f0f0", color: "#333", cursor: "pointer" }}
                        onClick={() => setIsReorderingGroups(false)}
                    >並び替え終了</button>
                )}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ fontWeight: 600, fontSize: 15, padding: "7px 8px", textAlign: "left", background: "#f4f8fe" }}>グループ名</th>
                    <th style={{ width: 120, background: "#f4f8fe" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, i) => (
                    <tr key={g.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "8px", fontSize: 16 }}>
                        {editingGroupId === g.id ? (
                          <input
                            autoFocus
                            value={editingGroupName}
                            onChange={handleGroupNameInputChange}
                            onBlur={() => finishEditGroupName(g)}
                            onKeyDown={e => {
                              if (e.key === "Enter") finishEditGroupName(g);
                              if (e.key === "Escape") setEditingGroupId(null);
                            }}
                            style={{
                              fontSize: 15, fontWeight: 700,
                              border: "2px solid #1976d2", borderRadius: 5,
                              padding: "2px 12px", background: "#f6f9ff",
                              outline: "none", color: "#2a58ad"
                            }}
                          />
                        ) : (
                          <span
                            style={{ cursor: "pointer" }}
                            onClick={() => startEditGroupName(g)}
                            title="クリックしてグループ名を編集"
                          >
                            {g.name}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "right", padding: "4px 8px" }}>
                        {isReorderingGroups && (
                          <>
                            <button
                              style={{ fontSize: 14, padding: "2.5px 9px", marginRight: 2, border: "1px solid #ccc", background: "#fff", cursor:"pointer" }}
                              onClick={() => handleMoveGroupOrder(i, -1)}
                              disabled={i === 0}
                            >↑</button>
                            <button
                              style={{ fontSize: 14, padding: "2.5px 9px", marginRight: 6, border: "1px solid #ccc", background: "#fff", cursor:"pointer" }}
                              onClick={() => handleMoveGroupOrder(i, 1)}
                              disabled={i === groups.length - 1}
                            >↓</button>
                          </>
                        )}
                        <button
                          style={{ fontSize: 13, padding: "4px 12px", borderRadius: 10, border: "1px solid #d32f2f", color: "#d32f2f", background: "#fff", cursor:"pointer" }}
                          onClick={() => handleDeleteGroup(g.id)}
                        >削除</button>
                      </td>
                    </tr>
                  ))}
                  {groups.length === 0 && (
                    <tr>
                      <td colSpan={2} style={{ color: "#999", fontSize: 15, padding: 12, textAlign: "center" }}>グループがありません</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div style={{ marginTop: 24, textAlign: "center" }}>
                <button
                  style={{ width: 92, fontSize: 16, padding: "6px 0", border: "1px solid #ccc", background: "#fff", cursor:"pointer", borderRadius: 8 }}
                  onClick={onClose}
                >閉じる</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
