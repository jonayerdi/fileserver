// Imports
let express = require('express');
let app = express();
let http = require('http');
let https = require('https');
let socket_io = require('socket.io');
let path = require('path');
let fs = require('fs');

// Constants
const HTTP_PORT = 80;
const HTTPS_PORT = 443;
const STATICFILES = '/static';
const FILESYSTEM = (path.join(__dirname, process.argv.length > 2 ? process.argv[1] : 'files'));
const HTTPS_OPTIONS = {
    key: fs.readFileSync(path.join(__dirname, 'cert', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert', 'certificate.crt')),
};

// Servers
let server = https.createServer(HTTPS_OPTIONS, app);
io = socket_io(server);

// Static files
app.use(STATICFILES, express.static(path.join(__dirname, 'static')));

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// GET
app.get('/', (req, res) => {
    res.setHeader("Content-Security-Policy", "default-src 'self';");
    res.render('index', {STATICFILES: STATICFILES});
});

// WebSocket
io.on('connection', (client) => {
    console.log(`socket.io connected: ${client}`);
    client.on('event', (data) => {
        console.log(`socket.io event: ${client}\n${data}`);
    });
    client.on('disconnect', () => {
        console.log(`socket.io disconnected: ${client}`);
    });
});

// HTTPS Server
server.listen(HTTPS_PORT, () => {
    console.log(`Server started at port ${HTTPS_PORT}`);
});

// HTTP redirects to HTTPS
http.createServer((req, res) => {
    res.writeHead(301, { "Location": `https://${req.headers.host}${req.url}` });
    res.end();
}).listen(HTTP_PORT);

// Filesystem Watch
fs.watch(FILESYSTEM, { recursive: true }, (eventType, filename) => {
    console.log(`${filename}: ${eventType}`);
    switch(eventType) {
        case 'rename':
            if(fs.existsSync(path.join(FILESYSTEM, filename))) {
                io.emit('fschange', {action: 'add', filename: filename})
            } else {
                io.emit('fschange', {action: 'remove', filename: filename})
            }
            break;
        case 'change':
            break;
        default:
            break;
    }
});
