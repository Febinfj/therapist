import React, { useState, useEffect, useRef } from 'react';

const API_BASE = window.location.port && window.location.port !== '5000'
  ? `${window.location.protocol}//${window.location.hostname}:5000`
  : '';

// Client-side crisis keywords for instant detection
const CRISIS_KEYWORDS = [
  'suicide', 'suicidal', 'kill myself', 'end my life', 'want to die', 
  'hurt myself', 'self-harm', 'cut myself', 'harm myself', 'ending my life', 
  'overdose', 'kill others', 'harm others', 'hurt others', 'better off dead',
  'hanging myself', 'slit my wrist'
];

const checkCrisisLanguage = (text) => {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return CRISIS_KEYWORDS.some(keyword => normalized.includes(keyword));
};

function App() {
  // Authentication State
  const [user, setUser] = useState(null); // String (username) or null
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [authScreen, setAuthScreen] = useState('login'); // 'login' | 'signup'
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  // Sessions and Chat State
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Modals & Warnings
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [crisisAlertActive, setCrisisAlertActive] = useState(false);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);

  // Messages scrolling helper
  const messagesEndRef = useRef(null);

  // Load auth state from session storage on mount
  useEffect(() => {
    const savedUser = sessionStorage.getItem('haven_username');
    const savedAnon = sessionStorage.getItem('haven_anonymous');
    
    if (savedUser) {
      setUser(savedUser);
      loadSessions(savedUser, false);
    } else if (savedAnon === 'true') {
      setIsAnonymous(true);
      setUser('Anonymous User');
      loadSessions(null, true);
    }
  }, []);

  // Scroll to bottom of chat when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages, isTyping]);

  // ==================== AUTH & SESSION LOADING ====================

  const loadSessions = (username, anonymousMode) => {
    if (anonymousMode) {
      const anonSessions = JSON.parse(localStorage.getItem('haven_anon_sessions') || '[]');
      setSessions(anonSessions);
      if (anonSessions.length > 0) {
        const latest = anonSessions[0];
        setCurrentSession(latest);
        if (latest.messages.some(m => m.isCrisis)) {
          setCrisisAlertActive(true);
        }
      } else {
        setCurrentSession(null);
      }
    } else {
      const userSessions = JSON.parse(localStorage.getItem(`haven_sessions_${username}`) || '[]');
      setSessions(userSessions);
      if (userSessions.length > 0) {
        const latest = userSessions[0];
        setCurrentSession(latest);
        if (latest.messages.some(m => m.isCrisis)) {
          setCrisisAlertActive(true);
        }
      } else {
        setCurrentSession(null);
      }
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!usernameInput || !passwordInput) {
      setAuthError("All fields are required");
      return;
    }

    setAuthError('');
    setIsLoadingAuth(true);

    const users = JSON.parse(localStorage.getItem('haven_registered_users') || '[]');
    
    if (authScreen === 'signup') {
      if (users.find(u => u.username.toLowerCase() === usernameInput.toLowerCase())) {
        setAuthError("Username already exists");
        setIsLoadingAuth(false);
        return;
      }
      const newUser = { username: usernameInput, password: passwordInput };
      users.push(newUser);
      localStorage.setItem('haven_registered_users', JSON.stringify(users));
      
      setUser(usernameInput);
      setIsAnonymous(false);
      sessionStorage.setItem('haven_username', usernameInput);
      sessionStorage.removeItem('haven_anonymous');
      setUsernameInput('');
      setPasswordInput('');
      loadSessions(usernameInput, false);
      setIsLoadingAuth(false);
    } else {
      // Login
      const userMatch = users.find(u => u.username.toLowerCase() === usernameInput.toLowerCase() && u.password === passwordInput);
      if (!userMatch) {
        setAuthError("Invalid username or password");
        setIsLoadingAuth(false);
        return;
      }
      
      setUser(userMatch.username);
      setIsAnonymous(false);
      sessionStorage.setItem('haven_username', userMatch.username);
      sessionStorage.removeItem('haven_anonymous');
      setUsernameInput('');
      setPasswordInput('');
      loadSessions(userMatch.username, false);
      setIsLoadingAuth(false);
    }
  };

  const handleAnonymousAccess = () => {
    setIsAnonymous(true);
    setUser('Anonymous User');
    sessionStorage.setItem('haven_anonymous', 'true');
    sessionStorage.removeItem('haven_username');
    setAuthError('');
    loadSessions(null, true);
  };

  const handleLogout = () => {
    setUser(null);
    setIsAnonymous(false);
    setCurrentSession(null);
    setSessions([]);
    setCrisisAlertActive(false);
    sessionStorage.clear();
  };

  const handleStartNewSession = () => {
    const newSession = {
      id: (isAnonymous ? 'anon_sess_' : 'sess_') + Math.random().toString(36).substr(2, 9),
      title: `Session on ${new Date().toLocaleDateString()}`,
      createdAt: new Date().toISOString(),
      messages: [],
      isEnded: false,
      summary: null,
      copingSteps: []
    };

    const updated = [newSession, ...sessions];
    setSessions(updated);
    setCurrentSession(newSession);
    setCrisisAlertActive(false);
    
    if (isAnonymous) {
      localStorage.setItem('haven_anon_sessions', JSON.stringify(updated));
    } else {
      localStorage.setItem(`haven_sessions_${user}`, JSON.stringify(updated));
    }
  };

  const handleSelectSession = (session) => {
    const selected = sessions.find(s => s.id === session.id);
    setCurrentSession(selected);
    if (selected.messages.some(m => m.isCrisis)) {
      setCrisisAlertActive(true);
    } else {
      setCrisisAlertActive(false);
    }
  };

  const handleDeleteSession = (e, sessionId) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this session?")) {
      const updated = sessions.filter(s => s.id !== sessionId);
      setSessions(updated);
      
      if (isAnonymous) {
        localStorage.setItem('haven_anon_sessions', JSON.stringify(updated));
      } else {
        localStorage.setItem(`haven_sessions_${user}`, JSON.stringify(updated));
      }
      
      if (currentSession?.id === sessionId) {
        setCurrentSession(updated.length > 0 ? updated[0] : null);
        setCrisisAlertActive(false);
      }
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !currentSession || currentSession.isEnded) return;

    const messageText = chatInput.trim();
    setChatInput('');

    // Instant client-side crisis check
    const crisisDetected = checkCrisisLanguage(messageText);

    if (crisisDetected) {
      setCrisisAlertActive(true);
      setShowEmergencyModal(true);
    }

    // Prepare message structures
    const userMsg = {
      id: 'msg_' + Math.random().toString(36).substr(2, 9),
      sender: 'user',
      text: messageText,
      createdAt: new Date().toISOString()
    };

    // Optimistically add user message to frontend state
    const updatedMessages = [...currentSession.messages, userMsg];
    const updatedSession = { ...currentSession, messages: updatedMessages };
    setCurrentSession(updatedSession);

    setIsTyping(true);

    try {
      const response = await fetch(`${API_BASE}/api/anonymous/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: messageText, history: currentSession.messages })
      });

      const data = await response.json();
      
      let therapistMsg;
      let finalSessionState;

      if (data.isCrisis) {
        therapistMsg = {
          id: 'msg_' + Math.random().toString(36).substr(2, 9),
          sender: 'therapist',
          text: data.reply,
          isCrisis: true,
          resources: data.resources,
          createdAt: new Date().toISOString()
        };

        finalSessionState = {
          ...updatedSession,
          messages: [...updatedMessages, therapistMsg],
          isEnded: true,
          title: `Crisis Event - ${new Date().toLocaleDateString()}`,
          summary: "Session closed due to detected crisis keywords. Immediate support helplines provided.",
          copingSteps: data.resources.helplines.map(h => ({ title: h.name, instruction: h.details }))
        };
        setCrisisAlertActive(true);
      } else {
        therapistMsg = {
          id: 'msg_' + Math.random().toString(36).substr(2, 9),
          sender: 'therapist',
          text: data.reply,
          createdAt: new Date().toISOString()
        };

        // Update title dynamically on first text
        let finalTitle = currentSession.title;
        const userMessageCount = updatedMessages.filter(m => m.sender === 'user').length;
        if (userMessageCount === 1) {
          const words = messageText.split(' ').slice(0, 4).join(' ');
          finalTitle = words.length > 3 ? `Topic: "${words}..."` : currentSession.title;
        }

        finalSessionState = {
          ...updatedSession,
          title: finalTitle,
          messages: [...updatedMessages, therapistMsg]
        };
      }

      setCurrentSession(finalSessionState);

      // Update list and save
      const updatedList = sessions.map(s => s.id === currentSession.id ? finalSessionState : s);
      setSessions(updatedList);
      
      if (isAnonymous) {
        localStorage.setItem('haven_anon_sessions', JSON.stringify(updatedList));
      } else {
        localStorage.setItem(`haven_sessions_${user}`, JSON.stringify(updatedList));
      }

    } catch (err) {
      console.error("Message request failed:", err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleEndSession = async () => {
    setShowEndSessionConfirm(false);
    if (!currentSession) return;

    setIsTyping(true);

    try {
      const res = await fetch(`${API_BASE}/api/anonymous/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: currentSession.messages })
      });
      if (res.ok) {
        const data = await res.json();
        const finalSessionState = {
          ...currentSession,
          isEnded: true,
          summary: data.summary,
          copingSteps: data.copingSteps
        };

        setCurrentSession(finalSessionState);

        const updatedList = sessions.map(s => s.id === currentSession.id ? finalSessionState : s);
        setSessions(updatedList);
        
        if (isAnonymous) {
          localStorage.setItem('haven_anon_sessions', JSON.stringify(updatedList));
        } else {
          localStorage.setItem(`haven_sessions_${user}`, JSON.stringify(updatedList));
        }
      }
    } catch (err) {
      console.error("Failed to generate summary:", err);
    } finally {
      setIsTyping(false);
    }
  };

  const handlePromptCardClick = (promptText) => {
    if (!currentSession || currentSession.isEnded) return;
    setChatInput(promptText);
  };

  // ==================== RENDER VIEWS ====================

  if (!user) {
    return (
      <div className="auth-wrapper">
        <div className="bg-blobs">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
          <div className="blob blob-3"></div>
        </div>

        <div className="auth-card">
          <div className="logo-container">
            <div className="logo-icon">🧠</div>
            <div className="logo-text">Haven AI Therapist</div>
          </div>

          <h2 className="auth-subtitle">
            {authScreen === 'login' 
              ? 'Compassionate emotional support & guided reflection, 24/7' 
              : 'Join a secure and confidential environment for growth'}
          </h2>

          {authError && <div className="auth-error">{authError}</div>}

          <form onSubmit={handleAuth}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input 
                id="username"
                type="text" 
                className="input-field" 
                placeholder="Enter username" 
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input 
                id="password" 
                type="password" 
                className="input-field" 
                placeholder="Enter password" 
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={isLoadingAuth}>
              {isLoadingAuth ? 'Please wait...' : authScreen === 'login' ? 'Login' : 'Sign Up'}
            </button>
          </form>

          <div className="divider">
            <span>or</span>
          </div>

          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={handleAnonymousAccess}
          >
            🛡️ Continue Anonymously
          </button>

          <p className="auth-toggle-text">
            {authScreen === 'login' ? "Don't have an account?" : "Already have an account?"}
            <span 
              className="auth-toggle-link"
              onClick={() => {
                setAuthScreen(authScreen === 'login' ? 'signup' : 'login');
                setAuthError('');
              }}
            >
              {authScreen === 'login' ? 'Sign Up' : 'Login'}
            </span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Background Animated Elements */}
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      {/* Safety Emergency Banner */}
      {crisisAlertActive && (
        <div className="emergency-banner">
          <div className="emergency-banner-content">
            <span className="emergency-icon">⚠️</span>
            <span>Crisis detected. Immediate support is available. You do not have to carry this alone.</span>
          </div>
          <div className="emergency-links">
            <a href="tel:988" className="emergency-link-btn">Call 988 Lifeline</a>
            <a href="https://www.findahelpline.com" target="_blank" rel="noreferrer" className="emergency-link-btn">Find Local Helplines</a>
          </div>
        </div>
      )}

      {/* Sidebar - Sessions History */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-icon">🧠</div>
            <div className="logo-text">Haven AI</div>
          </div>
        </div>

        <div className="new-chat-container">
          <button onClick={handleStartNewSession} className="btn btn-primary">
            ➕ New Therapy Session
          </button>
        </div>

        <div className="sessions-list-container">
          <h2 className="sessions-title">Past Sessions</h2>
          {sessions.length === 0 ? (
            <p className="no-sessions">
              No session history yet. Start a new session to begin your self-reflection journey.
            </p>
          ) : (
            sessions.map((session) => (
              <div 
                key={session.id} 
                className={`session-item ${currentSession?.id === session.id ? 'active' : ''}`}
                onClick={() => handleSelectSession(session)}
              >
                <div className="session-info">
                  <div className="session-name">{session.title}</div>
                  <div className="session-date">{new Date(session.createdAt).toLocaleDateString()}</div>
                </div>
                <button 
                  className="delete-session-btn" 
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  title="Delete Session"
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-profile-info">
              <div className="user-avatar">
                {isAnonymous ? 'A' : user.charAt(0).toUpperCase()}
              </div>
              <div className="user-details">
                <div className="username-display">{user}</div>
                <div className="user-type">{isAnonymous ? 'Private Anon Mode' : 'Registered Member'}</div>
              </div>
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Log Out">
              🚪
            </button>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-space">
        {!currentSession ? (
          <div className="chat-empty-state">
            <h1>Welcome to Haven, {user}</h1>
            <p>
              Your safe, empathetic, and completely private space for self-reflection. 
              Select a session from the sidebar or start a new conversation to connect with Haven.
            </p>
            <div className="suggestion-cards">
              <div 
                className="suggestion-card" 
                onClick={() => handlePromptCardClick("I've been feeling extremely stressed about school and work pressure recently.")}
              >
                <div className="suggestion-card-title">Manage Stress</div>
                <div className="suggestion-card-desc">"I've been feeling extremely stressed about school and work pressure recently."</div>
              </div>
              <div 
                className="suggestion-card" 
                onClick={() => handlePromptCardClick("I want to learn how to deal with relationships and set better emotional boundaries.")}
              >
                <div className="suggestion-card-title">Strengthen Boundaries</div>
                <div className="suggestion-card-desc">"I want to learn how to deal with relationships and set better emotional boundaries."</div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Space Header */}
            <div className="chat-header">
              <div className="chat-title-container">
                <span className="chat-current-title">{currentSession.title}</span>
                <div className="chat-status">
                  {currentSession.isEnded ? (
                    <span style={{ color: 'var(--text-muted)' }}>Session Concluded</span>
                  ) : (
                    <>
                      <span className="status-dot"></span>
                      <span>Empathetic listening active</span>
                    </>
                  )}
                </div>
              </div>

              <div className="chat-actions">
                {!currentSession.isEnded && (
                  <button 
                    onClick={() => setShowEndSessionConfirm(true)} 
                    className="btn-end-session"
                  >
                    ⏹️ End Session & Summarize
                  </button>
                )}
              </div>
            </div>

            {/* Message Thread */}
            <div className="messages-container">
              {currentSession.messages.length === 0 ? (
                <div className="chat-empty-state" style={{ flex: 1, padding: 0 }}>
                  <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>Start Your Conversation</h2>
                  <p style={{ fontSize: '14px', marginBottom: '20px' }}>
                    Speak freely about what is on your mind. Haven listens and responds supportively.
                  </p>
                  <div className="suggestion-cards">
                    <div 
                      className="suggestion-card"
                      onClick={() => handlePromptCardClick("I'm feeling a bit anxious and want to try a grounding exercise.")}
                    >
                      <div className="suggestion-card-title">Anxiety Grounding</div>
                      <div className="suggestion-card-desc">"I'm feeling a bit anxious and want to try a grounding exercise."</div>
                    </div>
                    <div 
                      className="suggestion-card"
                      onClick={() => handlePromptCardClick("I am having trouble processing some grief and loneliness lately.")}
                    >
                      <div className="suggestion-card-title">Process Grief</div>
                      <div className="suggestion-card-desc">"I am having trouble processing some grief and loneliness lately."</div>
                    </div>
                  </div>
                </div>
              ) : (
                currentSession.messages.map((msg) => (
                  <div key={msg.id} className={`message-wrapper ${msg.sender}`}>
                    <div className={`message-bubble ${msg.isCrisis ? 'crisis-bubble' : ''}`}>
                      {msg.text}
                      
                      {msg.isCrisis && msg.resources && (
                        <div className="crisis-resources-card">
                          <div className="crisis-resources-title">{msg.resources.message}</div>
                          <ul className="crisis-helplines-list">
                            {msg.resources.helplines.map((h, i) => (
                              <li key={i} className="crisis-helpline-item">
                                <strong>{h.name}</strong>: {h.details}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <span className="message-time">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))
              )}

              {isTyping && (
                <div className="message-wrapper therapist">
                  <div className="message-bubble">
                    <div className="typing-indicator">
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* End of Session Summary screen overlay */}
            {currentSession.isEnded && currentSession.summary && (
              <div className="summary-screen-overlay">
                <div className="summary-container">
                  <div className="summary-header">
                    <div className="summary-badge">Session Report</div>
                    <h2>Your Reflection Summary</h2>
                    <p>Concluded on {new Date(currentSession.createdAt).toLocaleDateString()}</p>
                  </div>

                  <div className="summary-section">
                    <h3 className="summary-section-title">Session Summary & Reflections</h3>
                    <div className="summary-box">
                      {currentSession.summary}
                    </div>
                  </div>

                  <div className="summary-section">
                    <h3 className="summary-section-title">Suggested Coping Strategies</h3>
                    <div className="coping-steps-grid">
                      {currentSession.copingSteps && currentSession.copingSteps.map((step, idx) => (
                        <div key={idx} className="coping-card">
                          <div className="coping-number">{idx + 1}</div>
                          <div className="coping-content">
                            <h3>{step.title}</h3>
                            <p>{step.instruction}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="summary-actions">
                    <button 
                      className="btn btn-primary" 
                      onClick={handleStartNewSession}
                    >
                      ➕ Start a New Session
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => window.print()}
                    >
                      🖨️ Export / Print Summary
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Chat Input Container */}
            {!currentSession.isEnded && (
              <div className="chat-input-container">
                <form onSubmit={handleSendMessage} className="chat-input-form">
                  <input 
                    type="text" 
                    className="chat-input"
                    placeholder={crisisAlertActive ? "Chat locked for your safety. Use crisis numbers." : "Share what is on your mind..."}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={isTyping || crisisAlertActive}
                  />
                  <button 
                    type="submit" 
                    className="btn-send"
                    disabled={!chatInput.trim() || isTyping || crisisAlertActive}
                    title="Send Message"
                  >
                    ➔
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </main>

      {/* Double Confirmation Modal to End Session */}
      {showEndSessionConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-icon warning">📝</div>
            <h2 className="modal-title">Conclude Therapy Session?</h2>
            <p className="modal-desc">
              Would you like to end your chat session now? Haven will analyze your conversation 
              and generate a compassionate summary with suggested coping exercises to support you.
            </p>
            <div className="modal-buttons">
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowEndSessionConfirm(false)}
                style={{ flex: 1 }}
              >
                Go Back
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleEndSession}
                style={{ flex: 1, background: 'var(--crisis-red)' }}
              >
                Yes, End Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crisis Warning Popup Modal */}
      {showEmergencyModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-icon warning">🚨</div>
            <h2 className="modal-title" style={{ color: 'var(--crisis-red)' }}>You are not alone. Help is here.</h2>
            <p className="modal-desc" style={{ textAlign: 'left' }}>
              We detected keywords suggesting you are experiencing a crisis. Please reach out to one of the following free, confidential, 24/7 resources immediately. 
              Our chat has been locked to encourage you to connect with human professionals who can support you.
            </p>
            
            <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
              <div style={{ marginBottom: '12px' }}>
                <strong style={{ color: 'var(--primary)' }}>988 Suicide & Crisis Lifeline:</strong>
                <div style={{ color: '#fff', fontSize: '15px', marginTop: '2px' }}>Call or text <strong>988</strong> (USA & Canada)</div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <strong style={{ color: 'var(--primary)' }}>Crisis Text Line:</strong>
                <div style={{ color: '#fff', fontSize: '15px', marginTop: '2px' }}>Text <strong>HOME to 741741</strong></div>
              </div>
              <div>
                <strong style={{ color: 'var(--primary)' }}>International Support:</strong>
                <div style={{ color: '#fff', fontSize: '15px', marginTop: '2px' }}>Find help in your country at <a href="https://www.findahelpline.com" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>www.findahelpline.com</a></div>
              </div>
            </div>

            <div className="modal-buttons">
              <button 
                className="btn btn-primary" 
                onClick={() => setShowEmergencyModal(false)}
                style={{ width: '100%' }}
              >
                I Understand, Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
