import { WebSocketServer } from 'ws';
import http from 'http';
import jwt from 'jsonwebtoken';
import { parse } from 'url';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const cleanContent = envContent.replace(/^\uFEFF/g, '').replace(/\0/g, '').replace(/\r/g, '');
    cleanContent.split('\n').forEach(line => {
        const cleanLine = line.trim();
        if (cleanLine && !cleanLine.startsWith('#') && cleanLine.includes('=')) {
            const separatorIndex = cleanLine.indexOf('=');
            const key = cleanLine.substring(0, separatorIndex).trim().replace(/[^\x20-\x7E]/g, '');
            const val = cleanLine.substring(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
            process.env[key] = val;
        }
    });
}

const port = process.env.PORT || 4444;

const server = http.createServer((req, res) => {
    // Enable CORS for the frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url.startsWith('/verify')) {
        const urlParams = parse(req.url, true);
        const token = urlParams.query.token;

        if (process.env.REQUIRE_LICENSE === 'true') {
            if (!token) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing token' }));
                return;
            }
            try {
                jwt.verify(token, process.env.JWT_SECRET);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid token' }));
            }
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'License validation disabled' }));
        }
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Steel Signaling Server OK');
});

const wss = new WebSocketServer({ noServer: true });

/** @type {Map<string, Set<any>>} */
const topics = new Map();

const send = (conn, message) => {
    if (conn.readyState !== 0 && conn.readyState !== 1) {
        conn.close();
        return;
    }
    try {
        conn.send(JSON.stringify(message));
    } catch (e) {
        conn.close();
    }
};

wss.on('connection', (conn) => {
    const subscribedTopics = new Set();
    let closed = false;
    let pongReceived = true;

    const pingInterval = setInterval(() => {
        if (!pongReceived) {
            conn.close();
            clearInterval(pingInterval);
        } else {
            pongReceived = false;
            try { conn.ping(); } catch (e) { conn.close(); }
        }
    }, 30000);

    conn.on('pong', () => { pongReceived = true; });

    conn.on('close', () => {
        subscribedTopics.forEach(topicName => {
            const subs = topics.get(topicName);
            if (subs) {
                subs.delete(conn);
                if (subs.size === 0) topics.delete(topicName);
            }
        });
        subscribedTopics.clear();
        closed = true;
        clearInterval(pingInterval);
    });

    conn.on('message', (raw) => {
        const message = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
        if (!message || !message.type || closed) return;

        switch (message.type) {
            case 'subscribe':
                (message.topics || []).forEach(topicName => {
                    if (typeof topicName !== 'string') return;
                    if (!topics.has(topicName)) topics.set(topicName, new Set());
                    topics.get(topicName).add(conn);
                    subscribedTopics.add(topicName);
                });
                break;
            case 'unsubscribe':
                (message.topics || []).forEach(topicName => {
                    const subs = topics.get(topicName);
                    if (subs) subs.delete(conn);
                });
                break;
            case 'publish':
                if (message.topic) {
                    const receivers = topics.get(message.topic);
                    if (receivers) {
                        message.clients = receivers.size;
                        receivers.forEach(receiver => send(receiver, message));
                    }
                }
                break;
            case 'ping':
                send(conn, { type: 'pong' });
                break;
        }
    });
});

server.on('upgrade', (request, socket, head) => {
    const { query } = parse(request.url, true);

    // Official service protection
    if (process.env.REQUIRE_LICENSE === 'true') {
        const token = query.token;
        if (!token) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        try {
            // Verify JWT signature using internal secret
            jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            console.log(`[AUTH] Rejecting invalid token from ${request.socket.remoteAddress}`);
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
        }
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

server.listen(port, () => {
    console.log(`Steel Signaling Server running on port ${port}`);
});
