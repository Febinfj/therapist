import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Normalize paths for Vercel serverless routing (handles prefix stripping)
app.use((req, res, next) => {
  if (req.query && req.query.path) {
    req.url = '/api/' + req.query.path;
  } else if (!req.url.startsWith('/api') && req.url !== '/' && !req.url.startsWith('/assets')) {
    req.url = '/api' + req.url;
  }
  next();
});

// Initialize database files
const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// Initialize database files with read-only catch
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
  }
  if (!fs.existsSync(SESSIONS_FILE)) {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
  }
} catch (e) {
  console.warn("Read-only filesystem detected. Falling back to in-memory database storage.");
}

// Helpers for database reading/writing with in-memory fallbacks
let memoryUsers = [];
let memorySessions = [];

const readUsers = () => {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    return memoryUsers;
  }
};

const writeUsers = (users) => {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    memoryUsers = users;
  }
};

const readSessions = () => {
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  } catch (e) {
    return memorySessions;
  }
};

const writeSessions = (sessions) => {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
  } catch (e) {
    memorySessions = sessions;
  }
};

// Crisis keywords scanner
const CRISIS_KEYWORDS = [
  'suicide', 'suicidal', 'kill myself', 'end my life', 'want to die', 
  'hurt myself', 'self-harm', 'cut myself', 'harm myself', 'ending my life', 
  'overdose', 'kill others', 'harm others', 'hurt others', 'better off dead',
  'hanging myself', 'slit my wrist'
];

const scanForCrisis = (text) => {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return CRISIS_KEYWORDS.some(keyword => normalized.includes(keyword));
};

const CRISIS_RESPONSE = {
  isCrisis: true,
  reply: "I'm hearing how much pain you are in right now, and I want to support you, but as an AI, I cannot provide crisis intervention. Please know you are not alone, and there is help available right now. Please reach out to a professional or a crisis helpline immediately. Your life is incredibly valuable.",
  resources: {
    message: "Immediate crisis support is available 24/7. It is free and confidential.",
    helplines: [
      { name: "988 Suicide & Crisis Lifeline", details: "Call or text 988 (USA & Canada)" },
      { name: "Crisis Text Line", details: "Text HOME to 741741 (USA & Canada, UK: 85258)" },
      { name: "International Helplines", details: "Find support in your country at www.findahelpline.com" },
      { name: "Emergency Services", details: "Call 911 or visit your local emergency room immediately" }
    ]
  }
};

