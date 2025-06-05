import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// In-memory storage for assessment history
const assessmentHistory = {};

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'sleeek-assessment-server',
    version: '2.0.0'
  });
});

// Main assessment endpoint
app.post('/assess', async (req, res) => {
  console.log(`[${new Date().toISOString()}] Assessment request for ${req.body.roomType}`);
  
  try {
    const { imageBase64, roomType, shootId, stackIndex, currentAngle } = req.body;

    if (!imageBase64 || !roomType || !shootId) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'imageBase64, roomType, and shootId are required'
      });
    }

    // Initialize history for this shoot/room if needed
    const historyKey = `${shootId}-${roomType}`;
    if (!assessmentHistory[historyKey]) {
      assessmentHistory[historyKey] = {
        attempts: 0,
        constraints: [],
        lastFeedback: null,
        acceptedAfterAttempts: false
      };
    }

    const history = assessmentHistory[historyKey];
    history.attempts++;

    // Call OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a practical real estate photography assistant with context awareness.

CURRENT ROOM: ${roomType.toUpperCase()}
ATTEMPT NUMBER: ${history.attempts}
${history.constraints.length > 0 ? `KNOWN CONSTRAINTS: ${history.constraints.join(', ')}` : ''}

CRITICAL ASSESSMENT RULES:

1. CONTEXT AWARENESS:
- This is attempt #${history.attempts} for this shot
- ${history.attempts >= 3 ? 'After 3+ attempts, be more lenient and accepting' : 'Provide helpful guidance'}
- ${history.constraints.includes("can't move back") ? "Photographer confirmed they CANNOT back up further" : ''}

2. PHYSICAL CONSTRAINTS - BE REALISTIC:
- If photographer says they can't move back, NEVER suggest it again
- Accept the shot if it shows the key elements of the ${roomType}
- Minor issues can be fixed in post-production

3. PROGRESSIVE ACCEPTANCE:
- Attempt 1-2: Normal standards
- Attempt 3-4: More accepting, focus on major issues only
- Attempt 5+: Accept if it's usable at all

4. TONE:
- Always supportive and understanding
- Acknowledge their constraints
- Be encouraging, especially after multiple attempts

Remember: They're doing their best in real-world conditions. Be helpful, not perfectionist.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: history.attempts >= 3 
                ? `This is attempt #${history.attempts}. What do you think of this shot?`
                : 'What micro-adjustment would perfect this composition?'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: 'low'
              }
            }
          ]
        }
      ],
      max_tokens: 60,
      temperature: 0.4
    });

    const feedback = response.choices[0]?.message?.content || 'Unable to analyze photo';

    // Update history
    history.lastFeedback = feedback;

    // Check if accepted
    const isAcceptable = 
      feedback.toLowerCase().includes('good') ||
      feedback.toLowerCase().includes('great') ||
      feedback.toLowerCase().includes('perfect') ||
      feedback.toLowerCase().includes('snap') ||
      feedback.toLowerCase().includes('capture') ||
      history.attempts >= 5;

    if (isAcceptable) {
      history.acceptedAfterAttempts = true;
    }

    // Extract constraints from feedback
    if (feedback.toLowerCase().includes("can't") || feedback.toLowerCase().includes('cannot')) {
      if (feedback.toLowerCase().includes('back')) {
        history.constraints.push("can't move back");
      }
    }

    // Build response matching MCPAssessmentResponse structure
    const assessmentResponse = {
      feedback,
      attemptNumber: history.attempts,
      angleReset: false,
      score: isAcceptable ? 85 : 70,
      isAcceptable,
      constraints: history.constraints,
      improvements: isAcceptable ? [] : ['Adjust based on feedback']
    };

    console.log(`[${new Date().toISOString()}] Assessment complete:`, feedback.substring(0, 50) + '...');
    res.json(assessmentResponse);

  } catch (error) {
    console.error('Assessment error:', error);
    res.status(500).json({
      error: 'Assessment failed',
      details: error.message
    });
  }
});

// Get assessment history
app.get('/history/:shootId/:roomType', (req, res) => {
  const { shootId, roomType } = req.params;
  const historyKey = `${shootId}-${roomType}`;
  
  res.json(assessmentHistory[historyKey] || null);
});

// Clear assessment history
app.delete('/history/:shootId', (req, res) => {
  const { shootId } = req.params;
  
  // Clear all rooms for this shoot
  Object.keys(assessmentHistory).forEach(key => {
    if (key.startsWith(shootId)) {
      delete assessmentHistory[key];
    }
  });
  
  res.json({ message: 'History cleared' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Simple Assessment Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Configured ✓' : 'Missing ✗'}`);
  console.log('\nReady to handle assessment requests...\n');
});