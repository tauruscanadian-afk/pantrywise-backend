// Existing imports and setup remain the same...
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.post('/create-checkout', async (req, res) => {
  // 1. Get the priceId sent from the frontend
  const { priceId } = req.body;

  // 2. Map the incoming priceId to your Stripe Price IDs
  let stripePriceId;
  if (priceId === 'price_5_recipes') {
    stripePriceId = process.env.STRIPE_PRICE_5;
  } else if (priceId === 'price_10_recipes') {
    stripePriceId = process.env.STRIPE_PRICE_10;
  } else {
    return res.status(400).json({ error: 'Invalid price ID' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: stripePriceId, // Use the specific Price ID
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/?payment_success=1`,
      cancel_url: `${process.env.FRONTEND_URL}/`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