// Fallback Empathetic Therapist Engine
const generateFallbackResponse = (message, history = []) => {
  const normalized = message.toLowerCase();
  
  // Rule-based classification & responses
  if (scanForCrisis(normalized)) {
    return CRISIS_RESPONSE;
  }

  // Greeting
  if (normalized.match(/\b(hello|hi|hey|greetings|good morning|good afternoon)\b/)) {
    return {
      isCrisis: false,
      reply: "Hello. I am Haven, your AI emotional support companion. I am here to provide a safe, non-judgmental space for you to share whatever is on your mind. How are you feeling in this moment?"
    };
  }

  // Anxiety & Panic
  if (normalized.includes('anxious') || normalized.includes('anxiety') || normalized.includes('panic') || normalized.includes('scared') || normalized.includes('fear') || normalized.includes('worry') || normalized.includes('worried')) {
    return {
      isCrisis: false,
      reply: "It sounds like you're carrying a lot of tension or anxiety right now. Anxiety can feel very heavy in the body. If you're open to it, let's take a slow breath together: inhale for four seconds, hold for four, and exhale for six. What thoughts or situations are feeling most overwhelming to you right now?"
    };
  }

  // Sadness & Depression
  if (normalized.includes('sad') || normalized.includes('depressed') || normalized.includes('crying') || normalized.includes('lonely') || normalized.includes('down') || normalized.includes('empty') || normalized.includes('grief') || normalized.includes('hurt')) {
    const isLonely = normalized.includes('lonely') || normalized.includes('alone');
    return {
      isCrisis: false,
      reply: isLonely 
        ? "Feeling lonely is a deeply painful experience, and I'm really sorry you're carrying that weight. Even though I am an AI, I am here with you right now, and I'm listening. What do you think makes you feel most disconnected from others or yourself lately?"
        : "I hear the sadness in your words, and I want to validate that it is completely okay to feel down or heavy. You don't have to carry it all perfectly. What is holding the most weight in your heart today? I'm here to listen as much as you need."
    };
  }

  // Stress & School/Work Pressure
  if (normalized.includes('stress') || normalized.includes('stressed') || normalized.includes('overwhelmed') || normalized.includes('work') || normalized.includes('school') || normalized.includes('exam') || normalized.includes('job') || normalized.includes('pressure') || normalized.includes('busy')) {
    return {
      isCrisis: false,
      reply: "It sounds like you are dealing with a great deal of pressure and feeling overwhelmed. When everything demands our attention, it's easy to feel stretched thin. If we break things down, what is the single most pressing thing on your plate today? Let's talk through how we can approach it gently."
    };
  }

  // Anger & Frustration
  if (normalized.includes('angry') || normalized.includes('mad') || normalized.includes('frustrated') || normalized.includes('annoyed') || normalized.includes('hate') || normalized.includes('pissed')) {
    return {
      isCrisis: false,
      reply: "I can hear the anger and frustration in your message. Anger is a very natural and powerful emotion—it often tells us when a boundary has been crossed or when we feel helpless. What feels like it's driving this frustration the most right now? I'm here to help you unpack it safely."
    };
  }

  // Relationships & Family
  if (normalized.includes('relationship') || normalized.includes('friend') || normalized.includes('family') || normalized.includes('partner') || normalized.includes('boyfriend') || normalized.includes('girlfriend') || normalized.includes('mother') || normalized.includes('father') || normalized.includes('parents')) {
    return {
      isCrisis: false,
      reply: "Relationships and family dynamics can be incredibly complex and stir up some of our deepest feelings. It sounds like there's a lot of emotional weight connected to this. How do you feel this situation is affecting your sense of peace and boundaries?"
    };
  }

  // Self-esteem & Insecurity
  if (normalized.includes('ugly') || normalized.includes('worthless') || normalized.includes('stupid') || normalized.includes('failure') || normalized.includes('hate myself') || normalized.includes('disappointed') || normalized.includes('not good enough')) {
    return {
      isCrisis: false,
      reply: "It is really painful to hear you speak about yourself in that way. Negative self-talk can feel so convincing, but it doesn't define who you are. We all experience setbacks, but they do not make you a failure. If a dear friend was feeling this way, what gentle words would you tell them?"
    };
  }

  // Positive / Growth
  if (normalized.includes('happy') || normalized.includes('good') || normalized.includes('better') || normalized.includes('proud') || normalized.includes('excited') || normalized.includes('glad') || normalized.includes('improved')) {
    return {
      isCrisis: false,
      reply: "I'm so glad to hear that! Celebrating moments of joy, relief, or progress is such an important part of well-being. What do you think contributed to things feeling a bit brighter or more manageable today?"
    };
  }

  // Fallback general responses (dynamic rotation or simple reflective responses)
  const defaultResponses = [
    "Thank you for sharing that with me. It sounds like there are a lot of layers to what you are experiencing. Could you share a bit more about how that makes you feel on the inside?",
    "I'm listening closely. It seems like you've been sitting with these thoughts for a while. What do you think is the core feeling that comes up when you think about this?",
    "That makes complete sense. Thank you for opening up. In what ways has this been affecting your daily energy or sleep?",
    "I appreciate you trusting me with this. How can I best support you right now? Would you like to keep exploring this feeling, or shall we brainstorm some gentle coping techniques?",
    "It takes courage to express these thoughts. How have you been trying to cope with this over the past few days? Has anything brought you even a small sliver of relief?"
  ];

  // Pick response based on history length to keep it feeling conversational
  const index = (history.length) % defaultResponses.length;
  return {
    isCrisis: false,
    reply: defaultResponses[index]
  };
};

