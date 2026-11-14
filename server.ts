import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/ai/rewrite', async (req, res) => {
    const mode = typeof req.body?.mode === 'string' ? req.body.mode : 'explain';
    const deterministicText =
      typeof req.body?.deterministicText === 'string' ? req.body.deterministicText.trim() : '';
    const contextSummary =
      typeof req.body?.contextSummary === 'string' ? req.body.contextSummary.trim() : '';

    if (!deterministicText) {
      res.status(400).json({
        ok: false,
        error: 'Texto base do motor determinístico é obrigatório.',
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.json({
        ok: true,
        usedAi: false,
        originLabel:
          'Origem: motor de regras determinístico (chave de IA não configurada — texto preservado do motor)',
        text: deterministicText,
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction =
        mode === 'justification'
          ? 'Você é um redator técnico de farmácia hospitalar no Brasil. Reescreva em português do Brasil claro, direto e objetivo (2 a 3 frases) a justificativa de uma solicitação de compra usando EXCLUSIVAMENTE os fatos e números fornecidos. Nunca invente ou altere quantidades, preços, prazos ou nomes de fornecedores.'
          : 'Você é um assistente de comunicação para compradores de farmácia no Brasil. Reescreva em linguagem simples, clara e humana (máximo de 4 frases) a explicação já calculada pelo motor de regras. Você NÃO calcula quantidades nem escolhe fornecedor: apenas traduz fielmente os números e fatos recebidos.';

      const prompt = [
        `Texto do motor de regras:\n${deterministicText}`,
        contextSummary ? `Dados conferidos pelo motor:\n${contextSummary}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
        },
      });

      const rewritten = response.text?.trim();
      if (!rewritten) {
        res.json({
          ok: true,
          usedAi: false,
          originLabel: 'Origem: motor de regras determinístico (retorno vazio da IA)',
          text: deterministicText,
        });
        return;
      }

      res.json({
        ok: true,
        usedAi: true,
        originLabel: 'Origem: reescrita assistida por IA (números do motor de regras)',
        text: rewritten,
      });
    } catch {
      res.json({
        ok: true,
        usedAi: false,
        originLabel:
          'Origem: motor de regras determinístico (falha na consulta de IA — texto original mantido)',
        text: deterministicText,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cofre server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
