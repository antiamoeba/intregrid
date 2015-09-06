var Delta = require('rich-text').Delta;
exports.Server = function(content) {
	this.version = 0;
	this.state = new Delta();
	if(content) {
		this.state = new Delta(JSON.parse(content));
	}
	this.changes = [];
	this.clients = [];
	this.processArr = [];
	this.processing = false;
	this.broadcast = function(data, cl) {
		this.clients.forEach(function(client) {
			if(cl!=client) {
				client.sendMessage(data);
			}
			else {
				client.sendMessage({version:data.version});
			}
		});
	};
	this.getState = function() {
		return this.state;
	}
	this.onConnection = function(client) {
		this.clients.push(client);
		client.sendMessage({version:this.version, state: this.state});
	}
	this.onDisconnect = function(client) {
		//console.log("remove");
	}
	this.updateState = function() {
		if(this.processArr.length>0) {
			var proc = this.processArr.shift();
			data = proc.data;
			client = proc.client;
			if(!data.err) {
				var updateVersion = data.version;
				var change = new Delta(data.change);
				console.log(JSON.stringify(data));
				for(var i=updateVersion;i<this.changes.length;i++) {
					var update = this.changes[i].update;
					if(this.changes[i].client!=client) {
						change = update.transform(change, true);
					}
				}
				console.log("post-change:"+JSON.stringify(data));
				this.changes[this.version] = {update:change,client:client};
				this.state = this.state.compose(change);
				this.version++;
				this.broadcast({version:this.version, change:change}, client);
			}
			else {
				console.log(data);
			}
			this.updateState();
		}
		else {
			this.processing = false;
		}
	}
	this.updateCheck = function() {
		if(!this.processing) {
			this.processing = true;
			this.updateState();
		}
	}
	this.onMessage = function(client, data) {
		if(data.err=="sync") {
			client.sendMessage({version:this.version, state:this.state});	
		}
		else {
			this.processArr.push({client:client, data:data});
			this.updateCheck();
		}
	}
}