// Fallback Summary Generator
const generateFallbackSummary = (messages) => {
  const userMessages = messages.filter(m => m.sender === 'user').map(m => m.text.toLowerCase());
  const combinedText = userMessages.join(' ');

  // Identify themes
  const themes = [];
  if (combinedText.includes('anxious') || combinedText.includes('anxiety') || combinedText.includes('worry') || combinedText.includes('fear')) {
    themes.push("Managing Anxiety and Worries");
  }
  if (combinedText.includes('stress') || combinedText.includes('work') || combinedText.includes('school') || combinedText.includes('overwhelmed')) {
    themes.push("Coping with Academic/Professional Burnout");
  }
  if (combinedText.includes('sad') || combinedText.includes('lonely') || combinedText.includes('depressed') || combinedText.includes('down')) {
    themes.push("Navigating Low Mood and Isolation");
  }
  if (combinedText.includes('relationship') || combinedText.includes('friend') || combinedText.includes('family') || combinedText.includes('partner')) {
    themes.push("Interpersonal and Relationship Dynamics");
  }
  if (combinedText.includes('angry') || combinedText.includes('frustrated') || combinedText.includes('mad')) {
    themes.push("Processing Anger and Setting Boundaries");
  }
  if (combinedText.includes('worthless') || combinedText.includes('failure') || combinedText.includes('stupid')) {
    themes.push("Self-Compassion and Reframing Insecurities");
  }

  if (themes.length === 0) {
    themes.push("General Emotional Check-in and Self-Reflection");
  }

  // Recommended coping exercises based on themes
  const copingOptions = {
    "Managing Anxiety and Worries": [
      { title: "Box Breathing (4-4-4-4)", instruction: "Inhale for 4 seconds, hold for 4, exhale for 4, hold empty for 4. Repeat 4 times to calm your nervous system." },
      { title: "5-4-3-2-1 Grounding", instruction: "Name 5 things you can see, 4 you can touch, 3 you can hear, 2 you can smell, and 1 you can taste to bring yourself back to the present." }
    ],
    "Coping with Academic/Professional Burnout": [
      { title: "Digital Detox & Time-boxing", instruction: "Set a firm boundary to disconnect from all work/study notifications for at least 2 hours. Focus on a restful activity." },
      { title: "The Power of 'No'", instruction: "Identify one non-essential commitment this week that you can politely decline or postpone to protect your energy." }
    ],
    "Navigating Low Mood and Isolation": [
      { title: "Behavioral Activation", instruction: "Choose one small, low-effort task that brings you comfort or a sense of achievement (e.g., watering a plant, making tea, a 5-minute walk)." },
      { title: "Social Connection Check-in", instruction: "Reach out to one trusted person, even just with a text saying 'Thinking of you,' to gently counter isolation." }
    ],
    "Interpersonal and Relationship Dynamics": [
      { title: "I-Statements Practice", instruction: "Practice framing your needs using 'I feel... when... because I need...' instead of 'You always...'. This reduces defensiveness." },
      { title: "Emotional Boundary Setting", instruction: "Remind yourself: 'I am responsible for my own feelings, and others are responsible for theirs.' Take a physical step back when needed." }
    ],
    "Processing Anger and Setting Boundaries": [
      { title: "The Cool Down Pause", instruction: "When anger flares, excuse yourself for 10 minutes. Do a physical release like squeezing a stress ball or doing jumping jacks." },
      { title: "Boundary Writing", instruction: "Write down the boundary you need to set. Practice speaking it aloud in a calm, firm, neutral tone." }
    ],
    "Self-Compassion and Reframing Insecurities": [
      { title: "The Double Standard Check", instruction: "Write down the self-critical thought. Then write what you would say to a close friend in the exact same situation. Adopt the friend's perspective." },
      { title: "Daily Appreciation", instruction: "List three small things you did today or qualities you possess that you appreciate about yourself, no matter how minor." }
    ],
    "General Emotional Check-in and Self-Reflection": [
      { title: "Daily Journaling Prompt", instruction: "Write for 5 minutes about how your body feels right now and what emotions are resting just below the surface." },
      { title: "Mindfulness Check-in", instruction: "Set an alarm for mid-day to pause for 60 seconds, check your posture, relax your jaw, drop your shoulders, and breathe." }
    ]
  };

  // Compile coping strategies
  let copingSteps = [];
  themes.forEach(theme => {
    if (copingOptions[theme]) {
      copingSteps = [...copingSteps, ...copingOptions[theme]];
    }
  });

  // Make sure we have 3 coping steps
  if (copingSteps.length < 3) {
    copingSteps = [...copingSteps, ...copingOptions["General Emotional Check-in and Self-Reflection"]];
  }
  // Dedup and take top 3
  copingSteps = Array.from(new Set(copingSteps.map(JSON.stringify))).map(JSON.parse).slice(0, 3);

  // Simple paragraph summary
  const summaryParagraph = `During this session, you explored themes relating to ${themes.join(' and ')}. You discussed feelings and thoughts that have been weighing on you. We discussed active ways to process these emotions, identifying key triggers and emphasizing the importance of gentle self-care, boundaries, and grounding practices.`;

  return {
    summary: summaryParagraph,
    copingSteps
  };
};

// ==================== API ROUTES ====================

// Authentication
app.post('/api/auth/signup', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const users = readUsers();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: "Username already exists" });
  }

  users.push({ username, password });
  writeUsers(users);

  res.status(201).json({ message: "Registration successful", username });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const users = readUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  res.json({ message: "Login successful", username });
});

