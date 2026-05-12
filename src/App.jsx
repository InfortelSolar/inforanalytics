import { useState, useRef } from "react";

const COLORS = ["#F59E0B","#10B981","#3B82F6","#EF4444","#8B5CF6","#EC4899","#14B8A6","#F97316"];

const fmt = (n) => "R$ " + Number(n).toFixed(2).replace(".", ",");

const SYSTEM_PROMPT = `Você é um especialista em faturas de energia elétrica brasileira, especialmente das concessionárias Energisa (Paraíba) e Neo Energia (Pernambuco).
Você trabalha para uma empresa de energia solar e precisa ajudar a entender exatamente o que está sendo cobrado na fatura de cada cliente.

Ao analisar uma fatura, identifique e extraia todos os dados visíveis.

IMPORTANTE: Responda APENAS com um JSON válido, sem texto adicional, no seguinte formato:
{
  "concessionaria": "nome da concessionária",
  "cliente": "nome do cliente ou 'Não identificado'",
  "mes_referencia": "mês/ano de referência",
  "total_fatura": 0.00,
  "consumo_kwh": 0,
  "itens": [
    { "nome": "Nome do Item", "valor": 0.00, "percentual": 0.0, "descricao": "breve descrição" }
  ],
  "alertas": ["alerta 1", "alerta 2"],
  "economia_solar": "texto sobre potencial de economia com solar",
  "resumo": "parágrafo resumindo o que foi encontrado na fatura"
}`;

