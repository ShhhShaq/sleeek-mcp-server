# Sleeek MCP Server - Production Ready

This MCP server provides context-aware photo assessment for SleeekApp with:
- ✅ Context memory across attempts
- ✅ Angle change detection
- ✅ Constraint learning
- ✅ Progressive feedback
- ✅ Future agentic capabilities

## Quick Deploy to Railway

### 1. Push to GitHub
```bash
cd ~/Desktop/sleeek-mcp-deploy
git init
git add .
git commit -m "Initial MCP server"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### 2. Deploy to Railway
1. Go to [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repo
4. Add environment variable: `OPENAI_API_KEY`
5. Deploy!

Railway will give you a URL like: `https://sleeek-mcp.up.railway.app`

### 3. Update Your iOS App
In `MCPClient.swift`, change:
```swift
private let bridgeURL = "https://sleeek-mcp.up.railway.app"
```

## Local Development
```bash
npm install
cp .env.example .env
# Add your OpenAI API key to .env
npm start
```

## Features

### Context Awareness
- Remembers previous assessments
- Won't repeat the same feedback
- Tracks physical constraints
- Progressive acceptance (3 attempts max)

### Angle Detection
- Detects >30° camera movement
- Resets context for new angles
- Fresh assessment from new position

### Future Agentic Capabilities
This MCP architecture enables:
- Multi-step planning
- Cross-room optimization
- Learning from all users
- Personalized style adaptation
- Integration with other tools

## API Endpoints

### POST /assess
```json
{
  "imageBase64": "...",
  "roomType": "living",
  "shootId": "uuid",
  "currentAngle": {
    "pitch": 0,
    "yaw": 0,
    "roll": 90
  }
}
```

Response:
```json
{
  "feedback": "Move left to include the fireplace. The sofa is well-framed.",
  "attemptNumber": 1,
  "angleReset": false,
  "score": 75,
  "isAcceptable": false,
  "constraints": []
}
```

## Production Considerations

1. **Database**: Replace in-memory storage with PostgreSQL
2. **Authentication**: Add API keys for security
3. **Rate Limiting**: Prevent abuse
4. **Monitoring**: Add logging service
5. **Caching**: Cache similar assessments