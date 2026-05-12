export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { fileBase64, mimeType, concessionaria } = JSON.parse(event.body);

    const prompt = `Você é um especialista em faturas de energia elétrica brasileira, especialmente das concessionárias Energisa (Paraíba) e Neo Energia (Pernambuco).
Analise esta fatura da ${concessionaria} e retorne APENAS um JSON válido, sem texto adicional, no seguinte formato:
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
  "economia_solar": "texto sobre potencial de economia com energia solar",
  "resumo": "parágrafo resumindo o que foi encontrado na fatura e principais pontos de atenção"
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: fileBase64 } }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `Erro ${response.status}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ text }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
