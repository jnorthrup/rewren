/**
 * Tmux Workspace Manager - MDI Client
 */

class TmuxWorkspace {
    constructor() {
        this.windows = new Map();
        this.activeWindow = null;
        this.nextWindowId = 1;
        this.zIndex = 1;

        this.workspace = document.getElementById('workspace');
        this.setupWebSocket();
        this.loadSessions();
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}`);

        this.ws.onopen = () => {
            this.updateStatus('Connected');
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };

        this.ws.onclose = () => {
            this.updateStatus('Disconnected');
            setTimeout(() => this.setupWebSocket(), 3000);
        };
    }

    handleMessage(message) {
        switch (message.type) {
            case 'pane-output':
                this.appendOutput(message.sessionName, message.paneId,
                                 atob(message.data));
                break;
            case 'session-created':
                this.loadSessions();
                break;
        }
    }

    async createSession(name) {
        const sessionName = name || `session-${Date.now()}`;

        try {
            const response = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: sessionName,
                    width: 120,
                    height: 40
                })
            });

            const session = await response.json();
            await this.openSessionWindow(session);
            this.updateStatus(`Created session: ${sessionName}`);
        } catch (error) {
            console.error('Failed to create session:', error);
            this.updateStatus('Error creating session');
        }
    }

    async openSessionWindow(session) {
        const windowId = `window-${this.nextWindowId++}`;

        const window = document.createElement('div');
        window.className = 'tmux-window';
        window.id = windowId;
        window.dataset.sessionName = session.name;
        window.style.left = `${50 + (this.windows.size * 30)}px`;
        window.style.top = `${50 + (this.windows.size * 30)}px`;
        window.style.width = '600px';
        window.style.height = '400px';

        window.innerHTML = `
            <div class="window-header">
                <span class="window-title">${session.name}</span>
                <div class="window-controls">
                    <button class="window-control-btn minimize"></button>
                    <button class="window-control-btn maximize"></button>
                    <button class="window-control-btn close"></button>
                </div>
            </div>
            <div class="window-content">
                <div class="pane-container">
                    <div class="terminal-output"></div>
                </div>
                <div class="input-bar">
                    <input type="text" placeholder="Enter command..."
                           onkeypress="if(event.key==='Enter') sendCommand('${session.name}', this.value, this)">
                    <button onclick="splitPane('${session.name}', 'h')">Split H</button>
                    <button onclick="splitPane('${session.name}', 'v')">Split V</button>
                </div>
            </div>
            <div class="resize-handle right"></div>
            <div class="resize-handle bottom"></div>
            <div class="resize-handle corner"></div>
        `;

        this.workspace.appendChild(window);
        this.windows.set(windowId, { element: window, session });

        this.setupWindowDragging(window);
        this.setupWindowResize(window);
        this.setupWindowControls(window, windowId);
        this.makeWindowActive(window);

        // Start streaming output
        if (session.panes && session.panes.length > 0) {
            this.ws.send(JSON.stringify({
                type: 'stream-pane',
                sessionName: session.name,
                paneId: session.panes[0].id
            }));
        }

        this.updateWindowCount();
    }

    setupWindowDragging(window) {
        const header = window.querySelector('.window-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('window-control-btn')) return;

            isDragging = true;
            window.classList.add('dragging');
            startX = e.clientX;
            startY = e.clientY;
            startLeft = window.offsetLeft;
            startTop = window.offsetTop;
            this.makeWindowActive(window);
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            window.style.left = `${startLeft + dx}px`;
            window.style.top = `${startTop + dy}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                window.classList.remove('dragging');
            }
        });
    }

    setupWindowResize(window) {
        const handles = window.querySelectorAll('.resize-handle');

        handles.forEach(handle => {
            let isResizing = false;
            let startX, startY, startWidth, startHeight;

            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                isResizing = true;
                startX = e.clientX;
                startY = e.clientY;
                startWidth = window.offsetWidth;
                startHeight = window.offsetHeight;
            });

            document.addEventListener('mousemove', (e) => {
                if (!isResizing) return;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                if (handle.classList.contains('right') || handle.classList.contains('corner')) {
                    window.style.width = `${Math.max(300, startWidth + dx)}px`;
                }
                if (handle.classList.contains('bottom') || handle.classList.contains('corner')) {
                    window.style.height = `${Math.max(200, startHeight + dy)}px`;
                }
            });

            document.addEventListener('mouseup', () => {
                isResizing = false;
            });
        });
    }

    setupWindowControls(window, windowId) {
        const closeBtn = window.querySelector('.close');
        const minimizeBtn = window.querySelector('.minimize');
        const maximizeBtn = window.querySelector('.maximize');

        closeBtn.addEventListener('click', () => {
            window.remove();
            this.windows.delete(windowId);
            this.updateWindowCount();
        });

        minimizeBtn.addEventListener('click', () => {
            window.style.display = 'none';
        });

        maximizeBtn.addEventListener('click', () => {
            if (window.style.width === '100%') {
                window.style.width = '600px';
                window.style.height = '400px';
                window.style.left = '50px';
                window.style.top = '50px';
            } else {
                window.style.width = '100%';
                window.style.height = 'calc(100% - 20px)';
                window.style.left = '0';
                window.style.top = '0';
            }
        });
    }

    makeWindowActive(window) {
        document.querySelectorAll('.tmux-window').forEach(w => {
            w.classList.remove('active');
        });
        window.classList.add('active');
        window.style.zIndex = ++this.zIndex;
        this.activeWindow = window;
    }

    cascadeWindows() {
        let x = 50, y = 50;
        this.windows.forEach(({ element }) => {
            element.style.left = `${x}px`;
            element.style.top = `${y}px`;
            element.style.width = '600px';
            element.style.height = '400px';
            x += 30;
            y += 30;
        });
    }

    tileWindows() {
        const count = this.windows.size;
        if (count === 0) return;

        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);

        const width = Math.floor(this.workspace.offsetWidth / cols);
        const height = Math.floor(this.workspace.offsetHeight / rows);

        let index = 0;
        this.windows.forEach(({ element }) => {
            const col = index % cols;
            const row = Math.floor(index / cols);

            element.style.left = `${col * width}px`;
            element.style.top = `${row * height}px`;
            element.style.width = `${width - 4}px`;
            element.style.height = `${height - 4}px`;

            index++;
        });
    }

    appendOutput(sessionName, paneId, data) {
        this.windows.forEach(({ element, session }) => {
            if (session.name === sessionName) {
                const output = element.querySelector('.terminal-output');
                output.textContent += data;

                // Auto-scroll
                const container = element.querySelector('.pane-container');
                container.scrollTop = container.scrollHeight;
            }
        });
    }

    async loadSessions() {
        try {
            const response = await fetch('/api/sessions');
            const sessions = await response.json();

            const select = document.getElementById('session-list');
            select.innerHTML = '<option>Select Session...</option>';

            sessions.forEach(session => {
                const option = document.createElement('option');
                option.value = session.name;
                option.textContent = `${session.name} (${session.windows} windows)`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load sessions:', error);
        }
    }

    updateStatus(text) {
        document.getElementById('status-text').textContent = text;
    }

    updateWindowCount() {
        document.getElementById('window-count').textContent =
            `${this.windows.size} window${this.windows.size !== 1 ? 's' : ''}`;
    }
}

// Global instance
const workspace = new TmuxWorkspace();

// Global functions
function createSession() {
    const name = prompt('Session name:', `test-${Date.now()}`);
    if (name) workspace.createSession(name);
}

function cascadeWindows() {
    workspace.cascadeWindows();
}

function tileWindows() {
    workspace.tileWindows();
}

function sendCommand(sessionName, command, input) {
    if (!command.trim()) return;

    workspace.ws.send(JSON.stringify({
        type: 'send-command',
        sessionName,
        paneId: '%0', // TODO: Track actual pane ID
        command
    }));

    input.value = '';
}

async function splitPane(sessionName, direction) {
    try {
        await fetch(`/api/sessions/${sessionName}/panes/%0/split`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction })
        });
    } catch (error) {
        console.error('Failed to split pane:', error);
    }
}

async function runRobotDemo() {
    const sessionName = `robot-demo-${Date.now()}`;
    await workspace.createSession(sessionName);

    setTimeout(() => {
        sendCommand(sessionName,
                   'cd /Users/jim/work/wren3 && npm run robot',
                   { value: '' });
    }, 1000);
}

async function runQAScript() {
    const sessionName = `qa-${Date.now()}`;
    await workspace.createSession(sessionName);

    setTimeout(() => {
        sendCommand(sessionName,
                   'cd /Users/jim/work/wren3 && npm run robot -- --script scripts/qa-scripts/full-workflow.json --speed 3000',
                   { value: '' });
    }, 1000);
}

function switchSession(name) {
    if (!name || name === 'Select Session...') return;
    // TODO: Attach to existing session
}
