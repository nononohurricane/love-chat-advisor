import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';

const app = express();
const port = Number(process.env.PORT || 3001);
const baseURL = normalizeBaseURL(process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || undefined);
const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || 'EMPTY';
const model = process.env.LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const useJsonResponseFormat = process.env.LLM_RESPONSE_FORMAT !== 'none';
const requestTimeoutMs = Number(process.env.LLM_TIMEOUT_MS || 60000);
const temperature = process.env.LLM_TEMPERATURE ? Number(process.env.LLM_TEMPERATURE) : undefined;

app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || '20mb' }));

const client = new OpenAI({
  apiKey,
  baseURL,
  timeout: requestTimeoutMs
});

function normalizeBaseURL(value) {
  if (!value) return undefined;
  return value.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
}

const systemPrompt = `你是一个恋爱沟通分析助手，帮助用户分析男女恋爱、暧昧、关系磨合中的线上聊天。

要求：
1. 用中文回答。
2. 温和、尊重、真诚，不制造焦虑，不鼓励操控、PUA、欺骗、冷暴力或越界追踪。
3. 如果出现强冲突、威胁、自伤、骚扰、跟踪、暴力等风险，优先建议降温、尊重边界、寻求现实支持。
4. 不要把对方心理说死，要用“可能”“倾向于”“需要更多上下文”这类谨慎表达。
5. 输出必须是 JSON，不要 Markdown，不要代码块。
6. 如果用户上传聊天截图，请先识别截图里的聊天内容、说话顺序、气泡位置和情绪语气，再结合用户输入的补充文字一起分析。

JSON 结构：
{
  "overview": "一句话总览，判断当前聊天氛围和核心问题",
  "process": ["分析步骤1", "分析步骤2", "分析步骤3"],
  "signals": ["识别到的关系/情绪信号"],
  "suggestions": ["具体沟通建议"],
  "replyTemplates": ["可直接参考发送的回复模板"],
  "risk": ["注意事项和边界提醒"]
}`;

function normalizeAnalysis(value) {
  const fallback = ['信息不足，建议补充双方关系阶段、上下文和你希望达成的目标。'];

  return {
    overview: typeof value?.overview === 'string' && value.overview.trim()
      ? value.overview.trim()
      : '已完成聊天分析，但模型返回的信息不完整。',
    process: normalizeStringArray(value?.process, fallback),
    signals: normalizeStringArray(value?.signals, fallback),
    suggestions: normalizeStringArray(value?.suggestions, fallback),
    replyTemplates: normalizeStringArray(value?.replyTemplates, ['可以先用温和、尊重边界的方式继续沟通。']),
    risk: normalizeStringArray(value?.risk, ['本工具只提供沟通建议，不能代替真实沟通、心理咨询或关系决策。'])
  };
}

function normalizeStringArray(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => String(item || '').trim()).filter(Boolean);
  return items.length ? items : fallback;
}

function normalizeImages(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((image) => ({
      dataUrl: String(image?.dataUrl || '').trim(),
      name: String(image?.name || '聊天截图').trim()
    }))
    .filter((image) => /^data:image\/(png|jpe?g|webp);base64,/i.test(image.dataUrl));
}

function buildUserContent(chat, images) {
  const content = [
    {
      type: 'text',
      text: `请分析下面的恋爱线上聊天，并给出指导。\n\n补充文字：\n${chat || '用户没有输入补充文字，请主要分析截图内容。'}`
    }
  ];

  images.forEach((image, index) => {
    content.push({
      type: 'text',
      text: `聊天截图 ${index + 1}：${image.name}`
    });
    content.push({
      type: 'image_url',
      image_url: {
        url: image.dataUrl
      }
    });
  });

  return content;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, model, baseURL: baseURL || 'https://api.openai.com/v1' });
});

app.post('/api/analyze', async (req, res) => {
  try {
    const chat = String(req.body?.chat || '').trim();
    const images = normalizeImages(req.body?.images);

    if (!chat && images.length === 0) {
      return res.status(400).json({ error: '请至少输入聊天文字或上传一张聊天截图。' });
    }

    if (chat.length > 12000) {
      return res.status(400).json({ error: '聊天文字过长，请控制在 12000 字以内。' });
    }

    if (images.length > 6) {
      return res.status(400).json({ error: '聊天截图最多上传 6 张。' });
    }

    if (!apiKey) {
      return res.status(500).json({ error: '服务端未配置 LLM_API_KEY。' });
    }

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildUserContent(chat, images) }
      ]
    };

    if (Number.isFinite(temperature)) {
      requestBody.temperature = temperature;
    }

    if (useJsonResponseFormat) {
      requestBody.response_format = { type: 'json_object' };
    }

    console.log('Sending analysis request:', {
      baseURL: baseURL || 'https://api.openai.com/v1',
      model,
      responseFormat: useJsonResponseFormat ? 'json_object' : 'none',
      temperature: Number.isFinite(temperature) ? temperature : 'default',
      images: images.length
    });

    const completion = await client.chat.completions.create(requestBody);

    const content = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    res.json(normalizeAnalysis(parsed));
  } catch (error) {
    console.error('Analyze failed:', error);
    res.status(500).json({
      error: error?.message || '大模型分析失败，请稍后重试。'
    });
  }
});

app.listen(port, () => {
  console.log(`Love chat advisor API server listening on http://localhost:${port}`);
});
