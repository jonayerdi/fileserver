// Imports
let http = require('http');
let https = require('https');
let path = require('path');
let fs = require('fs');
let express = require('express');
let app = express();
let mime = require('mime');
let socket_io = require('socket.io');
let passport = require('passport'), PassportLocalStrategy = require('passport-local').Strategy;

// Constants
const HTTP_PORT = 80;
const HTTPS_PORT = 443;
const STATICFILES = '/static';
const FILESYSTEM = path.normalize(path.join(__dirname, process.argv.length > 2 ? process.argv[1] : 'files'));
const HTTPS_OPTIONS = {
    key: fs.readFileSync(path.join(__dirname, 'cert', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert', 'certificate.crt')),
};

// Functions
function fullpath2relpath(fullpath) {
    return path.relative(FILESYSTEM, fullpath);
}
function relpath2fullpath(relpath) {
    return path.normalize(path.join(FILESYSTEM, relpath));
}
function url2relpath(url) {
    return path.join.apply(null, url.split("/"));
}
function relpath2url(relpath) {
    return relpath.split(path.sep).join("/");
}
function canAccessPath(relpath) {
    const fullpath = path.normalize(path.join(FILESYSTEM, relpath));
    return fullpath.startsWith(FILESYSTEM);
}
function getFromFilesystem(relpath, callback) {
    const fullpath = relpath2fullpath(relpath);
    if(canAccessPath(fullpath)) {
        fs.stat(fullpath, (err, stats) => {
            if(err) {
                callback(new Error(`Cannot stat ${relpath}`));
            } else {
                if(stats.isDirectory()) {
                    fs.readdir(fullpath, {withFileTypes: true}, (err, dirents) => {
                        if(err) {
                            callback(err);
                        } else {
                            let entries = []
                            dirents.forEach((dirent) => {
                                let filerelpath = path.join(relpath, dirent.name);
                                if(dirent.isDirectory()) {
                                    entries.push({type: "directory", url: relpath2url(filerelpath), relpath: filerelpath, name: dirent.name});
                                } else if(dirent.isFile()) {
                                    entries.push({type: "file", url: relpath2url(filerelpath), relpath: filerelpath, name: dirent.name});
                                }
                            });
                            callback(null, {
                                type: "directory", 
                                relpath: relpath,
                                entries: entries
                            });
                        }
                    });
                } else if(stats.isFile()) {
                    callback(null, {
                        type: "file",
                        relpath: relpath,
                        fullpath: fullpath,
                        stat: stats
                    });
                } else {
                    callback(new Error('Invalid path argument: Not a file or directory'));
                }
            }
        });
    } else {
        callback(new Error('Invalid path argument: Permission denied'));
    }
}

// Passport setup
passport.use(new PassportLocalStrategy(
    (username, password, done) => {
        if (username != "admin") {
          return done(null, false, { message: 'Incorrect username' });
        }
        if (password != "1234") {
          return done(null, false, { message: 'Incorrect password' });
        }
        return done(null, "admin");
    }
));

// Servers
let server = https.createServer(HTTPS_OPTIONS, app);
io = socket_io(server);

// Static files
app.use(STATICFILES, express.static(path.join(__dirname, 'static')));

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// GET
app.get('/*', (req, res) => {
    res.setHeader("cache-control", "no-cache");
    res.setHeader("Content-Security-Policy", "default-src 'self'; connect-src *");
    reqpath = url2relpath(req.url);
    parentpath = path.join(reqpath, "..");
    getFromFilesystem(reqpath, (err, result) => {
        if(result.type == "file") {
            res.writeHead(200, {
                'Content-Type': mime.getType(path.extname(result.fullpath)),
                'Content-Length': result.stat.size
            });
            let readStream = fs.createReadStream(result.fullpath);
            readStream.pipe(res);
        } else {
            res.render('index', {
                STATICFILES: STATICFILES, 
                PATH: reqpath, 
                PARENTPATH: canAccessPath(parentpath) ? parentpath : null, 
                ERROR: err, 
                RESULT: result
            });
        }
    });
});

// POST
app.post('/login', passport.authenticate('local', { successRedirect: '/',
                                                    failureRedirect: '/login',
                                                    successFlash: 'Logged in',
                                                    failureFlash: 'Invalid username or password' }));

// WebSocket
io.on('connection', (client) => {
    console.log(`websocket connected: ${client.conn.remoteAddress}`);
    client.on('event', (data) => {
        console.log(`websocket event: ${client.conn.remoteAddress}\n${data}`);
    });
    client.on('disconnect', () => {
        console.log(`websocket disconnected: ${client.conn.remoteAddress}`);
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
