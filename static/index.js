let socket = io();

socket.on('connect', () => {
    console.log('WebSocket connected');
});

socket.on('fschange', (data) => {
    console.log(`WebSocket event: ${data}`);
});

socket.on('disconnect', () => {
    console.log('WebSocket disconnected');
});
