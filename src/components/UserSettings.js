import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, deleteDoc, updateDoc, onSnapshot, doc
} from "firebase/firestore";

export default function UserGroupModal({ onClose }) {
  const [tab, setTab] = useState("user");
  const [name, setName] = useState("");
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [users, setUsers] = useState([]);
  const [newGroupName, setNewGroupName] = useState("");
  // ★追加：どのグループで順番編集モードか
  const [editingGroupOrder, setEditingGroupOrder] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "groups"), snap => {
      const arr = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGroups(arr);
      if (arr.length && !selectedGroupId) setSelectedGroupId(arr[0].id);
    });
    return unsub;
  }, [selectedGroupId]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), snap => {
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, []);

  async function handleAddUser() {
    if (!name.trim() || !selectedGroupId) return;
    const orderMax = Math.max(
      0,
      ...users.filter(u => u.groupId === selectedGroupId).map(u => u.order ?? 0)
    );
    await addDoc(collection(db, "users"), {
      name: name.trim(),
      groupId: selectedGroupId,
      order: orderMax + 1,
    });
    setName("");
  }

  async function handleDeleteUser(id) {
    if (!window.confirm("本当に削除しますか？")) return;
    await deleteDoc(doc(db, "users", id));
  }

  async function handleAddGroup() {
    if (!newGroupName.trim()) return;
    await addDoc(collection(db, "groups"), { name: newGroupName.trim() });
    setNewGroupName("");
  }

  async function handleDeleteGroup(id) {
    if (!window.confirm("このグループを削除しますか？（所属ユーザーも削除されます）")) return;
    const toDelete = users.filter(u => u.groupId === id);
    for (let u of toDelete) {
      await deleteDoc(doc(db, "users", u.id));
    }
    await deleteDoc(doc(db, "groups", id));
    setSelectedGroupId(groups.length > 1 ? groups.find(g => g.id !== id)?.id : "");
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
    await updateDoc(doc(db, "users", userA.id), { order: userB.order });
    await updateDoc(doc(db, "users", userB.id), { order: userA.order });
  }

  async function handleMoveUserGroup(userId, newGroupId) {
    const orderMax = Math.max(
      0,
      ...users.filter(u => u.groupId === newGroupId).map(u => u.order ?? 0)
    );
    await updateDoc(doc(db, "users", userId), {
      groupId: newGroupId,
      order: orderMax + 1
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose} style={{
      position: "fixed", zIndex: 3000, inset: 0, background: "#2235a950"
    }}>
      <div className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          minWidth: 420, maxWidth: 650, background: "#fff", borderRadius: 15,
          boxShadow: "0 8px 32px #2235a930", margin: "50px auto", padding: 26,
          position: "relative", maxHeight: "90vh", overflow: "hidden"
        }}>
        <div className="tab-header" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
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
              position: "absolute", right: 20, top: 15, fontWeight: 800, fontSize: 17,
              background: "none", border: "none", color: "#aaa", cursor: "pointer"
            }}>×</button>
        </div>
        <div className="modal-tab-scroll" style={{
          maxHeight: "68vh", overflowY: "auto", paddingRight: 4, paddingBottom: 12
        }}>
          {tab === "user" && (
            <div>
              {/* 新規ユーザー追加フォーム */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 24 }}>
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
                  className="calendar-btn calendar-btn-main"
                  style={{
                    fontWeight: 600, fontSize: 16, marginLeft: 8, padding: "7px 24px", borderRadius: 8
                  }}
                  onClick={handleAddUser}
                  disabled={!name.trim() || !selectedGroupId}
                >追加</button>
              </div>

              {/* ▼ グループごとにユーザー一覧＋並び順操作 */}
              {groups.map(group => {
                const usersInGroup = users
                  .filter(u => u.groupId === group.id)
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                const isEditing = editingGroupOrder === group.id;
                return (
                  <div key={group.id} style={{ marginBottom: 28 }}>
                    {/* グループ名＆順番変更ボタン */}
                    <div style={{
                      display: "flex", alignItems: "center",
                      fontWeight: 700, fontSize: 15, color: "#2a58ad",
                      margin: "12px 0 4px 0", borderLeft: "5px solid #e3edff", paddingLeft: 10
                    }}>
                      {group.name}
                      {!isEditing &&
                        <button
                          style={{
                            marginLeft: 14, fontSize: 13, padding: "2px 14px",
                            borderRadius: 8, border: "1.1px solid #1976d2", background: "#fff",
                            color: "#1976d2", cursor: "pointer"
                          }}
                          onClick={() => setEditingGroupOrder(group.id)}
                        >順番変更</button>
                      }
                      {isEditing &&
                        <button
                          style={{
                            marginLeft: 14, fontSize: 13, padding: "2px 14px",
                            borderRadius: 8, border: "1.1px solid #aaa", background: "#f7fafd",
                            color: "#555", cursor: "pointer"
                          }}
                          onClick={() => setEditingGroupOrder(null)}
                        >並び替え終了</button>
                      }
                    </div>
                    <table style={{
                      width: "100%",
                      background: "#f8fbff",
                      borderRadius: 8,
                      marginBottom: 6,
                      borderCollapse: "separate",
                      borderSpacing: 0,
                      boxShadow: "0 1px 3px #aaa1"
                    }}>
                      <thead>
                        <tr>
                          <th style={{ width: 120, fontWeight: 600, fontSize: 14 }}>氏名</th>
                          <th style={{ width: 90, fontWeight: 600, fontSize: 14 }}>順序</th>
                          <th style={{ width: 120, fontWeight: 600, fontSize: 14 }}>グループ</th>
                          <th style={{ width: 80 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersInGroup.length === 0 ? (
                          <tr>
                            <td colSpan={4} style={{ color: "#bbb", fontSize: 14, textAlign: "center" }}>
                              このグループのユーザーはいません
                            </td>
                          </tr>
                        ) : (
                          usersInGroup.map((u, i) => (
                            <tr key={u.id}>
                              {/* 氏名 */}
                              <td style={{ fontSize: 15 }}>{u.name}</td>
                              {/* 並び順ボタン */}
                              <td>
                                {isEditing ? (
                                  <>
                                    <button
                                      className="calendar-btn calendar-btn-outline"
                                      onClick={() => handleMoveUserOrder(u.id, group.id, -1)}
                                      disabled={i === 0}
                                      style={{
                                        marginRight: 4, padding: "2px 8px", borderRadius: 8
                                      }}
                                    >↑</button>
                                    <button
                                      className="calendar-btn calendar-btn-outline"
                                      onClick={() => handleMoveUserOrder(u.id, group.id, 1)}
                                      disabled={i === usersInGroup.length - 1}
                                      style={{
                                        padding: "2px 8px", borderRadius: 8
                                      }}
                                    >↓</button>
                                  </>
                                ) : (
                                  <span style={{ color: "#888" }}>{i + 1}</span>
                                )}
                              </td>
                              {/* グループ移動 */}
                              <td>
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
                              {/* 削除ボタン */}
                              <td>
                                <button
                                  className="calendar-btn calendar-btn-outline"
                                  style={{
                                    fontSize: 13, padding: "4px 14px", borderRadius: 10, minWidth: 58
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

          {/* --- グループ管理タブ --- */}
          {tab === "group" && (
            <div>
              {/* 新規グループ追加 */}
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
                <input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="グループ名を入力"
                  style={{
                    width: "65%", minWidth: 120, padding: "7px 10px",
                    borderRadius: 7, border: "1.2px solid #bbb", fontSize: 16, marginRight: 10
                  }}
                />
                <button
                  className="calendar-btn calendar-btn-main"
                  style={{ padding: "7px 22px", fontSize: 15, borderRadius: 8 }}
                  onClick={handleAddGroup}
                  disabled={!newGroupName.trim()}
                >追加</button>
              </div>
              {/* グループ一覧 */}
              <div style={{ maxHeight: 240, overflowY: "auto", marginBottom: 10 }}>
                <table style={{
                  width: "100%", background: "#f8fbff", borderRadius: 8,
                  borderCollapse: "collapse", boxShadow: "0 1px 3px #aaa1"
                }}>
                  <thead>
                    <tr>
                      <th style={{ fontWeight: 600, fontSize: 15, padding: "7px 0" }}>グループ名</th>
                      <th style={{ width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(g => (
                      <tr key={g.id}>
                        <td style={{ padding: "8px 0", fontSize: 16 }}>{g.name}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="calendar-btn calendar-btn-outline"
                            style={{ fontSize: 13, padding: "4px 12px", borderRadius: 10 }}
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
              </div>
              <div style={{ marginTop: 16, textAlign: "center" }}>
                <button
                  className="calendar-btn calendar-btn-outline"
                  style={{ width: 92, fontSize: 16 }}
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