export default function App() {
  const [conc, setConc] = useState("energisa");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const fileRef = useRef();
  const resultsRef = useRef();

  const handleFile = (f) => {
    const allowed = ["application/pdf","image/jpeg","image/png","image/webp"];
    if (!allowed.includes(f.type)) return setError("Formato não suportado. Use PDF, JPG, PNG ou WEBP.");
    if (f.size > 10 * 1024 * 1024) return setError("Arquivo muito grande. Máximo 10 MB.");
    setError("");
    setFile(f);
    setPreview(f.type !== "application/pdf" ? URL.createObjectURL(f) : null);
  };

  const removeFile = () => { setFile(null); setPreview(null); };

  const analyze = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("Falha ao ler arquivo"));
        r.readAsDataURL(file);
      });

      const concLabel = conc === "energisa" ? "Energisa (Paraíba)" : "Neo Energia (Pernambuco)";

      // Chama o Gemini via função serverless do Netlify (gratuito)
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64: base64,
          mimeType: file.type,
          concessionaria: concLabel,
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      const data = await res.json();
      const rawText = data.text || "";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Não foi possível extrair os dados. Verifique se é uma fatura válida.");
      const bill = JSON.parse(jsonMatch[0]);
      if (bill.itens && bill.total_fatura > 0) {
        bill.itens = bill.itens.map(item => ({
          ...item,
          percentual: item.percentual ?? (Math.abs(item.valor) / bill.total_fatura * 100)
        }));
      }
      setResult(bill);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      setError(e.message || "Erro ao analisar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const BarChart = ({ items }) => {
    const max = Math.max(...items.map(i => Math.abs(i.valor)));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 110, fontSize: 11, color: "#6B7280", textAlign: "right", flexShrink: 0, lineHeight: 1.3 }}>{item.nome}</div>
            <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 6, height: 22, overflow: "hidden" }}>
              <div style={{ width: `${(Math.abs(item.valor) / max) * 100}%`, height: "100%", background: COLORS[i % COLORS.length], borderRadius: 6, transition: "width 0.6s ease", minWidth: 2 }} />
            </div>
            <div style={{ width: 72, fontSize: 11, fontWeight: 700, color: "#111827", flexShrink: 0 }}>{fmt(item.valor)}</div>
          </div>
        ))}
      </div>
    );
  };

  const DonutChart = ({ items }) => {
    const total = items.reduce((s, i) => s + Math.abs(i.valor), 0);
    let cumulative = 0;
    const R = 60, cx = 80, cy = 80, stroke = 22;
    const circumference = 2 * Math.PI * R;
    const segments = items.map((item, i) => {
      const pct = Math.abs(item.valor) / total;
      const offset = circumference * (1 - cumulative);
      const dash = circumference * pct;
      cumulative += pct;
      return { ...item, pct, offset, dash, color: COLORS[i % COLORS.length] };
    });
    return (
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <svg width={160} height={160} style={{ flexShrink: 0 }}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#F3F4F6" strokeWidth={stroke} />
          {segments.map((s, i) => (
            <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${s.dash} ${circumference - s.dash}`}
              strokeDashoffset={s.offset}
              transform={`rotate(-90 ${cx} ${cy})`} />
          ))}
          <text x={cx} y={cy - 8} textAnchor="middle" fontSize={11} fill="#6B7280">Total</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize={13} fontWeight="bold" fill="#111827">
            {fmt(items.reduce((s, i) => s + i.valor, 0))}
          </text>
        </svg>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 120 }}>
          {segments.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: "#374151" }}>{s.nome}</span>
              <span style={{ color: "#6B7280", fontWeight: 600 }}>{(s.pct * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const s = {
    wrap: { fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#FAFAF8", minHeight: "100vh", color: "#111827" },
    header: { background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 100 },
    main: { maxWidth: 820, margin: "0 auto", padding: "32px 16px 80px" },
    card: { background: "#fff", borderRadius: 18, border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,.05)", padding: 24, marginBottom: 18 },
    label: { fontSize: 13, fontWeight: 600, marginBottom: 10, display: "block" },
    concBtn: (active, color) => ({ border: `2px solid ${active ? color : "#E5E7EB"}`, borderRadius: 14, background: active ? (color === "#F59E0B" ? "#FFFBEB" : "#F0FDF4") : "#fff", padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all .2s", textAlign: "left", width: "100%" }),
    dropzone: (drag, hasFile) => ({ border: `2px ${hasFile ? "solid" : "dashed"} ${hasFile ? "#10B981" : drag ? "#F59E0B" : "#E5E7EB"}`, background: hasFile ? "#F0FDF4" : drag ? "#FFFBEB" : "#fff", borderRadius: 14, padding: "40px 20px", textAlign: "center", cursor: "pointer", transition: "all .2s", marginTop: 18 }),
    btn: { width: "100%", marginTop: 18, background: "linear-gradient(135deg,#F59E0B,#FBBF24)", color: "#fff", border: "none", borderRadius: 14, padding: "15px", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 14px rgba(245,158,11,.3)", fontFamily: "inherit" },
    errBox: { background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 8, fontSize: 13, color: "#B91C1C", marginTop: 12 },
    statsGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 18 },
    statCard: { background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,.05)" },
    aiBox: { background: "linear-gradient(135deg,#FFFBEB,#FEF3C7)", border: "1px solid #FCD34D", borderRadius: 16, padding: 20, marginBottom: 18 },
    solarTip: { background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 10, padding: "10px 14px", marginTop: 10, fontSize: 13, color: "#14532D", display: "flex", gap: 8 },
    chartGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 },
    chartCard: { background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,.05)" },
    itemsCard: { background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.05)", marginBottom: 18 },
    printBtn: { width: "100%", background: "#fff", color: "#111827", border: "2px solid #E5E7EB", borderRadius: 14, padding: "13px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" },
  };

  return (
    <div style={s.wrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { width:18px;height:18px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .fade-up { animation: fadeUp .4s ease; }
        @media print {
          header, #upload-card, #how-section, #print-btn { display: none !important; }
          body { background: #fff; }
        }
        @media (max-width: 580px) {
          .stats-grid { grid-template-columns: 1fr !important; }
          .chart-grid { grid-template-columns: 1fr !important; }
          .conc-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header */}
      <div style={s.header}>
        <div style={{ width: 38, height: 38, background: "linear-gradient(135deg,#F59E0B,#FBBF24)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, boxShadow: "0 2px 8px rgba(245,158,11,.3)" }}>☀️</div>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, letterSpacing: -0.5 }}>InforAnalytics</div>
          <div style={{ fontSize: 11, color: "#9CA3AF" }}>Análise Inteligente de Faturas de Energia</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 20, background: "#FEF3C7", color: "#92400E" }}>Energisa PB</span>
          <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 20, background: "#D1FAE5", color: "#065F46" }}>Neo Energia PE</span>
        </div>
      </div>

      <div style={s.main}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: -1, marginBottom: 8 }}>Entenda sua Fatura de Energia</h2>
          <p style={{ color: "#6B7280", fontSize: 14 }}>Faça o upload da fatura e descubra exatamente o que está sendo cobrado.</p>
        </div>

        {/* Upload Card */}
        <div style={s.card} id="upload-card">
          <span style={s.label}>Concessionária</span>
          <div className="conc-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <button style={s.concBtn(conc === "energisa", "#F59E0B")} onClick={() => setConc("energisa")}>
              <span style={{ fontSize: 20 }}>⚡</span>
              <div><div style={{ fontWeight: 600, fontSize: 14 }}>Energisa</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>Paraíba</div></div>
              {conc === "energisa" && <span style={{ marginLeft: "auto" }}>✅</span>}
            </button>
            <button style={s.concBtn(conc === "neoenergia", "#10B981")} onClick={() => setConc("neoenergia")}>
              <span style={{ fontSize: 20 }}>⚡</span>
              <div><div style={{ fontWeight: 600, fontSize: 14 }}>Neo Energia</div><div style={{ fontSize: 11, color: "#9CA3AF" }}>Pernambuco</div></div>
              {conc === "neoenergia" && <span style={{ marginLeft: "auto" }}>✅</span>}
            </button>
          </div>

          <div style={s.dropzone(dragging, !!file)}
            onClick={() => !file && fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}>
            <input ref={fileRef} type="file" accept=".pdf,image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
            {!file ? (
              <>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Arraste a fatura aqui ou clique para selecionar</div>
                <div style={{ fontSize: 13, color: "#9CA3AF" }}>PDF, JPG, PNG ou WEBP — até 10 MB</div>
              </>
            ) : (
              <>
                {preview ? <img src={preview} alt="preview" style={{ maxHeight: 120, borderRadius: 8, marginBottom: 10, objectFit: "contain" }} /> : <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>}
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8 }}>{(file.size / 1024).toFixed(0)} KB</div>
                <button onClick={e => { e.stopPropagation(); removeFile(); }} style={{ background: "none", border: "none", color: "#EF4444", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✕ Remover</button>
              </>
            )}
          </div>

          {error && <div style={s.errBox}><span>⚠️</span><span>{error}</span></div>}

          <button style={{ ...s.btn, opacity: (!file || loading) ? 0.5 : 1, cursor: (!file || loading) ? "not-allowed" : "pointer" }}
            disabled={!file || loading} onClick={analyze}>
            {loading ? <><div className="spinner" /> Analisando fatura...</> : <><span>📊</span> Analisar Fatura</>}
          </button>
        </div>

        {/* How it works */}
        {!result && !loading && (
          <div id="how-section" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
            {[
              { icon: "📤", title: "1. Faça o upload", desc: "Selecione a fatura em PDF ou foto da conta." },
              { icon: "⚡", title: "2. IA analisa", desc: "Claude identifica cada item da cobrança." },
              { icon: "📈", title: "3. Veja os gráficos", desc: "Entenda visualmente o que pesa mais." },
            ].map((c, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
                <div style={{ width: 44, height: 44, background: "#FEF3C7", borderRadius: 12, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{c.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, fontFamily: "'Syne',sans-serif" }}>{c.title}</div>
                <div style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.5 }}>{c.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {result && (
          <div id="results" className="fade-up" ref={resultsRef}>
            <div className="stats-grid" style={s.statsGrid}>
              <div style={s.statCard}>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 6 }}>Total da Fatura</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800, color: "#EF4444", letterSpacing: -1 }}>{fmt(result.total_fatura)}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{result.mes_referencia}</div>
              </div>
              <div style={s.statCard}>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 6 }}>Consumo</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800, color: "#3B82F6", letterSpacing: -1 }}>{result.consumo_kwh} kWh</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{result.consumo_kwh > 0 ? `R$ ${(result.total_fatura / result.consumo_kwh).toFixed(2).replace(".", ",")}/kWh médio` : ""}</div>
              </div>
              <div style={s.statCard}>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 6 }}>Concessionária</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: "#111827", letterSpacing: -0.5 }}>{result.concessionaria}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{result.cliente}</div>
              </div>
            </div>

            <div style={s.aiBox}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span>☀️</span>
                <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "'Syne',sans-serif" }}>Análise do Assistente</span>
              </div>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7 }}>{result.resumo}</p>
              {result.economia_solar && <div style={s.solarTip}><span>📉</span><span>{result.economia_solar}</span></div>}
            </div>

            {result.alertas?.length > 0 && (
              <div style={s.card}>
                <span style={s.label}>⚠️ Alertas Identificados</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {result.alertas.map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#374151" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B", flexShrink: 0, marginTop: 5 }} />
                      {a}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="chart-grid" style={s.chartGrid}>
              <div style={s.chartCard}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, fontFamily: "'Syne',sans-serif" }}>Distribuição dos Itens</div>
                <DonutChart items={result.itens} />
              </div>
              <div style={s.chartCard}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, fontFamily: "'Syne',sans-serif" }}>Valor por Item (R$)</div>
                <BarChart items={result.itens} />
              </div>
            </div>

            <div style={s.itemsCard}>
              <div style={{ padding: "16px 22px", borderBottom: "1px solid #E5E7EB" }}>
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15 }}>Detalhamento dos Itens</span>
              </div>
              {result.itens.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 22px", borderBottom: i < result.itens.length - 1 ? "1px solid #F9FAFB" : "none" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{item.nome}</div>
                    {item.descricao && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{item.descricao}</div>}
                  </div>
                  {item.percentual !== undefined && <span style={{ fontSize: 11, color: "#9CA3AF", background: "#F3F4F6", padding: "2px 8px", borderRadius: 20 }}>{Number(item.percentual).toFixed(1)}%</span>}
                  <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: item.valor < 0 ? "#10B981" : "#111827" }}>
                    {item.valor < 0 ? "- " : ""}{fmt(Math.abs(item.valor))}
                  </span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 22px", background: "#F9FAFB", borderTop: "1px solid #E5E7EB" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Total</span>
                <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: "#EF4444" }}>{fmt(result.total_fatura)}</span>
              </div>
            </div>

            <button id="print-btn" style={s.printBtn} onClick={() => window.print()}>
              🖨️ Gerar PDF / Imprimir Relatório
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
