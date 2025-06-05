#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

class SleeekMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'sleeek-photo-assessor',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // In production, use a database like PostgreSQL or MongoDB
    this.assessmentContexts = new Map();
    
    this.setupHandlers();
  }

  setupHandlers() {
    this.server.setRequestHandler('tools/list', async () => ({
      tools: [
        {
          name: 'assess_photo',
          description: 'Assess a real estate photo with context awareness',
          inputSchema: {
            type: 'object',
            properties: {
              imageBase64: { type: 'string' },
              roomType: { type: 'string' },
              shootId: { type: 'string' },
              stackIndex: { type: 'number' },
              currentAngle: {
                type: 'object',
                properties: {
                  pitch: { type: 'number' },
                  yaw: { type: 'number' },
                  roll: { type: 'number' }
                }
              }
            },
            required: ['imageBase64', 'roomType', 'shootId']
          }
        }
      ]
    }));

    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;
      
      if (name === 'assess_photo') {
        return this.assessPhoto(args);
      }
      
      throw new Error(`Unknown tool: ${name}`);
    });
  }

  async assessPhoto(params) {
    const { imageBase64, roomType, shootId, stackIndex, currentAngle } = params;
    
    const contextKey = `${shootId}:${roomType}`;
    let context = this.assessmentContexts.get(contextKey) || {
      shootId,
      roomType,
      attempts: 0,
      assessments: [],
      constraints: new Set(),
      lastAngle: null,
      improvements: []
    };

    // Check for angle change
    let angleReset = false;
    if (context.lastAngle && currentAngle) {
      const angleDiff = this.calculateAngleDifference(context.lastAngle, currentAngle);
      if (angleDiff > 30) {
        angleReset = true;
        context.attempts = 0;
        context.assessments = [];
      }
    }

    context.attempts++;

    // Build context-aware prompt
    let systemPrompt = `You are a professional real estate photographer providing guidance.
Room type: ${roomType}
Attempt: ${context.attempts}${angleReset ? ' (NEW ANGLE)' : ''}

CRITICAL RULES:
1. Focus ONLY on composition, framing, and camera position
2. NEVER mention lighting, exposure, brightness, or shadows
3. Be specific about room features you can see in THIS image
4. Maximum 40 words
5. For attempt 3+, be very accepting and encourage capture`;

    if (context.assessments.length > 0 && !angleReset) {
      const recent = context.assessments.slice(-2);
      systemPrompt += '\n\nPrevious feedback given:';
      recent.forEach(a => {
        systemPrompt += `\n- "${a.feedback}"`;
      });
      systemPrompt += '\n\nProvide DIFFERENT advice. Do not repeat previous suggestions.';
    }

    if (context.constraints.size > 0) {
      systemPrompt += '\n\nKnown constraints:';
      context.constraints.forEach(c => {
        systemPrompt += `\n- ${c}`;
      });
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Assess this real estate photo's composition."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 100,
        temperature: 0.7
      });

      const feedback = response.choices[0].message.content;

      // Extract constraints
      const detectedConstraints = this.extractConstraints(feedback);
      detectedConstraints.forEach(c => context.constraints.add(c));

      // Store assessment
      const assessment = {
        timestamp: new Date().toISOString(),
        attemptNumber: context.attempts,
        feedback,
        angle: currentAngle,
        angleReset
      };

      context.assessments.push(assessment);
      context.lastAngle = currentAngle;

      this.assessmentContexts.set(contextKey, context);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              feedback,
              attemptNumber: context.attempts,
              angleReset,
              score: this.calculateScore(context.attempts),
              isAcceptable: context.attempts >= 3,
              constraints: Array.from(context.constraints)
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      console.error('OpenAI error:', error);
      throw error;
    }
  }

  calculateAngleDifference(angle1, angle2) {
    if (!angle1 || !angle2) return 0;
    const dPitch = Math.abs(angle1.pitch - angle2.pitch);
    const dYaw = Math.abs(angle1.yaw - angle2.yaw);
    const dRoll = Math.abs(angle1.roll - angle2.roll);
    return Math.sqrt(dPitch * dPitch + dYaw * dYaw + dRoll * dRoll);
  }

  extractConstraints(feedback) {
    const constraints = [];
    const lower = feedback.toLowerCase();
    
    if (lower.includes("can't move back") || lower.includes("cannot move back")) {
      constraints.push("Limited space - cannot move back further");
    }
    if (lower.includes("wall behind") || lower.includes("against wall")) {
      constraints.push("Wall directly behind camera position");
    }
    
    return constraints;
  }

  calculateScore(attemptNumber) {
    switch (attemptNumber) {
      case 1: return 75;
      case 2: return 82;
      case 3: return 88;
      default: return 90;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Sleeek MCP Server running');
  }
}

// Export for HTTP bridge
export { SleeekMCPServer };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new SleeekMCPServer();
  server.run().catch(console.error);
}