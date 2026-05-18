import express from 'express';
import Stripe from 'stripe';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Endpoint to create Stripe Checkout session with dynamic price ID
app.post('/create-checkout', async (req, res) => {
  const { priceId } = req.body;

  // Map frontend price identifiers to Stripe Price IDs from environment
  let stripePriceId;
  if (priceId === 'price_5_recipes') {
    stripePriceId = process.env.STRIPE_PRICE_5;
  } else if (priceId === 'price_10_recipes') {
    stripePriceId = process.env.STRIPE_PRICE_10;
  } else {
    return res.status(400).json({ error: 'Invalid price ID' });
  }

  if (!stripePriceId) {
    return res.status(500).json({ error: 'Price ID not configured on server' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: stripePriceId,
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/?payment_success=1`,
      cancel_url: `${process.env.FRONTEND_URL}/`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Scan ingredients using GPT-4 Vision
app.post('/api/scan', async (req, res) => {
  const { images } = req.body;
  if (!images || !images.length) return res.status(400).json({ error: 'No images' });

  try {
    const content = [{ type: "text", text: "Identify visible food ingredients. Return comma‑separated list. No extra text." }];
    for (const base64 of images) {
      content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "low" } });
    }
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content }],
      max_tokens: 300,
      temperature: 0.2,
    });
    const raw = response.choices[0].message.content;
    const ingredients = raw.split(',').map(i => i.trim().toLowerCase()).filter(i => i);
    res.json({ ingredients });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Vision scan failed' });
  }
});

// Generate recipes using GPT-3.5-turbo
app.post('/api/recipes', async (req, res) => {
  const { ingredients } = req.body;
  if (!ingredients || !ingredients.length) return res.status(400).json({ error: 'No ingredients' });

  const prompt = `Using these ingredients: ${ingredients.join(', ')}. Suggest 5 family‑friendly dinner recipes. Return JSON array with objects: { name, cookTime, kidRating (1-5), missingItems, leftoverTip }. No extra text.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "system", content: "You are a helpful recipe assistant. Output valid JSON only." }, { role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1200,
    });
    let jsonText = response.choices[0].message.content;
    const match = jsonText.match(/\[[\s\S]*\]/);
    if (match) jsonText = match[0];
    const recipes = JSON.parse(jsonText);
    res.json({ recipes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Recipe generation failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
