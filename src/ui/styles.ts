/** 全局样式（深色航海仪表风） */
export const styles = `
:root {
  --bg: #0b1620;
  --panel: #12242f;
  --panel2: #18323f;
  --line: #24475a;
  --text: #dce8ee;
  --muted: #86a2ae;
  --accent: #38c6d9;
  --warn: #ffb020;
  --danger: #ff5c5c;
  --ok: #4dd07a;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text);
  font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif; font-size: 14px; }
#app { min-height: 100vh; }
button { font: inherit; cursor: pointer; }
.topbar { display: flex; align-items: center; gap: 18px; padding: 10px 22px;
  background: linear-gradient(180deg,#10242f,#0c1a23); border-bottom: 1px solid var(--line); }
.topbar .brand { font-weight: 700; letter-spacing: 2px; color: var(--accent); font-size: 16px; }
.topbar nav { display: flex; gap: 6px; }
.topbar nav button { background: transparent; border: 1px solid transparent; color: var(--muted);
  padding: 6px 14px; border-radius: 4px; }
.topbar nav button.active { color: var(--text); background: var(--panel2); border-color: var(--line); }
.topbar nav button:disabled { opacity: .4; cursor: not-allowed; }
.page { padding: 22px; max-width: 1500px; margin: 0 auto; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
.grid { display: grid; gap: 16px; }
.grid.cols-2 { grid-template-columns: repeat(auto-fit,minmax(380px,1fr)); }
.grid.cols-3 { grid-template-columns: repeat(auto-fit,minmax(300px,1fr)); }
h1 { font-size: 22px; margin: 0 0 6px; }
h2 { font-size: 16px; margin: 0 0 12px; color: var(--accent); }
h3 { font-size: 14px; margin: 14px 0 8px; color: var(--muted); }
.muted { color: var(--muted); }
.task-card { cursor: pointer; transition: border-color .15s, transform .15s; }
.task-card:hover { border-color: var(--accent); transform: translateY(-2px); }
.tag { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px;
  background: var(--panel2); border: 1px solid var(--line); color: var(--muted); margin-right: 6px; }
.tag.warn { color: var(--warn); border-color: #5a4415; }
.tag.danger { color: var(--danger); border-color: #5a2020; }
.btn { background: var(--accent); color: #06222a; border: none; border-radius: 5px;
  padding: 9px 20px; font-weight: 600; }
.btn.secondary { background: var(--panel2); color: var(--text); border: 1px solid var(--line); }
.btn.danger { background: var(--danger); color: #2a0808; }
.btn:disabled { opacity: .4; cursor: not-allowed; }
.bridge-layout { display: grid; grid-template-columns: 1fr 320px; gap: 14px; padding: 14px; max-width: 1700px; margin: 0 auto; }
.viewport { position: relative; background: #000; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.viewport canvas { display: block; width: 100%; }
.hud { position: absolute; left: 12px; top: 12px; background: rgba(8,20,28,.78); border: 1px solid var(--line);
  border-radius: 6px; padding: 10px 14px; font-family: "Consolas",monospace; min-width: 230px; }
.hud .row { display: flex; justify-content: space-between; gap: 14px; padding: 2px 0; }
.hud .k { color: var(--muted); }
.hud .v { color: var(--text); font-weight: 600; }
.hud .v.warn { color: var(--warn); } .hud .v.danger { color: var(--danger); } .hud .v.ok { color: var(--ok); }
.sidepanel { display: flex; flex-direction: column; gap: 12px; max-height: calc(100vh - 90px); overflow-y: auto; }
.control-block { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
.telegraph { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; }
.telegraph button { padding: 8px 0; background: var(--panel2); color: var(--text); border: 1px solid var(--line); border-radius: 4px; }
.telegraph button.active { background: var(--accent); color: #06222a; font-weight: 700; }
.telegraph button.ast.active { background: var(--danger); color: #2a0808; }
.rudder-row { display: flex; align-items: center; gap: 10px; }
.rudder-row button { flex: 0 0 auto; width: 44px; height: 38px; background: var(--panel2); color: var(--text);
  border: 1px solid var(--line); border-radius: 4px; font-size: 18px; }
.rudder-gauge { flex: 1; height: 26px; background: var(--panel2); border-radius: 4px; position: relative; overflow: hidden; }
.rudder-gauge .mark { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--muted); }
.rudder-gauge .needle { position: absolute; top: 3px; bottom: 3px; width: 4px; background: var(--accent); border-radius: 2px; }
.tug-row { display: grid; grid-template-columns: 60px 1fr auto; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line); }
.tug-row:last-child { border-bottom: none; }
.tug-row .name { color: var(--muted); font-size: 12px; }
.tug-btns { display: flex; gap: 4px; }
.tug-btns button { padding: 5px 8px; font-size: 12px; background: var(--panel2); border: 1px solid var(--line); color: var(--text); border-radius: 4px; }
.tug-btns button.active { background: var(--warn); color: #2a1c05; border-color: var(--warn); }
.tug-btns button.pull.active { background: var(--accent); color: #06222a; border-color: var(--accent); }
input[type=range] { width: 100%; accent-color: var(--accent); }
.minimap-wrap { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
.minimap-wrap canvas { width: 100%; border-radius: 4px; }
.event-log { max-height: 160px; overflow-y: auto; font-family: "Consolas",monospace; font-size: 12px; }
.event-log .e { padding: 3px 0; border-bottom: 1px dotted var(--line); }
.event-log .e.danger { color: var(--danger); } .event-log .e.warn { color: var(--warn); } .event-log .e.ok { color: var(--ok); }
.score-hero { text-align: center; padding: 30px; }
.score-hero .num { font-size: 64px; font-weight: 800; color: var(--accent); }
.score-hero .grade { font-size: 40px; font-weight: 800; margin-left: 14px; }
.bar { height: 10px; background: var(--panel2); border-radius: 5px; overflow: hidden; margin-top: 6px; }
.bar > div { height: 100%; background: linear-gradient(90deg,var(--accent),#4dd07a); }
table { width: 100%; border-collapse: collapse; }
td, th { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); font-size: 13px; }
th { color: var(--muted); font-weight: 500; }
.chart-wrap { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
.chart-wrap canvas { width: 100%; height: 220px; display: block; }
.cam-switch { display: flex; gap: 6px; position: absolute; right: 12px; top: 12px; }
.cam-switch button { background: rgba(8,20,28,.8); color: var(--text); border: 1px solid var(--line);
  border-radius: 4px; padding: 6px 10px; font-size: 12px; }
.cam-switch button.active { border-color: var(--accent); color: var(--accent); }
.dialog-mask { position: fixed; inset: 0; background: rgba(4,10,15,.7); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 26px; max-width: 480px; }
.pill-row { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
.pill-row button { padding: 6px 14px; border-radius: 16px; background: var(--panel2); border: 1px solid var(--line); color: var(--text); }
.pill-row button.active { border-color: var(--accent); color: var(--accent); }
@media (max-width: 1100px) { .bridge-layout { grid-template-columns: 1fr; } }
`;
