//importing shit!
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var fs = require('fs');
//Database - search and filter
var mongoose = require('mongoose');
//Session
var MongoStore = require('connect-mongo')(session);
//Templating
var Handlebars = require('handlebars');
//Credentials
var creds = require('./credentials');
//Note classes and stuff
var Note = require('./note');

mongoose.connect('mongodb://localhost/integrid');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function (callback) {
	//when i get connection to database
	console.log("opened!");
	var userSchema = mongoose.Schema({
		google: {
			userId: String,
			accessToken: String,
			refreshToken: String,
			email: String
		},
		workspaces: [String],
		notes: [{noteId:String, source:String, sourceTitle: String, title: String}],
		notifs: [String],
		home: String
	});
	var workspaceSchema = mongoose.Schema({
		name: String,
		notes: [{
			noteId:String,
			title: String,
			stored: Boolean,
			x: Number,
			y: Number,
			width: Number,
			height: Number,
			zIndex: Number
		}],
		storage: {
			x: Number,
			y: Number,
			width: Number,
			height: Number,
			zIndex: Number
		},
		user: String
	});
	var noteSchema = mongoose.Schema({
		title: String,
		content: String,
		typeNote: String,
		subType: String,
		users: [String]
	});
	Workspace = mongoose.model('Workspace', workspaceSchema);
	User = mongoose.model('User', userSchema);
	NoteModel = mongoose.model('NoteModel', noteSchema);
});
//Authentication
var passport = require('passport');
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
//Creating server
var http = require('http').Server(app);
//Websocket
var browserChannel = require("browserchannel").server;
var User;
var Workspace;
var antot = require('./antot');
var NoteModel;
//Post request data
app.use(express.static(__dirname+'/public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
//Cookies
app.use(cookieParser());
var ms = new MongoStore({ mongooseConnection: mongoose.connection });
app.use(session({secret: "dogfish", resave:false, store: ms}));
app.use(passport.initialize());
app.use(passport.session());
var ss = [];
app.use(browserChannel(function(client,req) {
	var user = req.user;
	client.on('message', function(data) {
		var noteId = data.noteId;
		if(noteId) {
			if(data.type=="text") {
				NoteModel.findById(noteId, function(err, note) {
					if(err) {
						console.log(err);
						client.send({err:"Error!"});
						return;
					}
					if(!note) {
						client.send({err:"Note not found!"});
						return;
					}
					if(note.users.indexOf(user.google.userId)<0) {
						client.send({err:"Not Authorized!"});
						return;
					}
					if(note.typeNote!="user"&&note.typeNote!="code") {
						client.send({err:"Not Authorized!"});
						return;
					}
					if(!ss[noteId]) {
						ss[noteId] = new NoteServer(noteId, note.content);
					}
					ss[noteId].connection(client);
				});
			}
		}
	});
}));
Client = function(client, server) {
	this.client = client;
	this.server = server;
	this.client.on("message", function(data) {
		this.server.onMessage(this, data);
		clearTimeout(this.server.timer);
		this.server.timer = setTimeout(this.server.save,5000);
	}.bind(this));
	this.client.on("close", function() {
		this.server.onDisconnect(this);
	}.bind(this));
	this.sendMessage = function(data) {
		client.send(JSON.stringify(data));
	}
}
function NoteServer(noteId, content) {
	antot.Server.call(this, content);
	this.noteId = noteId;
	this.timer = null;
	this.save = function() {
		NoteModel.findById(this.noteId, function(err, note) {
			if(err) {
				console.log(err);
				return;
			}
			if(!note) {
				console.log("Note not found!");
				return;
			}
			if(note.typeNote!="user"&&note.typeNote!="code") {
				console.log("Not Authorized!");
				return;
			}
			note.set("content", JSON.stringify(this.getState()));
			note.save(function(err) {
				if(err) {
					console.log(err);
				}
				else {
					console.log("Saved "+note.title);
				}
			});
		}.bind(this));
	}.bind(this);
	this.connection = function(client) {
		client = new Client(client, this)
		this.onConnection(client);
	}
}
var template;
var noteTemplate;
var noteWrapper;
var storedTemplate;
var sharedTemplate;
function updateTemplates() {
	fs.readFile('static/'+'index.html', function(err, html) {
		if(err) {
			console.log('Error reading index file: ' + err);
			return;
		}
		template = Handlebars.compile(html+"");
	});
	fs.readFile('static/'+'note.html', function(err, html) {
		if(err) {
			console.log('Error reading note file: ' + err);
			return;
		}
		noteTemplate = Handlebars.compile(html+"");
	});
	fs.readFile('static/'+'notewrapper.html', function(err, html) {
		if(err) {
			console.log('Error reading note file: ' + err);
			return;
		}
		noteWrapper = Handlebars.compile(html+"");
	});
	fs.readFile('static/'+'stored.html', function(err, html) {
		if(err) {
			console.log('Error reading note file: ' + err);
			return;
		}
		storedTemplate = Handlebars.compile(html+"");
	});
	fs.readFile('static/'+'shared.html', function(err, html) {
		if(err) {
			console.log("Error reading shared file: " +err);
		}
		sharedTemplate = Handlebars.compile(html+"");
	});
}
updateTemplates();
passport.serializeUser(function(user, done) {
	done(null, user.id);
});

passport.deserializeUser(function(id, done) {
	User.findById(id, function(err, user) {
		done(err, user);
	})
});

passport.use(new GoogleStrategy({
		clientID: creds.google_client_id,
		clientSecret: creds.google_client_secret,
		callbackURL: "http://127.0.0.1:3000/auth/google/callback",
		passReqToCallback : true
	},
	function(req, accessToken, refreshToken, profile, done) {
		process.nextTick(function() {
			if(!req.user) {
				User.findOne({"google.userId": profile.id}, function(err, user) {
					if(err) return done(err);
					if(user) {
						user.google.accessToken = accessToken;
						user.google.refreshToken = refreshToken;
						user.google.email = profile.emails[0].value;
						user.save(function(err) {
							if (err) return done(err);
							return done(null,user);
						});
					}
					else {
						var nuser = new User();
						nuser.google.userId = profile.id;
						nuser.google.email = profile.emails[0].value;
						nuser.google.accessToken = accessToken;
						nuser.google.refreshToken = refreshToken;
						var note = new Note.TextNote("Welcome to Intregrid!", "This is your homepage to the Internet!");
						note.users.push(profile.id);
						var noteModel = new NoteModel(note);
						noteModel.save(function(err) {
							if(err) return done(err);
							var workspace = new Workspace({
								name: "General",
								notes: [{
									noteId: noteModel.id,
									title: noteModel.title,
									stored: false,
									x: 0,
									y: 0,
									width: 20,
									height: 20,
									zIndex: 0
								}],
								user: profile.id,
								storage: {
									x:80,
									y:20,
									height: 30,
									width: 20,
									zIndex: 1
								}
							});
							workspace.save(function(err) {
								if(err) return done(err);
								nuser.workspaces.push(workspace.id);
								nuser.markModified("workspaces");
								nuser.home = workspace.id;
								nuser.notes.push({source:workspace.id, sourceTitle: workspace.name, noteId: noteModel.id, title: noteModel.title});
								nuser.save(function(err) {
									return done(null, nuser);
								});
							});
						});
					}
				});
			}
			else {
				var user = req.user;
				if(user.google.userId == profile.id) {
					user.google.accessToken = accessToken;
					user.google.refreshToken = refreshToken;
					user.google.email = profile.emails[0].value;
					user.save(function(err) {
						if(err) return done(err);
						return done(null, user);
					});
				}
				else {
					User.findOne({"google.userId": profile.id}, function(err, wuser) {
						if(err) return done(err);
						if(wuser) return done(null, wuser);
						var nuser = new User();
						nuser.google.userId = profile.id;
						nuser.google.accessToken = accessToken;
						nuser.google.refreshToken = refreshToken;
						nuser.google.email = profile.emails[0].value;
						var note = new Note.TextNote("Welcome to Intregrid!", "This is your homepage to the Internet!");
						note.users.push(profile.id);
						var noteModel = new NoteModel(note);
						noteModel.save(function(err) {
							if(err) return done(err);
							var workspace = new Workspace({
								name: "General",
								notes: [{
									noteId: noteModel.id,
									title: noteModel.title,
									stored: false,
									x: 0,
									y: 0,
									width: 20,
									height: 20,
									zIndex: 0
								}],
								user: profile.id,
								storage: {
									x:80,
									y:20,
									height: 30,
									width: 20,
									zIndex: 1
								}
							});
							workspace.save(function(err) {
								if(err) return done(err);
								nuser.workspaces.push(workspace.id);
								nuser.markModified("workspaces");
								nuser.home = workspace.id;
								nuser.notes.push({source:workspace.id, sourceTitle: workspace.name, noteId: noteModel.id, title: noteModel.title});
								nuser.save(function(err) {
									return done(null, nuser);
								});
							});
						});
					});
				}
			}
		});
	}
));
function forEachNext(arr, index, callback, finalCall) {
	if(index<arr.length) {
		function next() {
			return forEachNext(arr, index+1,callback, finalCall);
		}
		callback(arr[index], index, next);
	}
	else {
		finalCall();
	}
}
function ensureAuthenticated(req, res, next) {
	if (req.isAuthenticated()) { return next(); }
	res.redirect('/auth/google');
}

//Google authentication
app.get('/auth/google', passport.authenticate('google', { scope: ['profile','email','https://www.googleapis.com/auth/gmail.readonly'] }), function(req, res){});
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), function(req, res) {
	res.redirect('/home');
});

