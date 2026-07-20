/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-loaded Gemini Client Pattern
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required but missing.');
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// 1. API: Custom AI Diet Plan Generator in Turkish
app.post('/api/diet-plan', async (req, res) => {
  try {
    const { profile, preference, allergies, dislikedFoods } = req.body;

    if (!profile) {
      return res.status(400).json({ success: false, error: 'Profil bilgileri eksik.' });
    }

    const ai = getGeminiClient();

    // Construct detailed medical-friendly dietician prompt
    const prompt = `Sen profesyonel bir Türk diyetisyensin (nutritionist). Kullanıcı detaylarına göre 1 günlük, detaylı, sağlıklı ve uygulanabilir bir diyet planı oluştur.
Kullanıcı Detayları:
- Yaş: ${profile.age}
- Cinsiyet: ${profile.gender === 'male' ? 'Erkek' : profile.gender === 'female' ? 'Kadın' : 'Diğer'}
- Boy: ${profile.height} cm
- Kilo: ${profile.weight} kg
- Fiziksel Aktivite Seviyesi: ${profile.activityLevel}
- Hedef: ${profile.weightGoal === 'lose' ? 'Kilo Verme' : profile.weightGoal === 'gain' ? 'Kilo Alma' : 'Kilo Koruma'}
- Hedeflenen Günlük Kalori Alımı: ${profile.dailyCalorieTarget || 2000} kcal

Özel Tercihler:
- Diyet Tarzı: ${preference || 'Hepsi'} (all ise genel Türk mutfağına uygun)
- Alerjiler: ${allergies || 'Yok'}
- Tüketilmeyen / Sevilmeyen Gıdalar: ${dislikedFoods || 'Yok'}

Senden ricamız:
1. 'description' alanında kullanıcının hedeflerini özetle ve ona özel bu diyetin faydalarını Türkçe olarak açıkla.
2. 'meals' alanına en az 3 veya 4 öğün ekle (Kahvaltı, Öğle Yemeği, Ara Öğün, Akşam Yemeği). Her öğünün 'name' (örn: 'Kahvaltı (08:30)', 'Akşam Yemeği (19:00)') ve 'food' (içerik detayları, porsiyon bilgileri Türkçe olsun) değerleri olsun. Ve her öğünün yaklaşık kalori miktarını ('calories') tam sayı olarak hesapla.
3. 'tips' alanına bu diyeti uygularken dikkat etmesi gereken 3 adet pratik, sağlıklı Türkçe ipucu ekle.

Lütfen tam bir JSON döndür.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        systemInstruction: 'Sen kullanıcı sağlığına, alerjilerine ve hedeflerine önem veren uzman bir diyetisyensin. Sadece belirtilen JSON şemasına tam uyacak şekilde Türkçe dilinde yanıt verirsin.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: {
              type: Type.STRING,
              description: 'Diyet planının kısa, motive edici ve faydalı Türkçe açıklaması.',
            },
            meals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: 'Öğünün ismi ve saati (örn: Kahvaltı (08:30))' },
                  food: { type: Type.STRING, description: 'Yenilecek yemeklerin detaylı Türkçe listesi ve porsiyonları.' },
                  calories: { type: Type.INTEGER, description: 'Bu öğünden alınacak yaklaşık kalori.' },
                },
                required: ['name', 'food', 'calories'],
              },
            },
            tips: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Bu planı uygularken yapılacak faydalı öneriler.',
            },
          },
          required: ['description', 'meals', 'tips'],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini modelinden yanıt alınamadı.');
    }

    const planData = JSON.parse(text.trim());
    res.json({ success: true, plan: planData });
  } catch (err: any) {
    console.error('Gemini error:', err);
    res.status(500).json({ success: false, error: err.message || 'Diyet planı oluşturulurken hata oluştu.' });
  }
});

// 2. Vite Integration for Dev, static serving for Prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FitTakip server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
  });
}

startServer();
