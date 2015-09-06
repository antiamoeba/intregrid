Editor = function() {
	this.version = -1;
	this.updateQueue = [];
	this.persChanges = [];
	this.processing = false;
	this.updateData= function() {
		if(this.updateQueue.length>0) {
			var update = this.updateQueue.shift();
			if(this.version==update.version-1) {
				if(update.change) {
					var change = new Delta(update.change);
					this.persChanges.forEach(function(pchange) {
						change = pchange.transform(change, true);
					});
					this.updateContents(change);
				}
				else {
					this.persChanges.shift();
				}
				this.version = update.version;
			}
			else {
				console.log(this.version+";"+update.version);
				console.log("We're out of sync!");
				this.sendMessage({err:"sync"});
			}
			this.updateData();
		}
		else {
			this.processing = false;
		}
	}
	this.updateCheck = function() {
		if(!this.processing) {
			this.processing = true;
			this.updateData();
		}
	}
	this.onMessage = function(delta) {
		delta = JSON.parse(delta.data);
		if(delta.state) {
			this.updateQueue = [];
			this.setContents(delta.state);
			this.version = delta.version;
		}
		else if(delta.err) {
			console.log(delta.err);
		}
		else {
			this.updateQueue.push({version:delta.version, change:delta.change});
			this.updateCheck();
		}
	}.bind(this);
	this.sendUpdate = function(delta) {
		this.persChanges.push(new Delta(delta));
		this.sendMessage({version:this.version,change:delta});
	}
}