function getHTMLNote(note, user, callback) {
	var obj = {};
	obj.title = note.title;
	obj.x = note.x || 0;
	obj.y = note.y || 0;
	obj.width = note.width || 20;
	obj.height = note.height || 20;
	obj.id = note.id;
	obj.type = note.typeNote;
	obj.subType = note.subType;
	obj.zIndex = note.zIndex || 0;
	Note.handleContent(note, user, function(err, content) {
		if(err) {
			console.log(err);
			obj.content = "There was an error!";
		}
		else {
			obj.content = content;
		}
		var result = noteTemplate(obj);
		callback(err, result);
	});
}

//Website
app.get('/', function(req, res){
	res.send('<h1>Hello world</h1>');
});
app.get('/home', ensureAuthenticated, function(req, res) {
	var user = req.user;
	Workspace.findById(user.home, function(err, workspace) {
		if(err) {
			console.log(err);
			res.send("Error!");
			return;
		}
		if(!workspace) {
			res.send("Workspace not found!");
			return;
		}
		if(workspace.user!=user.google.userId) {
			res.send("Not Authorized!");
			return;
		}
		var notes = [];
		forEachNext(workspace.notes, 0, function(noteData, index, next) {
			if(!noteData.stored) {
				var noteId = noteData.noteId;
				NoteModel.findById(noteId, function(err, note) {
					if(err) {
						console.log(err);
						res.send("Error!");
						return;
					}
					if(!note) {
						res.send("Note not found!");
						return;
					}
					if(note.users.indexOf(user.google.userId)<0) {
						next();
					}
					else {
						var obj = {};
						obj.title = note.title;
						obj.x = noteData.x;
						obj.y = noteData.y;
						obj.width = noteData.width;
						obj.height = noteData.height;
						obj.id = note.id;
						obj.type = note.typeNote;
						obj.zIndex = noteData.zIndex;
						obj.content = "Loading...";
						notes.push(obj);
						next();
					}
				});
			}
			else {
				next();
			}
		}, function() {
			var data = {"notes":notes, "workspaceId":user.home, "storage":workspace.storage, "home": true};
			var result = template(data);
			res.send(result);
		});
	});
});
app.get('/home/:id', ensureAuthenticated, function(req, res){
	var workspaceId = req.params.id;
	var user = req.user;
	Workspace.findById(workspaceId, function(err, workspace) {
		if(err) {
			console.log(err);
			res.send("Error!");
			return;
		}
		if(!workspace) {
			res.send("Workspace not found!");
			return;
		}
		if(workspace.user!=user.google.userId) {
			res.send("Not Authorized!");
			return;
		}
		var notes = [];
		forEachNext(workspace.notes, 0, function(noteData, index, next) {
			if(!noteData.stored) {
				var noteId = noteData.noteId;
				NoteModel.findById(noteId, function(err, note) {
					if(err) {
						console.log(err);
						res.send("Error!");
						return;
					}
					if(!note) {
						res.send("Note not found!");
						return;
					}
					if(note.users.indexOf(user.google.userId)<0) {
						next();
					}
					else {
						var obj = {};
						obj.title = note.title;
						obj.x = noteData.x;
						obj.y = noteData.y;
						obj.width = noteData.width;
						obj.height = noteData.height;
						obj.id = note.id;
						obj.type = note.typeNote;
						obj.zIndex = noteData.zIndex;
						obj.content = "Loading...";
						notes.push(obj);
						next();
					}
				});
			}
			else {
				next();
			}
		}, function() {
			var data = {"notes":notes, "workspaceId":workspaceId, "storage":workspace.storage, "home":workspaceId!=user.home};
			var result = template(data);
			res.send(result);
		});
	});
});
app.post('/getNote', ensureAuthenticated, function(req, res) {
	var user = req.user;
	var noteId = req.body.id;
	NoteModel.findById(noteId, function(err, note) {
		if(err) {
			console.log(err);
			res.send("Error!");
			return;
		}
		if(!note) {
			res.send("Note not found!");
			return;
		}
		if(note.users.indexOf(user.google.userId)<0) {
			res.send("Not Authorized!");
			return;
		}
		Note.handleContent(note, user, function(err, content) {
			if(err) {
				console.log(err);
				res.send("There was an error!");
			}
			else {
				res.send(content);
			}
		});
	});
});
app.post('/getNoteHTML/:id', ensureAuthenticated, function(req, res) {
	var user = req.user;
	var noteId = req.body.id;
	var workspaceId = req.params.id;
	Workspace.findById(workspaceId, function(err, workspace) {
		if(err) {
			console.log(err);
			res.send("Error!");
			return;
		}
		if(!workspace) {
			res.send("Workspace not found!");
			return;
		}
		if(workspace.user!=user.google.userId) {
			res.send("Not Authorized!");
			return;
		}
		var noteData = workspace.notes.filter(function(obj) {
			return obj.noteId==noteId;
		})
		NoteModel.findById(noteId, function(err, note) {
			if(err) {
				console.log(err);
				res.send("Error!");
				return;
			}
			if(!note) {
				res.send("Note not found!");
				return;
			}
			if(note.users.indexOf(user.google.userId)<0) {
				res.send("Not Authorized!");
				return;
			}
			note.x = noteData.x;
			note.y = noteData.y;
			note.width = noteData.width;
			note.height = noteData.height;
			note.zIndex = noteData.zIndex;
			getHTMLNote(note, user, function(err, content) {
				if(err) {
					console.log(err);
					res.send("There was an error!");
				}
				else {
					res.send(content);
				}
			});
		});
	});
});
app.post('/updateGeology/:id', ensureAuthenticated, function(req, res){
	var noteId = req.body.id;
	var workspaceId = req.params.id;
	var newX = req.body.x;
	var newY = req.body.y;
	var newWidth = req.body.width;
	var newHeight = req.body.height;
	var index = req.body.zIndex;
	var user = req.user;
	Workspace.findById(workspaceId, function(err, workspace) {
		console.log("received");
		if(err) {
			console.log(err);
			res.send("Error!");
			return;
		}
		if(!workspace) {
			res.send("Workspace not found!");
			return;
		}
		if(workspace.user!=user.google.userId) {
			res.send("Not Authorized!");
			return;
		}
		if(noteId=="storage") {
			var storage = workspace.storage;
			storage.x = newX;
			storage.y = newY;
			storage.width = newWidth;
			storage.height = newHeight;
			storage.zIndex = index;
			workspace.save(function(err) {
				res.send("Saved storage");
				return;
			});
		}
		else {
			var note = workspace.notes.filter(function(obj) {
				return obj.noteId==noteId;
			})[0];
			if(!note) {
				res.send("Note not found!");
				return;
			}
			note.set("x", newX);
			note.set("y", newY);
			note.set("width", newWidth);
			note.set("height", newHeight);
			note.set("zIndex", index);
			workspace.markModified("notes");
			workspace.save(function(err) {
				if(err) {
					console.log(err);
					return res.send("Error!");
				}
				console.log("Saved");
				res.send("Saved");
			});
		}
	});
});

