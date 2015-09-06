//Operational Transformation test
var express = require('express');
var app = express();
var ws = require('ws');
var http = require('http').Server(app);
var Note = require('./antot');
//Websocket
var browserChannel = require("browserchannel").server;
app.use(browserChannel(function(client,req) {
	ns.connection(client);
}));
Client = function(client, server) {
	this.client = client;
	this.server = server;
	this.client.on("message", function(data) {
		this.server.onMessage(this, data);
	}.bind(this));
	this.client.on("close", function() {
		this.server.onDisconnect(this);
	}.bind(this));
	this.sendMessage = function(data) {
		client.send(JSON.stringify(data));
	}
}
var NoteServer = function() {
	this.data = "asdf";
	Note.Server.call(this);
	this.connection = function(client) {
		client = new Client(client, this);
		this.onConnection(client);
	}.bind(this);
}
var ns = new NoteServer();
app.get('/home', function(req, res) {
	res.sendFile(__dirname+'/ot.html');
});
app.use(express.static(__dirname+'/public'));
http.listen(3000, function(){
	console.log('listening on *:3000');
});