import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from "firebase/firestore";

const COLORS_36 = [
  "#1976d2", "#43a047", "#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5", "#2196f3",
  "#03a9f4", "#00bcd4", "#009688", "#4caf50", "#8bc34a", "#cddc39", "#ffeb3b", "#ffc107",
  "#ff9800", "#ff5722", "#795548", "#607d8b", "#c2185b", "#7b1fa2", "#512da8",
  "#0288d1", "#0097a7", "#388e3c", "#689f38", "#afb42b", "#fbc02d", "#ffa000", "#f57c00",
  "#e64a19", "#5d4037", "#455a64", "#6d4c41", "#00acc1"
];

export default function SimpleTemplateManagerDialog({ onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editColor, setEditColor] = useState(COLORS_36[0]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // 削除確認用
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function fetchTemplates() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "templates"));
      setTemplates(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTemplates(); }, []);

  function startEdit(tpl) {
    setEditId(tpl.id);
    setEditTitle(tpl.title);
    setEditColor(tpl.color);
    setError("");
    setSuccess("");
  }

  async function saveEdit() {
    if (!editTitle.trim()) {
      setError("タイトルは必須です"); setSuccess(""); return;
    }
    try {
      await updateDoc(doc(db, "templates", editId), {
        title: editTitle.trim(),
        color: editColor,
      });
      setSuccess("保存しました");
      setEditId(null);
      fetchTemplates();
    } catch (err) {
      setError("保存失敗: " + (err.message || "Unknown error"));
    }
  }

  async function doDeleteTpl(id) {
    await deleteDoc(doc(db, "templates", id));
    setDeleteTarget(null);
    fetchTemplates();
  }

  // 新規追加
  const [newTitle, setNewTitle] = useState("");
  const [newColor, setNewColor] = useState(COLORS_36[0]);
  async function handleAdd() {
    if (!newTitle.trim()) {
      setError("タイトルは必須です"); setSuccess(""); return;
    }
    await addDoc(collection(db, "templates"), {
      title: newTitle.trim(),
      color: newColor,
    });
    setNewTitle("");
    setNewColor(COLORS_36[0]);
    setError(""); setSuccess("追加しました");
    fetchTemplates();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 3000,
      background: "rgba(34,42,62,0.18)", display: "flex",
      alignItems: "center", justifyContent: "center"
    }}>
      <div style={{
        minWidth: 380, maxWidth: 500, width: "97vw", padding: 30,
        background: "#fff", borderRadius: 20,
        boxShadow: "0 8px 32px #1250bb33",
        display: "flex", flexDirection: "column"
      }}>
        <div style={{
          fontWeight: 700, fontSize: 20, color: "#1976d2", marginBottom: 18, textAlign: "center"
        }}>テンプレート管理</div>

        {/* 追加フォーム */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18 }}>
          <input
            placeholder="新しいタイトル"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            style={{
              flex: 2, fontSize: 16, padding: 7, border: "1.6px solid #90caf9", borderRadius: 7,
              background: "#f8fbff", fontWeight: 500
            }}
          />
          {/* 色パレット */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            {COLORS_36.map(c => (
              <div
                key={c}
                onClick={() => setNewColor(c)}
                style={{
                  width: 24, height: 24, borderRadius: "50%", background: c,
                  margin: "1.5px", boxSizing: "border-box",
                  border: newColor === c ? "3px solid #1976d2" : "1.5px solid #fff",
                  boxShadow: newColor === c ? "0 0 6px #1976d2bb" : "0 1.2px 4px #0002",
                  cursor: "pointer", transition: "border .16s"
                }}
                title={c}
              />
            ))}
          </div>
          <button
            onClick={handleAdd}
            style={{
              fontWeight: 700, fontSize: 15, padding: "7px 12px", borderRadius: 7,
              background: "#43a047", color: "#fff", border: "none"
            }}
          >追加</button>
        </div>

        {/* 一覧 */}
        <div style={{
          minHeight: 70, marginBottom: 10, maxHeight: 350, overflowY: "auto"
        }}>
          {loading ? (
            <div style={{ textAlign: "center", color: "#888" }}>読み込み中…</div>
          ) : templates.length === 0 ? (
            <div style={{ textAlign: "center", color: "#bbb" }}>テンプレートがありません</div>
          ) : (
            templates.map(tpl => (
              <div key={tpl.id} style={{
                display: "flex", alignItems: "center", gap: 12, marginBottom: 7,
                background: editId === tpl.id ? "#e3f2fd" : "transparent", borderRadius: 7, padding: 4
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 4, background: tpl.color,
                  border: "1.5px solid #ccc", marginRight: 3
                }}></div>
                {editId === tpl.id ? (
                  <>
                    <input value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      style={{
                        fontSize: 16, padding: 4, flex: 1, border: "1.4px solid #90caf9", borderRadius: 6
                      }}
                    />
                    {/* 編集時のパレット */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                      {COLORS_36.map(c => (
                        <div
                          key={c}
                          onClick={() => setEditColor(c)}
                          style={{
                            width: 22, height: 22, borderRadius: "50%", background: c,
                            margin: "1px", boxSizing: "border-box",
                            border: editColor === c ? "3px solid #1976d2" : "1.5px solid #fff",
                            boxShadow: editColor === c ? "0 0 6px #1976d2bb" : "0 1.2px 4px #0002",
                            cursor: "pointer", transition: "border .16s"
                          }}
                          title={c}
                        />
                      ))}
                    </div>
                    <button onClick={saveEdit}
                      style={{ marginLeft: 4, background: "#1976d2", color: "#fff", border: "none", padding: "5px 10px", borderRadius: 6 }}>保存</button>
                    <button onClick={() => setEditId(null)}
                      style={{ marginLeft: 4, background: "#ccc", color: "#222", border: "none", padding: "5px 10px", borderRadius: 6 }}>キャンセル</button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, fontWeight: 600, fontSize: 16 }}>{tpl.title}</div>
                    <button onClick={() => startEdit(tpl)}
                      style={{ marginLeft: 4, background: "#1976d2", color: "#fff", border: "none", padding: "5px 10px", borderRadius: 6 }}>編集</button>
                    <button onClick={() => setDeleteTarget(tpl)}
                      style={{ marginLeft: 4, background: "#e53935", color: "#fff", border: "none", padding: "5px 10px", borderRadius: 6 }}>削除</button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {error && <div style={{ color: "#d32f2f", fontWeight: 600, textAlign: "center", marginBottom: 5 }}>{error}</div>}
        {success && <div style={{ color: "#43a047", fontWeight: 600, textAlign: "center", marginBottom: 5 }}>{success}</div>}

        <div style={{ textAlign: "right", marginTop: 10 }}>
          <button onClick={onClose}
            style={{
              fontWeight: 700, fontSize: 16, padding: "10px 30px",
              borderRadius: 9, border: "2px solid #90caf9", background: "#f5faff", color: "#1976d2", cursor: "pointer"
            }}>
            閉じる
          </button>
        </div>
      </div>

      {/* --- 削除確認ダイアログ --- */}
      {deleteTarget &&
        <div style={{
          position: "fixed", inset: 0, zIndex: 3100,
          background: "rgba(30,34,44,0.25)", display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            minWidth: 320, maxWidth: 420, background: "#fff", borderRadius: 16, boxShadow: "0 8px 32px #0003",
            padding: "38px 32px 30px 32px", display: "flex", flexDirection: "column", alignItems: "center"
          }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 17, color: "#e53935", textAlign: "center" }}>
              テンプレート「{deleteTarget.title}」<br />を削除しますか？
            </div>
            <div style={{ display: "flex", gap: 28, marginTop: 10 }}>
              <button
                onClick={() => doDeleteTpl(deleteTarget.id)}
                style={{
                  minWidth: 94, fontSize: 16, fontWeight: 700,
                  background: "#e53935", color: "#fff", border: "none",
                  borderRadius: 8, padding: "9px 0", boxShadow: "0 1.5px 10px #e5393540"
                }}>削除</button>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  minWidth: 94, fontSize: 16, fontWeight: 700,
                  background: "#eee", color: "#333", border: "none",
                  borderRadius: 8, padding: "9px 0"
                }}>キャンセル</button>
            </div>
          </div>
        </div>
      }
    </div>
  );
}