app.post('/getSharedNotes', ensureAuthenticated, function(req, res) {
	var user = req.user;
	var notes = user.sharedNotes;
	res.send(sharedTemplate({"notes": notes}));
});


app.post('/shareNote/:id', ensureAuthenticated, function(req, res) {
	var user = req.user;
	var noteId = req.params.id;
	var email = req.body.email;
	console.log(user);
	console.log(email);
	User.findOne({'google.email': email}, function(err, newuser) {
		var newUserId = newuser.google.userId;
		if(err) {
			console.log(err);
			res.send("Error!");
			return;
		}
		if(!newuser) {
			res.send("User not found!");
			return;
		}
		NoteModel.findById(noteId, function(err, note) {
			if(err) {
				console.log(err);
				return res.send("Error!");
			}
			if(!note) {
				res.send("Note not found!");
				return;
			}
			if(note.users.indexOf(user.google.userId)<0) {
				res.send("Not Authorized!");
				return;
			}
			note.users.push(newUserId);
			note.markModified("users");
			newuser.notes.push({source:"shared", sourceTitle:"shared", noteId:note.id, title: note.title});
			newuser.notifs.push("New note " + note.title+" was shared with you by "+user.google.email);
			newuser.markModified("notes");
			newuser.markModified("notifs");
			note.save(function(err) {
				if(err) {
					console.log(err);
					return res.send("Error!");
				}
				newuser.save(function(err) {
					if(err) {
						res.send("Error!");
						return console.log(err);
					}
					res.send("Shared " + note.title);
				});
			});
		});
	});
});
app.post('/shareWorkspace/:id', ensureAuthenticated, function(req, res) {
	var user = req.user;
	var workspaceId = req.params.id;
	var email = req.body.email;
	if(workspaceId==user.home) {
		res.send("Not allowed.");
		return;
	}
	User.findOne({'google.email': email}, function(err, newuser) {
		if(err) {
			console.log(err);
			res.send("Error!");
			return;
		}
		if(!newuser) {
			res.send("User not found!");
			return;
		}
		var newUserId = newuser.google.userId;
		Workspace.findById(workspaceId, function(err, workspace) {
			if(err) {
				console.log(err);
				res.send("Error!");
				return;
			}
			if(!workspace) {
				res.send("Workspace not found!");
				return;
			}
			if(workspace.user!=user.google.userId) {
				res.send("Not Authorized!");
				return;
			}
			console.log("share pls");
			//Duplicate workspace
			workspace._id = mongoose.Types.ObjectId();
			workspace.isNew = true;
			workspace.user = newUserId;
			workspace.save(function(err) {
				if(err) {
					console.log(err);
					return res.send("Error!");
				}
				forEachNext(workspace.notes, 0, function(noteData, index, next) {
					var noteId = noteData.noteId;
					NoteModel.findById(noteId, function(err, note) {
						if(err) {
							console.log(err);
							res.send("Error!");
							return;
						}
						if(!note) {
							res.send("Note not found!");
							return;
						}
						if(note.users.indexOf(user.google.userId)<0) {
							next();
						}
						note.users.push(newUserId);
						note.markModified("users");
						newuser.notes.push({source:workspace.id, sourceTitle: workspace.name, noteId:note.id, title: note.title});
						note.save(function(err) {
							if(err) {
								console.log(err);
								return res.send("Error!");
							}
							res.send("Shared " + note.title);
							next();
						});
					});
				}, function() {
					newuser.notifs.push("Workspace " + workspace.name+" was shared with you by "+user.google.email);
					newuser.markModified("notifs");
					newuser.markModified("notes");
					newuser.save(function(err) {
						console.log("Shared with all!");
						res.send("Shared " + workspace.name);
					});
				});
			});
		});
	});
});
app.post('/pullNote/:id', ensureAuthenticated, function(req, res) {
	var user = req.user;
	var workspaceId = req.params.id;
	var noteId = req.body.id;
	Workspace.findById(workspaceId, function(err, workspace) {
		if(err) {
			console.log(err);
			res.send("Error!");
			return;
		}
		if(!workspace) {
			res.send("Workspace not found!");
			return;
		}
		if(workspace.user!=user.google.userId) {
			res.send("Not Authorized!");
			return;
		}
		var noteData = workspace.notes.filter(function(obj) {
			return obj.noteId==noteId;
		})[0];
		if(noteData) {
			noteData.stored = false;
			workspace.markModified("notes");
			workspace.save(function(err) {
				if(err) {
					console.log(err);
					res.send("Error!");
					return;
				}
				NoteModel.findById(noteId, function(err, note) {
					if(err) {
						console.log(err);
						res.send("Error!");
						return;
					}
					if(!note) {
						res.send("Note not found!");
						return;
					}
					if(note.users.indexOf(user.google.userId)<0) {
						res.send("Not Authorized!");
						return;
					}
					note.x = noteData.x;
					note.y = noteData.y;
					note.width = noteData.width;
					note.height = noteData.height;
					note.zIndex = noteData.zIndex;
					getHTMLNote(note, user, function(err, content) {
						if(err) {
							console.log(err);
							res.send("There was an error!");
						}
						else {
							res.send(content);
						}
					});
				});
			});
		}
		else {
			res.send("No note found!");
		}
	});
});
app.post('/storeNote/:id', ensureAuthenticated, function(req, res) {
	var user = req.user;
	var workspaceId = req.params.id;
	var noteId = req.body.id;
	Workspace.findById(workspaceId, function(err, workspace) {
		if(err) {
			console.log(err);
			res.send("Error!");
			return;
		}
		if(!workspace) {
			res.send("Workspace not found!");
			return;
		}
		if(workspace.user!=user.google.userId) {
			res.send("Not Authorized!");
			return;
		}
		var note = workspace.notes.filter(function(obj) {
			return obj.noteId==noteId;
		})[0];
		if(note) {
			note.stored = true;
			workspace.markModified("notes");
			workspace.save(function(err) {
				if(err) {
					console.log(err);
					res.send("Error!");
					return;
				}
				res.send("Stored!");
			});
		}
		else {
			res.send("No note found!");
		}
	});
});
app.post('/getStored/:id', ensureAuthenticated, function(req, res) {
	var workspaceId = req.params.id;
	var user = req.user;
	Workspace.findById(workspaceId, function(err, workspace) {
		if(err) {
			console.log(err);
			res.send("Error!");
		}
		if(!workspace) {
			res.send("Workspace not found!");
			return;
		}
		if(workspace.user!=user.google.userId) {
			res.send("Not Authorized!");
			return;
		}
		var workspacenotes = [];
		var othernotes = [];
		forEachNext(workspace.notes, 0, function(noteData, index, next) {
			workspacenotes.push({type:"notel", data:{title:noteData.title, data:noteData.noteId}});
			next();
		}, function() {
			console.log("done1");
			forEachNext(user.notes, 0, function(noteData, index2, next2) {
				var worksp = othernotes.filter(function(obj) {
					return obj.work==noteData.source;
				})[0];
				if(!worksp) {
					worksp = {work:noteData.source, title: noteData.sourceTitle, notes:[]};
					othernotes.push(worksp)
				}
				worksp.notes.push({type:"notel", data:{title:noteData.title, data:noteData.noteId}});
				next2();
			}, function() {
				res.send(storedTemplate({worknotes:workspacenotes, othnotes:othernotes}));
			});
		});
	});
});
app.post('/removeNote/:id', ensureAuthenticated, function(req, res) {
	var user = req.user;
	var workspaceId = req.params.id;
	var noteId = req.body.id;
	Workspace.findById(workspaceId, function(err, workspace) {
		if(err) {
			console.log(err);
			res.send("Error!");
			return;
		}
		if(!workspace) {
			res.send("Workspace not found!");
			return;
		}
		if(workspace.user!=user.google.userId) {
			res.send("Not Authorized!");
			return;
		}
		NoteModel.findById(noteId, function(err, note) {
			if(err) {
				console.log(err);
				return res.send("Error!");
			}
			if(!note) {
				res.send("Note not found!");
				return;
			}
			if(note.users.indexOf(user.google.userId)<0) {
				res.send("Not Authorized!");
				return;
			}
			workspace.notes.pull({"noteId":noteId});
			workspace.markModified("notes");
			workspace.save(function(err) {
				if(err) {
					console.log(err);
					res.send("Error!");
				}
				else {
					res.send("Deleted!");
				}
			});
		});
	});
});
app.get('/createWorkspace/:name', ensureAuthenticated, function(req, res) {
	var user = req.user;
	var name = req.params.name;
	var note = new Note.TextNote("Welcome to Intregrid!", "This is your homepage to the Internet!");
	note.users.push(user.google.userId);
	var noteModel = new NoteModel(note);
	noteModel.save(function(err) {
		if(err) return done(err);
		var workspace = new Workspace({
			name: name,
			notes: [{
				noteId: noteModel.id,
				title: noteModel.title,
				stored: false,
				x: 0,
				y: 0,
				width: 20,
				height: 20,
				zIndex: 0
			}],
			user: user.google.userId,
			storage: {
				x:80,
				y:20,
				height: 30,
				width: 20,
				zIndex: 1
			}
		});
		workspace.save(function(err) {
			if(err) {
				console.log(err);
				res.send("Error!");
				return;
			}
			user.workspaces.push(workspace.id);
			user.notes.push({source:workspace.id, sourceTitle: workspace.name, noteId:noteModel.id, title:noteModel.title});
			user.markModified("workspaces");
			user.markModified("notes");
			user.save(function(err) {
				res.redirect('/home/'+workspace.id);
			});
		});
	});
});
app.post('/createNote/:id', ensureAuthenticated, function(req, res) {
	var user = req.user;
	var type = req.body.type;
	var title = req.body.title;
	if(title.length==0) {
		title = "Untitled";
	}
	var content = req.body.content;
	var workspaceId = req.params.id;
	Workspace.findById(workspaceId, function(err, workspace) {
		if(err) {
			console.log(err);
			res.send("Error!");
			return;
		}
		if(!workspace) {
			res.send("Workspace not found!");
			return;
		}
		if(workspace.user!=user.google.userId) {
			res.send("Not Authorized!");
			return;
		}
		var noteS = Note.NoteBuilder(type, title, content);
		if(noteS) {
			noteS.zIndex = req.body.zIndex;
			noteS.users.push(user.google.userId);
			var note = new NoteModel(noteS);
			note.save(function(err) {
				if(err) {
					console.log(err);
					res.send("Error!");
				}
				workspace.notes.push({noteId:note.id, 
					"title":note.title,
					"stored":false,
					"x":0,
					"y":0,
					"width":20,
					"height":20,
					"zIndex":0
				});
				workspace.markModified("notes");
				workspace.save(function(err) {
					if(err) {
						console.log(err);
						res.send("Error!");
					}
					else {
						user.notes.push({source:workspace.id, sourceTitle: workspace.name, noteId:noteModel.id, title: noteModel.title});
						user.markModified("notes");
						user.save(function(err) {
							if(err) {
								console.log(err);
								res.send("Error!");
							}
							getHTMLNote(note, user, function(err, result) {
								if(err) return console.log(err);
								res.send(result);
							});
						});
					}
				});
			});
		}
		else {
			res.send("Error! The note was misformed!");
		}
	});
});
app.get('/login', function(req, res){
	res.redirect('/auth/google');
});
app.get('/logout', function(req, res){
	req.logout();
	res.redirect('/');
});
app.get('/update', function(req, res){
	updateTemplates();
});
app.get('/user', function(req, res){
	res.send(req.user);
});
http.listen(3000, function(){
	console.log('listening on *:3000');
});