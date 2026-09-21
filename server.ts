import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { db, getDb } from './src/db/index.ts';
import { requests, users } from './src/db/schema.ts';
import { getOrCreateUser } from './src/db/users.ts';
import { eq } from 'drizzle-orm';
import { GoogleGenAI, Type } from '@google/genai';
import { classifyRequestTopicsHeuristic } from './services/geminiService.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // In-memory server requests store for online sync & Service Worker caching
  const serverRequestsStore: any[] = [];

  app.get(['/api/requests', '/api/my-requests'], (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.setHeader('X-Served-By', 'Express-Server');
    return res.json(serverRequestsStore);
  });

  app.post('/api/requests', (req, res) => {
    const data = req.body;
    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item?.id) continue;
        const existingIdx = serverRequestsStore.findIndex((r) => r.id === item.id);
        if (existingIdx >= 0) {
          serverRequestsStore[existingIdx] = item;
        } else {
          serverRequestsStore.unshift(item);
        }
      }
      return res.json({ success: true, count: serverRequestsStore.length });
    } else if (data && data.id) {
      const existingIdx = serverRequestsStore.findIndex((r) => r.id === data.id);
      if (existingIdx >= 0) {
        serverRequestsStore[existingIdx] = data;
      } else {
        serverRequestsStore.unshift(data);
      }
      return res.json({ success: true, item: data });
    }
    return res.status(400).json({ error: 'Invalid request payload' });
  });

  app.post('/api/requests/sync', (req, res) => {
    const { requests = [] } = req.body || {};
    if (Array.isArray(requests)) {
      for (const item of requests) {
        if (!item?.id) continue;
        const existingIdx = serverRequestsStore.findIndex((r) => r.id === item.id);
        const syncedItem = { ...item, syncStatus: 'synced', isPendingSync: false };
        if (existingIdx >= 0) {
          serverRequestsStore[existingIdx] = syncedItem;
        } else {
          serverRequestsStore.unshift(syncedItem);
        }
      }
    }
    return res.json({ success: true, syncedCount: requests.length });
  });

  // Server-side cache for AI calls
  const serverAutoTagCache = new Map<string, { result: any; timestamp: number }>();
  const serverPolishCache = new Map<string, { result: string; timestamp: number }>();
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 mins

  // AI Auto-tagging endpoint
  app.post('/api/gemini/auto-tag', async (req, res) => {
    const { title, reason, category, details } = req.body || {};
    const cleanTitle = (title || '').trim();
    const cleanReason = (reason || '').trim();

    const cacheKey = `${cleanTitle}:::${category}:::${cleanReason}:::${JSON.stringify(details || {})}`;
    const cached = serverAutoTagCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json(cached.result);
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

      if (!apiKey || (!cleanTitle && !cleanReason)) {
        const heuristic = classifyRequestTopicsHeuristic(cleanTitle, cleanReason, category, details);
        serverAutoTagCache.set(cacheKey, { result: heuristic, timestamp: Date.now() });
        return res.json(heuristic);
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const detailsStr = details ? JSON.stringify(details) : '';
      const textToAnalyze = `หัวข้อ: ${cleanTitle}\nหมวดหมู่: ${category || ''}\nเหตุผลความจำเป็น: ${cleanReason}\nรายละเอียดเพิ่มเติม: ${detailsStr}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: `วิเคราะห์เนื้อหาคำร้องต่อไปนี้ และจัดหมวดหมู่แท็กหัวข้อ (Topics) ที่เกี่ยวข้องโดยอัตโนมัติ:\n\n${textToAnalyze}`,
        config: {
          systemInstruction: `คุณคือระบบ AI อัจฉริยะวิเคราะห์และติดแท็กหมวดหมู่คำร้อง (Auto-tagging Classification System) สำหรับระบบ CCTV และบริการภาครัฐ
หน้าที่ของคุณคืออ่านหัวข้อคำร้องและเหตุผล แล้วจัดหมวดหมู่ลงในหัวข้อต่อไปนี้ (ตอบเลือกมา 1 ถึง 3 หัวข้อที่ตรงที่สุด):
- 'Maintenance' (กรณีแจ้งซ่อมแซม/บำรุงรักษากล้องวงจรปิด, กล้องเสีย, ภาพดับ, กล้องหมุนไม่ได้, ตรวจสอบอุปกรณ์)
- 'Access Request' (กรณีขอดูภาพ, ขอคัดสำเนาไฟล์ CCTV, ขอดาวน์โหลดวิดีโอ, ขอสิทธิ์เข้าถึง)
- 'Privacy Concern' (กรณีข้อกังวลเรื่องความเป็นส่วนตัว, PDPA, ละเมิดสิทธิ์, ขอให้ลบภาพ, บันทึกภาพในพื้นที่ส่วนบุคคล)
- 'Traffic & Safety' (กรณีอุบัติเหตุจราจร, รถชน, ขับรถประมาท, จราจรติดขัด, ปลอดภัยสาธารณะ, ติดตามคนหาย)
- 'Property Damage / Theft' (กรณีทรัพย์สินสูญหาย, ถูกลักทรัพย์, งัดแงะ, ทำลายทรัพย์สิน, รถโดนกรีด)
- 'General Inquiry' (กรณีสอบถามข้อมูลทั่วไป, ขอความช่วยเหลือทั่วไป)

จงส่งคืนผลลัพธ์เป็นโครงสร้าง JSON พร้อมระบุ primaryTopic, รายการ topics ทั้งหมด, ค่าความเชื่อมั่น (confidence 0.0 - 1.0) และคำอธิบายสั้นๆ (reasoning) ภาษาไทย`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topics: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'รายการแท็กหัวข้อที่เกี่ยวข้อง'
              },
              primaryTopic: {
                type: Type.STRING,
                description: 'หัวข้อหลักที่ตรงที่สุด'
              },
              confidence: {
                type: Type.NUMBER,
                description: 'ความเชื่อมั่นของ AI ตั้งแต่ 0.0 ถึง 1.0'
              },
              reasoning: {
                type: Type.STRING,
                description: 'เหตุผลกระชับภาษาไทยว่าทำไมถึงจัดในหมวดหมู่นี้'
              }
            },
            required: ['topics', 'primaryTopic', 'confidence', 'reasoning']
          }
        }
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      if (parsed.topics && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
        serverAutoTagCache.set(cacheKey, { result: parsed, timestamp: Date.now() });
        return res.json(parsed);
      }
    } catch (error: any) {
      console.warn('Gemini auto-tagging rate limit or network warning, falling back to heuristic:', error?.message || error);
    }

    const heuristic = classifyRequestTopicsHeuristic(cleanTitle, cleanReason, category, details);
    serverAutoTagCache.set(cacheKey, { result: heuristic, timestamp: Date.now() });
    res.json(heuristic);
  });

  // AI Text Polish endpoint (handling both /api/gemini/polish and /api/polish)
  const handlePolishRequest = async (req: express.Request, res: express.Response) => {
    const { originalText, text, categoryTitle } = req.body || {};
    const input = (originalText || text || '').trim();

    if (!input) {
      return res.json({ polishedText: '' });
    }

    const cacheKey = `${categoryTitle}:::${input}`;
    const cached = serverPolishCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json({ polishedText: cached.result });
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

      if (!apiKey) {
        const fallback = polishThaiTextLocally(input, categoryTitle);
        serverPolishCache.set(cacheKey, { result: fallback, timestamp: Date.now() });
        return res.json({ polishedText: fallback });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });

      const prompt = `คุณคือผู้เชี่ยวชาญด้านงานสารบรรณและการเขียนหนังสือราชการและเอกสารทางการขององค์กรในประเทศไทย 
โปรดปรับเปลี่ยนข้อความต่อไปนี้ให้อยู่ในรูปแบบภาษาทางการที่สละสลวย ถูกต้องตามระเบียบงานสารบรรณ เหมาะสำหรับใส่ในช่อง "เหตุผลความจำเป็นในการยื่นคำร้อง" ของคำร้องประเภท "${categoryTitle || 'คำร้องทั่วไป'}"

ข้อความดั้งเดิม:
"${input}"

คำสั่ง:
1. ปรับข้อความให้กระชับ เป็นทางการ สุภาพ ถูกหลักภาษาไทย
2. ห้ามแต่งเติมข้อมูลเท็จลงไป ให้คงใจความสำคัญเดิมไว้ทั้งหมด
3. ตอบเฉพาะข้อความภาษาทางการที่ปรับแต่งแล้วเท่านั้น ไม่ต้องมีคำเกริ่นหรือเครื่องหมายคำพูดล้อมรอบ`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
      });

      const polished = response.text?.trim() || input;
      serverPolishCache.set(cacheKey, { result: polished, timestamp: Date.now() });
      return res.json({ polishedText: polished });
    } catch (error: any) {
      console.warn('Gemini polish request warning, falling back to smart local rules:', error?.message || error);
      const fallback = polishThaiTextLocally(input, categoryTitle);
      serverPolishCache.set(cacheKey, { result: fallback, timestamp: Date.now() });
      return res.json({ polishedText: fallback });
    }
  };

  function polishThaiTextLocally(text: string, category: string): string {
    let clean = (text || '').trim();
    if (!clean) return '';
    if (!clean.startsWith('มีความจำเป็นต้อง') && !clean.startsWith('เนื่องด้วย') && !clean.startsWith('มีความประสงค์')) {
      clean = `มีความประสงค์ขอ${category || 'รับบริการ'} เนื่องจาก${clean}`;
    }
    if (!clean.endsWith('เพื่อดำเนินการต่อไป') && !clean.endsWith('โปรดพิจารณาอนุมัติ')) {
      clean += ' เพื่อใช้เป็นหลักฐานประกอบการดำเนินการตามขั้นตอนต่อไป จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติ';
    }
    return clean;
  }

  app.post('/api/gemini/polish', handlePolishRequest);
  app.post('/api/polish', handlePolishRequest);

  // Gemini Multi-turn Chat Endpoint with optional Google Maps Grounding
  app.post('/api/gemini/chat', async (req: express.Request, res: express.Response) => {
    try {
      const {
        messages = [],
        model = 'gemini-3.5-flash',
        useMapsGrounding = false,
        userLocation = { latitude: 15.8066, longitude: 102.0315 }
      } = req.body || {};

      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on server',
          fallbackText: 'ขออภัย ขณะนี้ระบบยังไม่ได้ตั้งค่า API Key หากต้องการยื่นคำร้องขอดูภาพ CCTV ท่านสามารถเตรียมใบแจ้งความจาก สภ.เมืองชัยภูมิ และสำเนาบัตรประชาชนเพื่อยื่นผ่านระบบได้ทันที'
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' }
        }
      });

      const systemInstruction = `คุณคือ "ผู้ช่วยอัจฉริยะ CCTV เทศบาลเมืองชัยภูมิ" (Smart CCTV Assistant) ให้คำแนะนำแก่ประชาชนและเจ้าหน้าที่อย่างเป็นมิตร สุภาพ ถูกต้อง และกระชับ:
1. การขอดูภาพหรือขอสำเนาวิดีโอจากกล้องวงจรปิด CCTV เทศบาลเมืองชัยภูมิ
2. เอกสารที่จำเป็น:
   - บันทึกประจำวันหรือใบแจ้งความจาก สภ.เมืองชัยภูมิ (ระบุวัน เวลา สถานที่เกิดเหตุชัดเจน)
   - สำเนาบัตรประจำตัวประชาชน พร้อมรับรองสำเนาถูกต้อง
   - หนังสือมอบอำนาจ (กรณีให้ผู้อื่นดำเนินการแทน)
   - เอกสารประกอบ เช่น ภาพถ่ายความเสียหาย สำเนาทะเบียนรถ หรือเอกสารบริษัทประกัน
3. สถานที่สำคัญและพิกัดในเขตเทศบาลเมืองชัยภูมิ:
   - วงเวียนอนุสาวรีย์เจ้าพ่อพญาแล (ศูนย์กลางเมือง)
   - สภ.เมืองชัยภูมิ (ถนนบรรณาการ ใกล้ศาลากลาง)
   - สำนักงานเทศบาลเมืองชัยภูมิ
   - โรงพยาบาลชัยภูมิ
   - ห้าแยกโนนไฮ, แยกหนองบัว, แยกโรงเรียนเมืองพญาแล
4. ระยะเวลาจัดเก็บข้อมูลภาพ: กล้องวงจรปิดเทศบาลบันทึกย้อนหลังเฉลี่ย 15-30 วัน ขึ้นอยู่กับความจุของ NVR/DVR จึงแนะนำให้ยื่นคำร้องโดยเร็วที่สุด
5. กฎหมายคุ้มครองข้อมูลส่วนบุคคล (PDPA): คุ้มครองความเป็นส่วนตัว ไม่เผยแพร่ภาพบุคคลอื่นโดยไม่มีเหตุอันควรตามกฎหมาย`;

      // If Google Maps Grounding is requested (or needed for location search)
      if (useMapsGrounding) {
        const lastUserMsg = Array.isArray(messages) && messages.length > 0
          ? messages[messages.length - 1].content || messages[messages.length - 1].text || ''
          : 'จุดติดตั้งกล้อง CCTV และสถานที่สำคัญใกล้เคียงในเทศบาลเมืองชัยภูมิ';

        const lat = Number(userLocation?.latitude) || 15.8066;
        const lng = Number(userLocation?.longitude) || 102.0315;

        const mapsConfig: any = {
          systemInstruction,
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: {
                latitude: lat,
                longitude: lng
              }
            }
          }
        };

        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: lastUserMsg,
          config: mapsConfig
        });

        const responseText = response.text || '';
        const groundingChunks = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || []) as any[];

        const places: Array<{ title: string; uri: string; address?: string }> = [];
        for (const chunk of groundingChunks) {
          if (chunk.maps?.uri) {
            places.push({
              title: chunk.maps.title || 'ดูตำแหน่งบน Google Maps',
              uri: chunk.maps.uri,
              address: chunk.maps.address || ''
            });
          } else if (chunk.web?.uri) {
            places.push({
              title: chunk.web.title || 'แหล่งข้อมูลอ้างอิง',
              uri: chunk.web.uri
            });
          }
        }

        return res.json({
          role: 'model',
          text: responseText,
          places,
          modelUsed: 'gemini-3.5-flash (Google Maps Grounded)',
          groundingMetadata: response.candidates?.[0]?.groundingMetadata
        });
      }

      // Standard multi-turn chat
      const allowedModels = ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
      const targetModel = allowedModels.includes(model) ? model : 'gemini-3.5-flash';

      const formattedContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
      if (Array.isArray(messages)) {
        for (const m of messages) {
          const text = (m.content || m.text || '').trim();
          if (text) {
            formattedContents.push({
              role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text }]
            });
          }
        }
      }

      if (formattedContents.length === 0) {
        formattedContents.push({
          role: 'user',
          parts: [{ text: 'สวัสดีครับ ขอสอบถามขั้นตอนการขอดูภาพกล้องวงจรปิด CCTV' }]
        });
      }

      const response = await ai.models.generateContent({
        model: targetModel,
        contents: formattedContents,
        config: {
          systemInstruction
        }
      });

      return res.json({
        role: 'model',
        text: response.text || '',
        modelUsed: targetModel
      });
    } catch (error: any) {
      console.error('Error in /api/gemini/chat:', error);
      return res.status(500).json({
        error: error.message || 'เกิดข้อผิดพลาดในการประมวลผล',
        fallbackText: 'ขออภัย ระบบตอบกลับอัตโนมัติขัดข้องชั่วคราว หากท่านมีข้อสงสัยเรื่องคำร้อง CCTV สามารถตรวจสอบในแท็บ "คู่มือ & FAQ" หรือโทรสอบถามงานเทศกิจ เทศบาลเมืองชัยภูมิ'
      });
    }
  });

  // Gemini Image Generation and Editing Endpoint
  app.post('/api/gemini/image-action', async (req: express.Request, res: express.Response) => {
    try {
      const {
        action = 'generate',
        prompt,
        base64Image,
        mimeType = 'image/png',
        aspectRatio = '1:1'
      } = req.body || {};

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'กรุณาระบุคำสั่งข้อความ (Prompt) สำหรับสร้างหรือแก้ไขภาพ' });
      }

      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on server' });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' }
        }
      });

      // Edit existing image
      if (action === 'edit' && base64Image) {
        const cleanBase64 = base64Image.replace(/^data:[^;]+;base64,/, '');

        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-image',
          contents: {
            parts: [
              {
                inlineData: {
                  data: cleanBase64,
                  mimeType: mimeType || 'image/png'
                }
              },
              {
                text: `แก้ไขภาพจำลอง/แผนผังนี้ตามคำสั่ง: ${prompt} โดยคงความเป็นแผนผังจำลองจุดเกิดเหตุหรือหลักฐานกล้องวงจรปิดอย่างชัดเจน`
              }
            ]
          }
        });

        let generatedImageUrl: string | null = null;
        let responseText = '';
        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData?.data) {
              generatedImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            } else if (part.text) {
              responseText += part.text;
            }
          }
        }

        if (!generatedImageUrl) {
          return res.status(500).json({
            error: 'โมเดลไม่สามารถสร้างภาพที่แก้ไขได้ กรุณาลองปรับคำสั่ง Prompt ใหม่',
            text: responseText || response.text
          });
        }

        return res.json({
          success: true,
          action: 'edit',
          imageUrl: generatedImageUrl,
          text: responseText
        });
      }

      // Generate new diagram / incident scene mockup
      const validAspectRatios = ['1:1', '3:4', '4:3', '9:16', '16:9'];
      const ratio = validAspectRatios.includes(aspectRatio) ? aspectRatio : '1:1';

      const enrichedPrompt = `Clear architectural technical diagram, incident scene blueprint, and CCTV surveillance perspective: ${prompt}. Clean top-down view or clear angle showing roadway, intersection markings, traffic lanes, vehicle positioning, and CCTV camera location pins. Crisp technical illustration, high contrast, clean vector style.`;

      const imgConfig: any = {
        imageConfig: {
          aspectRatio: ratio,
          imageSize: '1K'
        }
      };

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: {
          parts: [{ text: enrichedPrompt }]
        },
        config: imgConfig
      });

      let generatedImageUrl: string | null = null;
      let responseText = '';
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            generatedImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          } else if (part.text) {
            responseText += part.text;
          }
        }
      }

      if (!generatedImageUrl) {
        return res.status(500).json({
          error: 'โมเดลไม่ได้ส่งรูปภาพกลับมา กรุณาลองใหม่อีกครั้ง',
          text: responseText || response.text
        });
      }

      return res.json({
        success: true,
        action: 'generate',
        imageUrl: generatedImageUrl,
        text: responseText
      });
    } catch (error: any) {
      console.error('Error in /api/gemini/image-action:', error);
      return res.status(500).json({
        error: error.message || 'เกิดข้อผิดพลาดในการสร้างหรือแก้ไขภาพด้วย Gemini'
      });
    }
  });

  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user) {
        const user = await getOrCreateUser(req.user.uid, req.user.email || '');
        res.json({ user });
      } else {
        res.status(401).json({ error: 'No user' });
      }
    } catch (error: any) {
      console.error('Error syncing user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/requests', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user) {
        const database = getDb();
        if (!database) {
          return res.json({ requests: [] });
        }
        const userRec = await database.select().from(users).where(eq(users.uid, req.user.uid));
        if (userRec && userRec.length > 0) {
          const result = await database.select().from(requests).where(eq(requests.userId, userRec[0].id));
          res.json({ requests: result });
        } else {
          res.json({ requests: [] });
        }
      } else {
        res.status(401).json({ error: 'No user' });
      }
    } catch (error: any) {
      console.error('Database query failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