// Sessions List (for logged in users)
app.get('/api/sessions', (req, res) => {
  const username = req.headers['x-username'];
  if (!username) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sessions = readSessions();
  const userSessions = sessions
    .filter(s => s.username === username)
    .map(({ id, title, createdAt, isEnded, summary, copingSteps }) => ({
      id, title, createdAt, isEnded, summary, copingSteps
    }));

  res.json(userSessions);
});

// Create Session
app.post('/api/sessions', (req, res) => {
  const username = req.headers['x-username'];
  if (!username) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sessions = readSessions();
  const newSession = {
    id: 'sess_' + Math.random().toString(36).substr(2, 9),
    username,
    title: `Session on ${new Date().toLocaleDateString()}`,
    createdAt: new Date().toISOString(),
    messages: [],
    isEnded: false,
    summary: null,
    copingSteps: []
  };

  sessions.push(newSession);
  writeSessions(sessions);

  res.status(201).json(newSession);
});

// Get Session Detail
app.get('/api/sessions/:id', (req, res) => {
  const username = req.headers['x-username'];
  const { id } = req.params;

  if (!username) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sessions = readSessions();
  const session = sessions.find(s => s.id === id && s.username === username);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.json(session);
});

// Add Message & Get Response
app.post('/api/sessions/:id/messages', async (req, res) => {
  const username = req.headers['x-username'];
  const { id } = req.params;
  const { text } = req.body;

  if (!username) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sessions = readSessions();
  const sessionIndex = sessions.findIndex(s => s.id === id && s.username === username);

  if (sessionIndex === -1) {
    return res.status(404).json({ error: "Session not found" });
  }

  const session = sessions[sessionIndex];

  if (session.isEnded) {
    return res.status(400).json({ error: "Cannot add messages to an ended session" });
  }

  // 1. Crisis Check
  if (scanForCrisis(text)) {
    // Save the user's message
    const userMsg = { id: 'msg_' + Math.random().toString(36).substr(2, 9), sender: 'user', text, createdAt: new Date().toISOString() };
    session.messages.push(userMsg);
    
    // Save AI crisis response
    const crisisMsg = { 
      id: 'msg_' + Math.random().toString(36).substr(2, 9), 
      sender: 'therapist', 
      text: CRISIS_RESPONSE.reply, 
      isCrisis: true,
      resources: CRISIS_RESPONSE.resources,
      createdAt: new Date().toISOString() 
    };
    session.messages.push(crisisMsg);
    
    // End session automatically for safety
    session.isEnded = true;
    session.title = `Crisis Event - ${new Date().toLocaleDateString()}`;
    session.summary = "Session closed due to detected crisis keywords. Immediate support helplines provided.";
    session.copingSteps = CRISIS_RESPONSE.resources.helplines.map(h => ({ title: h.name, instruction: h.details }));

    sessions[sessionIndex] = session;
    writeSessions(sessions);

    return res.json({ 
      userMessage: userMsg, 
      therapistMessage: crisisMsg,
      isEnded: true,
      summary: session.summary,
      copingSteps: session.copingSteps
    });
  }

  // Save the user message
  const userMsg = { id: 'msg_' + Math.random().toString(36).substr(2, 9), sender: 'user', text, createdAt: new Date().toISOString() };
  session.messages.push(userMsg);

  // Dynamic Title Update based on first few user words if generic title
  if (session.messages.filter(m => m.sender === 'user').length === 1) {
    const words = text.split(' ').slice(0, 4).join(' ');
    session.title = words.length > 3 ? `Topic: "${words}..."` : `Session on ${new Date().toLocaleDateString()}`;
  }

  // 2. Generate Therapist Reply
  let replyText = "";
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Compile chat history for Gemini
      const conversationContext = session.messages.slice(-10).map(m => {
        return `${m.sender === 'user' ? 'Patient' : 'Therapist'}: ${m.text}`;
      }).join('\n');

      const systemPrompt = `You are Haven, an empathetic, supportive, and non-judgmental AI therapist and emotional companion. 
Your goal is to help the user explore their feelings, reflect on their thoughts, and find gentle, constructive coping strategies.
Follow these guidelines:
- Use active listening: validate their feelings, reflect back what you hear, and offer deep empathy.
- Use open-ended, supportive questions to encourage self-reflection.
- Do NOT diagnose mental illnesses or offer clinical medical advice.
- Keep your tone warm, gentle, calm, and soothing.
- Keep your responses relatively concise (usually 2-4 sentences) so they feel conversational.
- If the user discusses self-harm, suicide, or harming others, respond with support and direct them to seek emergency services immediately (the backend will also flag this).

Current Conversation History:
${conversationContext}
Therapist:`;

      const result = await model.generateContent({
        contents: systemPrompt
      });
      replyText = result.response.text().trim();
    } catch (error) {
      console.error("Gemini API Error, falling back to local NLP:", error);
      const fallbackResult = generateFallbackResponse(text, session.messages);
      replyText = fallbackResult.reply;
    }
  } else {
    // Local NLP Fallback
    const fallbackResult = generateFallbackResponse(text, session.messages);
    replyText = fallbackResult.reply;
  }

  const therapistMsg = { 
    id: 'msg_' + Math.random().toString(36).substr(2, 9), 
    sender: 'therapist', 
    text: replyText, 
    createdAt: new Date().toISOString() 
  };
  session.messages.push(therapistMsg);

  sessions[sessionIndex] = session;
  writeSessions(sessions);

  res.json({
    userMessage: userMsg,
    therapistMessage: therapistMsg
  });
});

