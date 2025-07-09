import React, { useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../firebase";

const COLORS_36 = [
  "#1976d2", "#43a047", "#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5", "#2196f3",
  "#03a9f4", "#00bcd4", "#009688", "#4caf50", "#8bc34a", "#cddc39", "#ffeb3b", "#ffc107",
  "#ff9800", "#ff5722", "#795548", "#607d8b", "#c2185b", "#7b1fa2", "#512da8",
  "#0288d1", "#0097a7", "#388e3c", "#689f38", "#afb42b", "#fbc02d", "#ffa000", "#f57c00",
  "#e64a19", "#5d4037", "#455a64", "#6d4c41", "#00acc1"
];

export default function SimpleEventDialog({
  onClose,
  onAdd,
}) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#1976d2");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function validate() {
    if (!title.trim()) return "タイトルは必須です";
    if (!color) return "色を選択してください";
    return "";
  }

  async function handleSaveEvent() {
    const validationError = validate();
    if (validationError) {
      setError(validationError); setSuccess(""); return;
    }
    try {
      await addDoc(collection(db, "events"), {
        title: title.trim(),
        color,
      });
      setSuccess("イベントを保存しました！");
      if (onAdd) onAdd();
      if (onClose) onClose();
    } catch (err) {
      setError("登録に失敗しました: " + (err.message || "Unknown error")); setSuccess("");
    }
  }

  async function handleSaveTemplate() {
    const validationError = validate();
    if (validationError) {
      setError(validationError); setSuccess(""); return;
    }
    try {
      await addDoc(collection(db, "templates"), {
        title: title.trim(),
        color,
      });
      setSuccess("テンプレートに保存しました！");
      setTitle(""); // オプション：保存後クリア
      setColor("#1976d2");
    } catch (err) {
      setError("テンプレ保存失敗: " + (err.message || "Unknown error")); setSuccess("");
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 3000,
      background: "rgba(34,42,62,0.18)", display: "flex",
      alignItems: "center", justifyContent: "center"
    }}>
      <div style={{
        minWidth: 340, maxWidth: 420, width: "96vw", padding: 30,
        background: "#fff", borderRadius: 22,
        boxShadow: "0 8px 32px #1250bb33, 0 1.5px 0 #fff, 0 0 0 1.5px #90caf933",
        display: "flex", flexDirection: "column"
      }}>
        <div style={{
          fontWeight: 700, fontSize: 21, letterSpacing: "0.05em",
          color: "#1976d2", marginBottom: 20, textAlign: "center"
        }}>用件の登録</div>
        <form
          style={{ display: "flex", flexDirection: "column", gap: 18 }}
          onSubmit={e => { e.preventDefault(); handleSaveEvent(); }}
        >
          {/* タイトル */}
          <div style={{ position: "relative" }}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder=" "
              style={{
                width: "100%", fontSize: 17, padding: "15px 12px 7px 12px",
                border: "2.2px solid #90caf9", borderRadius: 7,
                outline: "none", transition: "border .18s",
                boxShadow: "0 1.5px 8px #1976d222",
                fontWeight: 500,
                background: "#f8fbff"
              }}
              autoFocus
              required
              onFocus={e => e.target.style.border = "2.5px solid #1976d2"}
              onBlur={e => e.target.style.border = "2.2px solid #90caf9"}
            />
            <label style={{
              position: "absolute", left: 13, top: title ? 3 : 17,
              color: title ? "#1976d2" : "#888", fontSize: title ? 13 : 16,
              fontWeight: 600, pointerEvents: "none", transition: "all .16s"
            }}>
              用件（タイトル）
            </label>
          </div>
          {/* カラー選択 */}
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, color: "#1976d2" }}>色を選択</div>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center", marginTop: 3
            }}>
              {COLORS_36.map(c => (
                <div key={c} style={{
                  width: 28, height: 28, borderRadius: "50%", background: c,
                  margin: "1.5px 1.5px", boxSizing: "border-box",
                  border: color === c ? "3.2px solid #1976d2" : "2px solid #fff",
                  boxShadow: color === c ? "0 0 6px #1976d2bb" : "0 1.2px 4px #0002",
                  cursor: "pointer", transition: "border .18s"
                }}
                  onClick={() => setColor(c)}
                  title={c}
                />
              ))}
            </div>
          </div>
          {/* エラー・サクセス表示 */}
          {error && (
            <div style={{
              marginTop: 8, color: "#d32f2f", fontWeight: 600,
              fontSize: 15, textAlign: "center", letterSpacing: "0.03em"
            }}>{error}</div>
          )}
          {success && (
            <div style={{
              marginTop: 8, color: "#388e3c", fontWeight: 600,
              fontSize: 15, textAlign: "center", letterSpacing: "0.03em"
            }}>{success}</div>
          )}
          {/* ボタン */}
          <div style={{
            marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 16
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                minWidth: 92, padding: "10px 0", fontWeight: 700, fontSize: 16,
                borderRadius: 9, border: "2px solid #90caf9", background: "#f5faff",
                color: "#1976d2", cursor: "pointer", transition: "background .13s"
              }}
            >キャンセル</button>
            <button
              type="button"
              onClick={handleSaveTemplate}
              style={{
                minWidth: 92, padding: "10px 0", fontWeight: 700, fontSize: 16,
                borderRadius: 9, background: "#43a047",
                border: "2px solid #43a047", color: "#fff", cursor: "pointer",
                boxShadow: "0 1.5px 10px #43a04744", transition: "background .13s"
              }}
            >テンプレート保存</button>
           
          </div>
        </form>
      </div>
    </div>
  );
}
