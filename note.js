var creds = require('./credentials');
var sanitizeHtml = require('sanitize-html');
var marked = require('marked');
var Handlebars = require('handlebars');
var fs = require('fs');
var userTemplate;
var codeTemplate;
fs.readFile('static/'+'user.html', function(err, html) {
	if(err) {
		console.log('Error reading user file: ' + err);
		return;
	}
	userTemplate = Handlebars.compile(html+"");
});
fs.readFile('static/'+'code.html', function(err, html) {
	if(err) {
		console.log('Error reading code file: ' + err);
		return;
	}
	codeTemplate = Handlebars.compile(html+"");
});
marked.setOptions({
	renderer: new marked.Renderer(),
	gfm: true,
	tables: true,
	breaks: true,
	pedantic: false,
	sanitize: true,
	smartLists: true,
	smartypants: false
});
exports.Note = function(title, content, type, subType) {
	this.title = title;
	this.content = content;
	this.typeNote = type;
	this.subType = subType;
	this.stored = false;
	this.users = [];
};
var google = require('googleapis');
var gmail = google.gmail('v1');
var googleAuth = require('google-auth-library');
var auth = new googleAuth();
exports.GmailNote = function() {
	exports.Note.call(this, "Gmail", "Loading...", "gmail", "");
};
exports.TextNote = function(title, content) {
	exports.Note.call(this, title, content, "text", "");
};
exports.MarkdownNote = function(title) {
	exports.Note.call(this, title, "", "markdown", "");
};
exports.UserNote = function(title) {
	exports.Note.call(this, title, "", "user", "");
};
exports.CodeNote = function(title) {
	exports.Note.call(this, title, "", "code", "javascript");
};
exports.NoteBuilder = function(type, title, content) {
	console.log(type);
	if(type==="text") {
		return new exports.TextNote(title, content);
	}
	else if(type==="gmail") {
		return new exports.GmailNote();
	}
	else if(type==="user") {
		return new exports.UserNote(title);
	}
	else if(type==="markdown") {
		return new exports.MarkdownNote(title);
	}
	else if(type==="code") {
		return new exports.CodeNote(title);
	}
	else {
		return null;
	}
};
exports.handleContent = function(note, user, callback) {
	if(note.typeNote==="text") {
		var output = note.content;
		output = sanitizeHtml(output, {
			allowedTags: [ 'b', 'i', 'em', 'strong', 'a', 'img', 'div', 'ol', 'li', 'span', 'u'],
			allowedAttributes: {
				'a': [ 'href' ],
				'img': [ 'src' ],
				'div': ['style'],
				'span': ['style'],
				'li': ['style']
			}
		});
		callback(null, output);
	}
	else if(note.typeNote==="markdown") {
		var output = note.content;
		output = marked(output);
		callback(null, output);
	}
	else if(note.typeNote==="gmail") {
		Gmail(user, callback);
	}
	else if(note.typeNote==="user") {
		var output = note.content;
		output = userTemplate({noteId: note.id});
		callback(null, output);
	}
	else if(note.typeNote==="code") {
		var output = note.content;
		var subtype = note.subType;
		output = codeTemplate({output: output, noteId: note.id, subtype: subtype});
		callback(null, output);
	}
	else {
		callback("Unknown type.", null);
	}
};
function Gmail(user, callback) {
	var oauth2Client = new auth.OAuth2(creds.google_client_id, creds.google_client_id, "/home");
	oauth2Client.credentials = {
		access_token: user.google.accessToken,
		refresh_token: user.google.refreshToken
	};
	var auth2 = oauth2Client;
	gmail.users.threads.list({
		auth: auth2,
		userId: 'me',
		maxResults: 10,
		labelIds: ['IMPORTANT', 'UNREAD']
	}, function(err, response) {
		var output;
		if (err) {
			callback(err);
			return;
		}
		var threads = response.threads;
		if (threads.length == 0) {
			output = 'No threads found.';	
			callback(null, output);
			return;
		} else {
			output = "";
			forEachNext(threads, 0, function(thread, index, next) {
		    	gmail.users.threads.get({
		    		auth: auth2,
		    		userId: 'me',
		    		id: thread.id
		    	}, function(err2, response2) {
		    		if(err) { 
		    			callback(err); 
		    			return;
		    		}
		    		if(!response2) {
		    			callback(null, "No messages found.");
		    			return;
		    		}
		    		var messages = response2.messages;
		    		var senders = [];
		    		var subject;
		    		var title = "";
		    		var length = 0;
		    		forEachNext(messages, 0, function(message, mindex, mnext) {
	    				forEachNext(message.payload.headers, 0, function(header, hindex, hnext) {

	    					if((message.historyId==thread.historyId) && (header.name=="Subject")) {
	    						subject = header.value;
	    					}
	    					if(header.name=="From") {
	    						if(length==0) { 
	    							title+=header.value.trim();
	    						}
	    						else {
	    							title+=", "+header.value.trim();
	    						}
	    						length++;
	    					}
	    					hnext();
	    				}, function() {
	    					mnext();
	    				});
		    		}, function() {
		    			//output.push({senders:senders, subject:subject, messages: messages.length, snippet: response2.snippet});
		    			if(title.length>100) {
		    				title = title.substring(0,100) + "...";
		    			}
		    			if(length>1) {
		    				title = title+"("+length+")";
		    			}
		    			title = sanitizeHtml(title, {
							allowedTags: []
						});
		    			output += "<div class='subnote'>";
		    			output += title;
		    			output += "</div>\n";
			    		next();
		    		});
		    	});
			}, function() {
				callback(null, output);
			});
		}
	});
}
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