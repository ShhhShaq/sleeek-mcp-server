import express from 'express';
import { spawn } from 'child_process';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors()); // Enable CORS for all origins

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'sleeek-mcp-bridge',
    version: '1.0.0'
  });
});

// Main assessment endpoint
app.post('/assess', async (req, res) => {
  console.log(`[${new Date().toISOString()}] Assessment request for ${req.body.roomType}`);
  
  try {
    const mcp = spawn('node', [join(__dirname, 'index.js')], {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let responseData = '';
    let errorData = '';
    let timeout;

    // Set timeout
    timeout = setTimeout(() => {
      mcp.kill();
      res.status(504).json({ error: 'Assessment timeout' });
    }, 30000); // 30 second timeout

    mcp.stdout.on('data', (data) => {
      responseData += data.toString();
    });

    mcp.stderr.on('data', (data) => {
      const log = data.toString().trim();
      if (log) console.log('[MCP]', log);
      errorData += log + '\n';
    });

    mcp.on('error', (error) => {
      clearTimeout(timeout);
      console.error('MCP spawn error:', error);
      res.status(500).json({ error: 'Failed to start MCP process' });
    });

    mcp.on('close', (code) => {
      clearTimeout(timeout);
      
      if (code !== 0 && code !== null) {
        console.error('MCP exited with code:', code);
        return res.status(500).json({
          error: 'MCP process failed',
          details: errorData
        });
      }

      try {
        const lines = responseData.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        
        if (!lastLine) {
          throw new Error('No response from MCP');
        }
        
        const response = JSON.parse(lastLine);
        
        if (response.content && response.content[0]) {
          const assessmentData = JSON.parse(response.content[0].text);
          console.log(`[${new Date().toISOString()}] Assessment complete:`, assessmentData.feedback.substring(0, 50) + '...');
          res.json(assessmentData);
        } else if (response.error) {
          throw new Error(response.error.message || 'MCP error');
        } else {
          throw new Error('Invalid MCP response format');
        }
      } catch (error) {
        console.error('Response parsing error:', error);
        console.error('Raw response:', responseData);
        res.status(500).json({
          error: 'Failed to parse MCP response',
          details: error.message
        });
      }
    });

    // Send request to MCP
    const mcpRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'assess_photo',
        arguments: req.body
      },
      id: Date.now()
    };

    mcp.stdin.write(JSON.stringify(mcpRequest) + '\n');
    mcp.stdin.end();

  } catch (error) {
    console.error('Bridge error:', error);
    res.status(500).json({
      error: 'Bridge processing failed',
      details: error.message
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 MCP HTTP Bridge running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔑 OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Configured ✓' : 'Missing ✗'}`);
  console.log('\nReady to handle assessment requests...\n');
});