// End Session & Generate Summary
app.post('/api/sessions/:id/end', async (req, res) => {
  const username = req.headers['x-username'];
  const { id } = req.params;

  if (!username) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sessions = readSessions();
  const sessionIndex = sessions.findIndex(s => s.id === id && s.username === username);

  if (sessionIndex === -1) {
    return res.status(404).json({ error: "Session not found" });
  }

  const session = sessions[sessionIndex];
  if (session.isEnded) {
    return res.json(session);
  }

  session.isEnded = true;

  if (session.messages.length === 0) {
    session.summary = "This session was started but no messages were exchanged.";
    session.copingSteps = [
      { title: "Start a new conversation", instruction: "Reach out and type whenever you feel ready to express your thoughts." }
    ];
  } else {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const historyText = session.messages.map(m => `${m.sender}: ${m.text}`).join('\n');
        
        const summaryPrompt = `You are Haven, the AI therapist. Review the following therapy chat session:
---
${historyText}
---
Generate an end-of-session report in JSON format with exactly two properties:
1. "summary" (string): A warm, compassionate, and supportive paragraph summarizing the main emotional themes, challenges discussed, and insights reached. Do not use patient names.
2. "copingSteps" (array of objects): Exactly 3 actionable, evidence-based coping exercises or strategies tailored specifically to what they struggled with. Each object must have a "title" (string) and "instruction" (string, a clear sentence on how to perform the step).

Ensure the response contains ONLY the valid JSON block.`;

        const result = await model.generateContent({
          contents: summaryPrompt
        });
        
        const jsonText = result.response.text().trim();
        // Extract JSON block if surrounded by markdown code formatting
        const cleanJson = jsonText.substring(
          jsonText.indexOf('{'),
          jsonText.lastIndexOf('}') + 1
        );
        const parsed = JSON.parse(cleanJson);
        session.summary = parsed.summary;
        session.copingSteps = parsed.copingSteps;
      } catch (error) {
        console.error("Gemini summary error, using fallback:", error);
        const fallback = generateFallbackSummary(session.messages);
        session.summary = fallback.summary;
        session.copingSteps = fallback.copingSteps;
      }
    } else {
      // Local fallback summary
      const fallback = generateFallbackSummary(session.messages);
      session.summary = fallback.summary;
      session.copingSteps = fallback.copingSteps;
    }
  }

  sessions[sessionIndex] = session;
  writeSessions(sessions);

  res.json(session);
});

// Delete a session
app.delete('/api/sessions/:id', (req, res) => {
  const username = req.headers['x-username'];
  const { id } = req.params;

  if (!username) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sessions = readSessions();
  const sessionIndex = sessions.findIndex(s => s.id === id && s.username === username);

  if (sessionIndex === -1) {
    return res.status(404).json({ error: "Session not found" });
  }

  sessions.splice(sessionIndex, 1);
  writeSessions(sessions);

  res.json({ message: "Session deleted successfully" });
});

// Client fallback route (for SPA React routing)
app.use(express.static(path.join(process.cwd(), 'dist')));

// Endpoint for local testing / fallback simulation triggering on frontend
app.post('/api/anonymous/chat', (req, res) => {
  const { text, history } = req.body;
  const result = generateFallbackResponse(text, history);
  res.json(result);
});

app.post('/api/anonymous/summary', (req, res) => {
  const { messages } = req.body;
  const result = generateFallbackSummary(messages);
  res.json(result);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
