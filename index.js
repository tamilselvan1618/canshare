// Add this so you can verify the server is running in your browser
app.get('/', (req, res) => {
    res.send('Quick Share Signaling Server is Running!');
});


const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Store active rooms. Key: 6-digit code, Value: { senderId, receiverId }
const rooms = new Map();

// Helper to generate 6 digit code
function generateCode() {
    let code;
    do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms.has(code));
    return code;
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Sender creates a room
    socket.on('create-room', () => {
        const roomCode = generateCode();
        rooms.set(roomCode, { senderId: socket.id, receiverId: null });
        socket.join(roomCode);
        socket.emit('room-created', { roomCode });
        console.log(`Room ${roomCode} created by ${socket.id}`);
    });

    // Receiver joins a room
    socket.on('join-room', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room && !room.receiverId) {
            room.receiverId = socket.id;
            rooms.set(roomCode, room);
            socket.join(roomCode);
            
            socket.emit('room-joined', { success: true });
            // Notify sender that receiver has arrived
            io.to(room.senderId).emit('receiver-joined', { receiverId: socket.id });
            console.log(`User ${socket.id} joined room ${roomCode}`);
        } else {
            socket.emit('room-joined', { success: false, message: 'Invalid or full code' });
        }
    });

    // WebRTC Signaling Relay
    socket.on('signal', (data) => {
        // data contains { targetId, signalData }
        io.to(data.targetId).emit('signal', {
            senderId: socket.id,
            signalData: data.signalData
        });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Cleanup rooms if sender or receiver disconnects
        for (const [code, room] of rooms.entries()) {
            if (room.senderId === socket.id || room.receiverId === socket.id) {
                io.to(code).emit('peer-disconnected');
                rooms.delete(code);
                console.log(`Room ${code} destroyed`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});