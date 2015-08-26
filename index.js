var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var fs = require('fs');
var mongoose = require('mongoose');
var Handlebars = require('handlebars');
var creds = require('./credentials');
var Note = require('./note');
mongoose.connect('mongodb://localhost/integrid');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function (callback) {
	console.log("opened!");
	var userSchema = mongoose.Schema({
		google: {
			userId: String,
			accessToken: String,
			refreshToken: String
		},
		twitter: {
			userId: String,
			accessToken: String,
			tokenSecret: String
		},
		workspaces: [String]
	});
	var workspaceSchema = mongoose.Schema({
		name: String,
		notes: [{
			title: String,
			x: Number,
			y: Number,
			width: Number,
			height: Number,
			content: String,
			typeNote: String,
			subType: String,
			zIndex: Number,
			stored: Boolean
		}],
		users: [String]
	});
	Workspace = mongoose.model('Workspace', workspaceSchema);
	User = mongoose.model('User', userSchema);
});
var passport = require('passport');
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
var TwitterStrategy = require('passport-twitter');
var http = require('http').Server(app);
var Twitter = require('twitter');
var User;
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({secret: "dogfish", resave:false}));
app.use(passport.initialize());
app.use(passport.session());
var template;
var noteTemplate;
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
						user.save(function(err) {
							if (err) return done(err);
							return done(null,user);
						});
					}
					else {
						var nuser = new User();
						nuser.google.userId = profile.id;
						nuser.google.accessToken = accessToken;
						nuser.google.refreshToken = refreshToken;
						var workspace = new Workspace("General", [], [profile.id]);
						var note = new Note.TextNote("Welcome to Intregrid!", "This is your homepage to the Internet!");
						var gmailnote = new Note.GmailNote();
						workspace.notes.push(note);
						workspace.notes.push(gmailnote);
						workspace.markModified("notes");
						workspace.save(function(err) {
							if(err) return done(err);
							nuser.workspaces = [workspace.id];
							nuser.markModified("workspaces");
							nuser.save(function(err) {
								return done(null, nuser);
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
						var workspace = new Workspace("General", [], [profile.id]);
						var note = new Note.TextNote("Welcome to Intregrid!", "This is your homepage to the Internet!");
						var gmailnote = new Note.GmailNote();
						workspace.notes.push(note);
						workspace.notes.push(gmailnote);
						workspace.markModified("notes");
						workspace.save(function(err) {
							if(err) return done(err);
							nuser.workspaces.push(workspace.id);
							nuser.markModified("workspaces");
							nuser.save(function(err) {
								return done(null, nuser);
							});
						});
					});
				}
			}
		});
	}
));
passport.use(new TwitterStrategy({
		consumerKey: creds.tw_client_id,
		consumerSecret: creds.tw_client_secret,
		callbackURL: "http://127.0.0.1:3000/connect/twitter/callback",
		passReqToCallback : true
	},
	function(req, accessToken, tokenSecret, profile, done) {
		process.nextTick(function() {
			if(req.user) {
				console.log("we have a user!");
				var user = req.user;
				user.twitter.userId=profile.id;
				user.twitter.accessToken = accessToken;
				user.twitter.tokenSecret = tokenSecret;
				user.save(function(err) {
					if(err) return done(err);
					return done(null, user);
				})
			}
			else {
				var user = {
					userId:profile.id,
					accessToken: accessToken,
					tokenSecret: tokenSecret
				};
				return done(null,user);
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
function getTweets(client, callback) {
	client.get('statuses/home_timeline', function(err, tweets, response) {
		if(err) {
			callback(err);
			return;
		}
		callback(null, tweets);
	});
}
function ensureAuthenticated(req, res, next) {
	if (req.isAuthenticated()) { return next(); }
	res.redirect('/auth/google');
}

//Google authentication
app.get('/auth/google', passport.authenticate('google', { scope: ['profile','https://www.googleapis.com/auth/gmail.readonly'] }), function(req, res){});
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), function(req, res) {
	res.redirect('/home');
});

//Twitter authorization
app.get('/connect/twitter', passport.authorize('twitter'));
app.get('/connect/twitter/callback', passport.authorize('twitter', { failureRedirect : '/home' }), function(req, res) {
	if(req.account) {
		console.log("here");
		var twit = req.account;
		var user = req.user;
		user.twitter.userId=twit.userId;
		user.twitter.accessToken = twit.accessToken;
		user.twitter.tokenSecret = twit.tokenSecret;
		user.save(function(err) {
			if(err) console.log(err);
			res.redirect('/home');
		});
	}
	else {
		res.redirect('/home');
	}
});

function getHTMLNote(note, user, callback) {
	var obj = {};
	obj.title = note.title;
	obj.x = note.x;
	obj.y = note.y;
	obj.width = note.width;
	obj.height = note.height;
	obj.id = note.id;
	obj.type = note.typeNote;
	obj.zIndex = note.zIndex;
	Note.handleContent(note, user, function(err, content) {
		if(err) {
			console.log("error!");
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
app.get('/home/:id', ensureAuthenticated, function(req, res){
	var workspaceID = req.param.id;
	var user = req.user;
	Workspace.findById(workspaceID, function(err, workspace) {
		if(err) {
			console.log(err);
			res.send("Error!");
			return;
		}
		if(workspace.users.indexOf(user.google.userId)>0) {
			res.send("Not Authorized!");
			return;
		}
		var notes = [];
		forEachNext(workspace.notes, 0, function(note, index, next) {
			var obj = {};
			obj.title = note.title;
			obj.x = note.x;
			obj.y = note.y;
			obj.width = note.width;
			obj.height = note.height;
			obj.id = note.id;
			obj.type = note.typeNote;
			obj.zIndex = note.zIndex;
			obj.content = "Loading...";
			notes.push(obj);
			next();
		}, function() {
			var data = {"notes":notes};
			var result = template(data);
			res.send(result);
		});
	});
});
app.post('/getNote/:id', ensureAuthenticated, function(req, res) {
	var user = req.user;
	var workspaceId = req.params.id;
	var noteId = req.body.id;
	Workspace.findById(workspaceId, function(err, workspace) {
		if(err) {
			console.log(err);
			res.send("Error!");
			return;
		}
		if(workspace.users.indexOf(user.google.userId)>0) {
			res.send("Not Authorized!");
			return;
		}
		var notes = workspace.notes.filter(function(obj) {
			return obj.id == noteId;
		});
		if(notes[0]) {
			var note = notes[0];
			Note.handleContent(note, user, function(err, content) {
				if(err) {
					console.log("error!");
					console.log(err);
					res.send("There was an error!");
				}
				else {
					res.send(content);
				}
			});
		}
		else {
			res.send("No note found!");
		}
	});
});
app.post('/updateGeology', ensureAuthenticated, function(req, res){
	var noteId = req.body.id;
	var newX = req.body.x;
	var newY = req.body.y;
	var newWidth = req.body.width;
	var newHeight = req.body.height;
	var index = req.body.zIndex;
	var user = req.user;
	Workspace.findById(workspaceId, function(err, workspace) {
		if(err) {
			console.log(err);
			res.send("Error!");
			return;
		}
		if(workspace.users.indexOf(user.google.userId)>0) {
			res.send("Not Authorized!");
			return;
		}
		var notes = workspace.notes.filter(function(obj) {
			return obj.id == noteId;
		});
		if(notes[0]) {
			var note = notes[0];
			note.set("x", newX);
			note.set("y", newY);
			note.set("width", newWidth);
			note.set("height", newHeight);
			note.set("zIndex", index);
			workspace.save(function(err) {
				if(err) {
					console.log(err);
					return res.send("Error!");
				}
				console.log("Saved "+note.title);
				res.send("Saved "+note.title);
			});
		}
		else {
			res.send("Note not found.");
		}
	});

});

app.post('/updateUserText', ensureAuthenticated, function(req, res) {
	var noteId = req.body.id;
	var content = req.body.text;
	var user = req.user;
	var notes = user.notes.filter(function(obj) {
		return obj.id == noteId;
	});
	if(notes[0]!=undefined&&notes[0].typeNote=="user"||notes[0].typeNote=="markdown"||notes[0].typeNote=="html"||notes[0].typeNote=="code") {
		var note = notes[0];
		note.set("content", content);
		user.save(function(err) {
			if(err) {
				console.log(err);
				res.send("Error!");
			}
			else {
				console.log("Saved "+note.title);
				res.send("Saved "+note.title);
			}
		});
	}
	else {
		res.send("Note not found.");
	}
});
app.post('/deleteNote', ensureAuthenticated, function(req, res) {
	var user = req.user;
	var noteId = req.body.id;
	user.notes.pull({_id: noteId});
	user.save(function(err) {
		if(err) {
			console.log(err);
			res.send("Error!");
		}
		else {
			res.send("Deleted!");
		}
	});
});
app.post('/createNote', ensureAuthenticated, function(req, res) {
	var user = req.user;
	var type = req.body.type;
	var title = req.body.title;
	var content = req.body.content;
	console.log(type+":"+title+":"+content+":"+req.body.zIndex);
	var note = Note.NoteBuilder(type, title, content);
	/*var max = 0;
	for(var i=0;i<user.notes.length;i++) {
		if(user.notes[i]ee)
	}*/
	/*var testnote2 = new Note.NoteBuilder("asdf", title, content);
	console.log(testnote2);*/
	if(note) {
		note.zIndex = req.body.zIndex;
		note = user.notes.create(note);
		user.notes.push(note);
		user.markModified("notes");
		user.save(function(err) {
			if(err) {
				console.log(err);
				res.send("Error!");
			}
			else {
				getHTMLNote(note, user, function(err, result) {
					if(err) return console.log(err);
					res.send(result);
				});
			}
		});
	}
	else {
		res.send("Error!");
	}
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
app.use(express.static(__dirname+'/public'));
http.listen(3000, function(){
	console.log('listening on *:3000');
});